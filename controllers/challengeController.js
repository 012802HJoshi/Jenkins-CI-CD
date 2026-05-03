const Challenge = require("../models/Challenge");
const ChallengeDay = require("../models/ChallengeDay");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");
const { gcsdelete } = require("../config/gcsdelete");

// GCS layout: challenges/<slug>/banner_male.<ext>, challenges/<slug>/banner_female.<ext>
const CHALLENGE_PLAN_GCS_PREFIX = "challenges";
const CHALLENGE_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const CHALLENGE_GOALS = new Set([
  "weight_loss",
  "muscle_building",
  "stay_fit",
  "mobility_relax",
]);
const MAX_DAYS_PER_WEEK = 7;

function challengeGcsFolder(slug) {
  const s = String(slug || "").trim();
  return `${CHALLENGE_PLAN_GCS_PREFIX}/${s}`;
}

function parseBoolean(value) {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function withForcedOriginalName(file, forcedName) {
  if (!file) return file;
  return { ...file, originalname: forcedName };
}

function extFromMime(mimetype) {
  if (!mimetype) return "jpg";
  if (mimetype.includes("png")) return "png";
  if (mimetype.includes("webp")) return "webp";
  return "jpg";
}

function parsePositiveInteger(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value).trim(), 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Multipart sends nested structures as JSON strings; parse before validating. */
function parseWeeksInput(raw) {
  if (raw == null) return { ok: true, weeks: undefined };
  if (Array.isArray(raw)) return { ok: true, weeks: raw };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, weeks: undefined };
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { ok: false, status: 400, message: "weeks must be a JSON array" };
      }
      return { ok: true, weeks: parsed };
    } catch {
      return { ok: false, status: 400, message: "weeks must be valid JSON" };
    }
  }
  return { ok: false, status: 400, message: "weeks must be an array or JSON string" };
}

/**
 * Enforces:
 * - weekNumber sequence is exactly 1..weeks.length
 * - non-last weeks have exactly 7 days; last week has 1..7 days
 * - day values across all weeks cover 1..durationDays exactly (unique, no gaps)
 * - each day has a positive integer `day` and a non-empty `name`
 */
function validateWeeksStructure(durationDays, weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return { ok: false, status: 400, message: "weeks must be a non-empty array" };
  }
  let totalDays = 0;
  for (let i = 0; i < weeks.length; i += 1) {
    const w = weeks[i];
    const wn = Number(w?.weekNumber);
    if (!Number.isInteger(wn) || wn !== i + 1) {
      return {
        ok: false,
        status: 400,
        message: `weeks[${i}].weekNumber must be ${i + 1} (got ${w?.weekNumber})`,
      };
    }
    const days = Array.isArray(w?.days) ? w.days : [];
    const isLast = i === weeks.length - 1;
    if (!isLast && days.length !== MAX_DAYS_PER_WEEK) {
      return {
        ok: false,
        status: 400,
        message: `week ${wn} must contain exactly ${MAX_DAYS_PER_WEEK} days (only the last week may be partial)`,
      };
    }
    if (days.length < 1 || days.length > MAX_DAYS_PER_WEEK) {
      return {
        ok: false,
        status: 400,
        message: `week ${wn} must contain 1..${MAX_DAYS_PER_WEEK} days (got ${days.length})`,
      };
    }
    for (const d of days) {
      const n = Number(d?.day);
      if (!Number.isInteger(n) || n < 1) {
        return {
          ok: false,
          status: 400,
          message: `each day must have a positive integer "day" index (week ${wn})`,
        };
      }
      const name = String(d?.name || "").trim();
      if (!name) {
        return {
          ok: false,
          status: 400,
          message: `each day requires a non-empty "name" (week ${wn} day ${d?.day})`,
        };
      }
    }
    totalDays += days.length;
  }
  if (totalDays !== durationDays) {
    return {
      ok: false,
      status: 400,
      message: `total day count across weeks (${totalDays}) must equal durationDays (${durationDays})`,
    };
  }
  const allDays = weeks.flatMap((w) => (Array.isArray(w.days) ? w.days : []));
  const seen = new Set();
  for (const d of allDays) {
    const n = Number(d.day);
    if (n < 1 || n > durationDays) {
      return {
        ok: false,
        status: 400,
        message: `day values must be in 1..${durationDays} (got ${n})`,
      };
    }
    if (seen.has(n)) {
      return { ok: false, status: 400, message: `duplicate day index ${n} across weeks` };
    }
    seen.add(n);
  }
  for (let n = 1; n <= durationDays; n += 1) {
    if (!seen.has(n)) {
      return {
        ok: false,
        status: 400,
        message: `missing day ${n} in weeks (must cover 1..${durationDays})`,
      };
    }
  }
  return { ok: true };
}

/**
 * Walks weeks[].days[].exercises[], validates exerciseSlug presence, then resolves
 * every unique slug to its Exercise {_id, duration} with one query. Duration is read
 * from the Exercise (snapshot at create/update time); the API never accepts it from input.
 */
async function resolveExerciseSlugs(weeks) {
  const allSlugs = [];
  for (const w of weeks) {
    const days = Array.isArray(w?.days) ? w.days : [];
    for (const d of days) {
      const exercises = Array.isArray(d?.exercises) ? d.exercises : [];
      for (const e of exercises) {
        const slug = String(e?.exerciseSlug || "").trim();
        if (!slug) {
          return {
            ok: false,
            status: 400,
            message: "exerciseSlug is required for every exercise in weeks",
          };
        }
        allSlugs.push(slug);
      }
    }
  }
  if (allSlugs.length === 0) {
    return { ok: true, slugMeta: new Map() };
  }
  const uniqueSlugs = [...new Set(allSlugs)];
  const matched = await Exercise.find(
    { slug: { $in: uniqueSlugs } },
    { _id: 1, slug: 1, duration: 1, title: 1 }
  );
  const matchedSet = new Set(matched.map((e) => e.slug));
  const missing = uniqueSlugs.filter((s) => !matchedSet.has(s));
  if (missing.length) {
    return {
      ok: false,
      status: 400,
      message: "one or more exercise slugs do not exist",
      missing,
    };
  }
  const slugMeta = new Map(
    matched.map((e) => [
      e.slug,
      { id: e._id, duration: Number(e.duration) || 0, title: String(e.title || "") },
    ])
  );
  return { ok: true, slugMeta };
}

/** Strip exercises[] off weeks; produce metadata-only weeks for the Challenge doc. */
function buildMetaWeeks(weeks) {
  return weeks.map((w) => ({
    weekNumber: Number(w.weekNumber),
    days: (Array.isArray(w.days) ? w.days : []).map((d) => ({
      day: Number(d.day),
      name: String(d.name).trim(),
      muscleGroups: Array.isArray(d.muscleGroups) ? d.muscleGroups.map(String) : [],
      exerciseCount: Array.isArray(d.exercises) ? d.exercises.length : 0,
    })),
  }));
}

/** Build full ChallengeDay docs (one per day) for insertion into the workout_days collection. */
function buildDayDocs(challengeId, weeks, slugMeta) {
  const docs = [];
  for (const w of weeks) {
    const weekNumber = Number(w.weekNumber);
    const days = Array.isArray(w.days) ? w.days : [];
    for (const d of days) {
      const exercises = (Array.isArray(d.exercises) ? d.exercises : []).map((e) => {
        const slug = String(e.exerciseSlug).trim();
        const meta = slugMeta.get(slug) || {};
        return {
          exerciseId: meta.id,
          slug,
          // Title falls back to the Exercise's title if the client didn't supply an override.
          title: String(e.title || meta.title || "").trim(),
          sets: Number(e.sets) || 0,
          reps: String(e.reps || "").trim(),
          // Duration is always sourced from the Exercise; client-supplied duration is ignored.
          duration: Number(meta.duration) || 0,
        };
      });
      docs.push({
        challengeId,
        day: Number(d.day),
        weekNumber,
        name: String(d.name).trim(),
        muscleGroups: Array.isArray(d.muscleGroups) ? d.muscleGroups.map(String) : [],
        exercises,
      });
    }
  }
  return docs;
}

/**
 * For ?includeDays=true, fetches all ChallengeDay docs for the challenge and merges
 * full exercises[] back into the metadata weeks[].days[] structure.
 */
async function mergeFullDays(challenge, populate) {
  const obj = challenge.toObject ? challenge.toObject() : challenge;
  let q = ChallengeDay.find({ challengeId: obj._id }).sort({ day: 1 });
  if (populate) {
    q = q.populate("exercises.exerciseId", "title slug muscleGroup equipment thumbnailmale thumbnailfemale");
  }
  const dayDocs = await q.lean();
  const dayMap = new Map(dayDocs.map((d) => [d.day, d]));
  obj.weeks = (obj.weeks || []).map((w) => ({
    ...w,
    days: (w.days || []).map((meta) => {
      const full = dayMap.get(meta.day);
      return {
        ...meta,
        exercises: full?.exercises || [],
      };
    }),
  }));
  return obj;
}

async function uploadBanners({ folder, files, body }) {
  const result = {};
  const maleFile = files?.banner_male?.[0];
  const femaleFile = files?.banner_female?.[0];
  if (maleFile) {
    const ext = extFromMime(maleFile.mimetype);
    result.banner_male = await gcsupload(
      folder,
      withForcedOriginalName(maleFile, `banner_male.${ext}`),
      false
    );
  } else if (Object.prototype.hasOwnProperty.call(body, "banner_male")) {
    result.banner_male = String(body.banner_male || "").trim();
  }
  if (femaleFile) {
    const ext = extFromMime(femaleFile.mimetype);
    result.banner_female = await gcsupload(
      folder,
      withForcedOriginalName(femaleFile, `banner_female.${ext}`),
      false
    );
  } else if (Object.prototype.hasOwnProperty.call(body, "banner_female")) {
    result.banner_female = String(body.banner_female || "").trim();
  }
  return result;
}

async function createChallenge(req, res, next) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const name = String(body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, message: "name is required" });

    const slug = String(body.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, message: "slug is required" });

    const durationDays = parsePositiveInteger(body.durationDays);
    if (durationDays === null) {
      return res
        .status(400)
        .json({ ok: false, message: "durationDays must be a positive integer" });
    }

    let goal;
    if (body.goal != null && String(body.goal).trim() !== "") {
      goal = String(body.goal).trim();
      if (!CHALLENGE_GOALS.has(goal)) {
        return res.status(400).json({
          ok: false,
          message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
        });
      }
    }

    let difficulty;
    if (body.difficulty != null && String(body.difficulty).trim() !== "") {
      difficulty = String(body.difficulty).trim();
      if (!CHALLENGE_DIFFICULTIES.has(difficulty)) {
        return res.status(400).json({
          ok: false,
          message: "difficulty must be one of: beginner, intermediate, advanced",
        });
      }
    }

    let premium;
    if (Object.prototype.hasOwnProperty.call(body, "premium")) {
      premium = parseBoolean(body.premium);
      if (premium === undefined) {
        return res.status(400).json({ ok: false, message: "premium must be a boolean" });
      }
    }

    const wsResult = parseWeeksInput(body.weeks);
    if (!wsResult.ok) {
      return res.status(wsResult.status).json({ ok: false, message: wsResult.message });
    }
    const weeks = wsResult.weeks;
    if (!weeks) {
      return res.status(400).json({ ok: false, message: "weeks is required" });
    }

    const structCheck = validateWeeksStructure(durationDays, weeks);
    if (!structCheck.ok) {
      return res.status(structCheck.status).json({ ok: false, message: structCheck.message });
    }

    const refsResult = await resolveExerciseSlugs(weeks);
    if (!refsResult.ok) {
      return res.status(refsResult.status).json({
        ok: false,
        message: refsResult.message,
        ...(refsResult.missing?.length ? { missing: refsResult.missing } : {}),
      });
    }

    const existing = await Challenge.findOne({ slug }, { _id: 1 });
    if (existing) {
      return res.status(409).json({ ok: false, message: "slug already in use" });
    }

    const folder = challengeGcsFolder(slug);
    const banners = await uploadBanners({ folder, files: req.files, body });

    const metaWeeks = buildMetaWeeks(weeks);
    const challengeBody = {
      slug,
      name,
      durationDays,
      weeks: metaWeeks,
      ...(goal ? { goal } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(premium !== undefined ? { premium } : {}),
      banner_male: banners.banner_male || "",
      banner_female: banners.banner_female || "",
    };

    let created;
    try {
      created = await Challenge.create(challengeBody);
      const dayDocs = buildDayDocs(created._id, weeks, refsResult.slugMeta);
      if (dayDocs.length > 0) {
        await ChallengeDay.insertMany(dayDocs, { ordered: true });
      }
    } catch (err) {
      // Manual rollback: standalone MongoDB has no transactions.
      if (created?._id) {
        await Promise.allSettled([
          Challenge.deleteOne({ _id: created._id }),
          ChallengeDay.deleteMany({ challengeId: created._id }),
        ]);
      }
      throw err;
    }

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    return next(err);
  }
}

async function updateChallenge(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }

    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const n = String(body.name).trim();
      if (!n) return res.status(400).json({ ok: false, message: "name cannot be empty" });
      updates.name = n;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const s = String(body.slug).trim();
      if (!s) return res.status(400).json({ ok: false, message: "slug cannot be empty" });
      if (s !== challenge.slug) {
        const taken = await Challenge.findOne({ slug: s, _id: { $ne: id } }, { _id: 1 });
        if (taken) return res.status(409).json({ ok: false, message: "slug already in use" });
      }
      updates.slug = s;
    }

    if (Object.prototype.hasOwnProperty.call(body, "goal")) {
      const g = String(body.goal).trim();
      if (!CHALLENGE_GOALS.has(g)) {
        return res.status(400).json({
          ok: false,
          message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
        });
      }
      updates.goal = g;
    }

    if (Object.prototype.hasOwnProperty.call(body, "difficulty")) {
      const d = String(body.difficulty).trim();
      if (!CHALLENGE_DIFFICULTIES.has(d)) {
        return res.status(400).json({
          ok: false,
          message: "difficulty must be one of: beginner, intermediate, advanced",
        });
      }
      updates.difficulty = d;
    }

    if (Object.prototype.hasOwnProperty.call(body, "premium")) {
      const p = parseBoolean(body.premium);
      if (p === undefined) {
        return res.status(400).json({ ok: false, message: "premium must be a boolean" });
      }
      updates.premium = p;
    }

    // Schedule replacement: weeks + durationDays move together to keep invariants intact.
    const touchesSchedule =
      Object.prototype.hasOwnProperty.call(body, "weeks") ||
      Object.prototype.hasOwnProperty.call(body, "durationDays");

    let nextDayDocs = null;
    if (touchesSchedule) {
      const wsResult = parseWeeksInput(body.weeks);
      if (!wsResult.ok) {
        return res.status(wsResult.status).json({ ok: false, message: wsResult.message });
      }
      const weeks = wsResult.weeks;
      if (!weeks) {
        return res.status(400).json({
          ok: false,
          message: "weeks is required when updating schedule",
        });
      }
      const dd = parsePositiveInteger(body.durationDays);
      if (dd === null) {
        return res.status(400).json({
          ok: false,
          message: "durationDays must be a positive integer when updating schedule",
        });
      }
      const structCheck = validateWeeksStructure(dd, weeks);
      if (!structCheck.ok) {
        return res.status(structCheck.status).json({ ok: false, message: structCheck.message });
      }
      const refsResult = await resolveExerciseSlugs(weeks);
      if (!refsResult.ok) {
        return res.status(refsResult.status).json({
          ok: false,
          message: refsResult.message,
          ...(refsResult.missing?.length ? { missing: refsResult.missing } : {}),
        });
      }
      updates.durationDays = dd;
      updates.weeks = buildMetaWeeks(weeks);
      nextDayDocs = buildDayDocs(challenge._id, weeks, refsResult.slugMeta);
    }

    const nextSlug = Object.prototype.hasOwnProperty.call(body, "slug")
      ? String(body.slug).trim()
      : challenge.slug;
    const folder = challengeGcsFolder(nextSlug);
    const banners = await uploadBanners({ folder, files: req.files, body });
    if (banners.banner_male !== undefined) updates.banner_male = banners.banner_male;
    if (banners.banner_female !== undefined) updates.banner_female = banners.banner_female;

    if (Object.keys(updates).length === 0 && !nextDayDocs) {
      return res.status(400).json({ ok: false, message: "no updates provided" });
    }

    Object.assign(challenge, updates);
    await challenge.save();

    if (nextDayDocs) {
      // Replace the per-day docs in two steps. Standalone Mongo has no transactions,
      // so on insertMany failure we restore the old days so the challenge isn't left empty.
      const previous = await ChallengeDay.find({ challengeId: challenge._id }).lean();
      await ChallengeDay.deleteMany({ challengeId: challenge._id });
      try {
        if (nextDayDocs.length > 0) {
          await ChallengeDay.insertMany(nextDayDocs, { ordered: true });
        }
      } catch (err) {
        if (previous.length) {
          await ChallengeDay.insertMany(
            previous.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest),
            { ordered: false }
          ).catch(() => {});
        }
        throw err;
      }
    }

    return res.json({ ok: true, data: challenge });
  } catch (err) {
    return next(err);
  }
}

async function listChallenges(req, res, next) {
  try {
    const difficulty = String(req.query.difficulty || "").trim().toLowerCase();
    const goal = String(req.query.goal || "").trim();
    if (goal && !difficulty) {
      return res.status(400).json({
        ok: false,
        message: "difficulty is required when filtering by goal (indexed with difficulty)",
      });
    }
    if (difficulty && !CHALLENGE_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        ok: false,
        message: "difficulty must be one of: beginner, intermediate, advanced",
      });
    }
    if (goal && !CHALLENGE_GOALS.has(goal)) {
      return res.status(400).json({
        ok: false,
        message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
      });
    }

    const filter = {};
    if (difficulty) filter.difficulty = difficulty;
    if (goal) filter.goal = goal;

    const challenges = await Challenge.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id slug name goal premium difficulty durationDays banner_male banner_female")
      .lean();
    return res.json({ ok: true, data: challenges });
  } catch (err) {
    return next(err);
  }
}

async function getChallengesByDifficulty(req, res, next) {
  try {
    const difficulty = String(req.params.difficulty || "").trim().toLowerCase();
    if (!difficulty || !CHALLENGE_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        ok: false,
        message: "difficulty must be one of: beginner, intermediate, advanced",
      });
    }

    const goal = String(req.query.goal || "").trim();
    if (goal && !CHALLENGE_GOALS.has(goal)) {
      return res.status(400).json({
        ok: false,
        message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
      });
    }

    const filter = { difficulty };
    if (goal) filter.goal = goal;

    const challenges = await Challenge.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id slug name goal premium difficulty durationDays banner_male banner_female")
      .lean();
    return res.json({ ok: true, data: challenges });
  } catch (err) {
    return next(err);
  }
}

async function getChallengeBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, message: "slug is required" });

    const includeDays = parseBoolean(req.query.includeDays) === true;
    const populate = parseBoolean(req.query.populate) === true;

    const challenge = await Challenge.findOne({ slug });
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    const data = includeDays ? await mergeFullDays(challenge, populate) : challenge;
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getChallengeById(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }

    const includeDays = parseBoolean(req.query.includeDays) === true;
    const populate = parseBoolean(req.query.populate) === true;

    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    const data = includeDays ? await mergeFullDays(challenge, populate) : challenge;
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getChallengeDayByChallenge(challengeId, dayParam, populate) {
  const day = parsePositiveInteger(dayParam);
  if (day === null) {
    return { status: 400, body: { ok: false, message: "day must be a positive integer" } };
  }
  let q = ChallengeDay.findOne({ challengeId, day });
  if (populate) {
    q = q.populate(
      "exercises.exerciseId",
      "title slug muscleGroup equipment thumbnailmale thumbnailfemale videomale videofemale duration calories"
    );
  }
  const doc = await q;
  if (!doc) {
    return { status: 404, body: { ok: false, message: `day ${day} not found for this challenge` } };
  }
  return { status: 200, body: { ok: true, data: doc } };
}

async function getChallengeDayBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, message: "slug is required" });

    const challenge = await Challenge.findOne({ slug }, { _id: 1, durationDays: 1 });
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    const populate = parseBoolean(req.query.populate) !== false; // default true for day-detail
    const result = await getChallengeDayByChallenge(challenge._id, req.params.day, populate);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getChallengeDayById(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }
    const populate = parseBoolean(req.query.populate) !== false; // default true for day-detail
    const result = await getChallengeDayByChallenge(id, req.params.day, populate);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateChallengeDay(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }
    const day = parsePositiveInteger(req.params.day);
    if (day === null) {
      return res.status(400).json({ ok: false, message: "day must be a positive integer" });
    }

    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }
    if (day > challenge.durationDays) {
      return res.status(400).json({
        ok: false,
        message: `day ${day} exceeds durationDays (${challenge.durationDays})`,
      });
    }

    const dayDoc = await ChallengeDay.findOne({ challengeId: id, day });
    if (!dayDoc) {
      return res.status(404).json({ ok: false, message: `day ${day} not found for this challenge` });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dayUpdates = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const n = String(body.name).trim();
      if (!n) return res.status(400).json({ ok: false, message: "name cannot be empty" });
      dayUpdates.name = n;
    }
    if (Object.prototype.hasOwnProperty.call(body, "muscleGroups")) {
      const mg = Array.isArray(body.muscleGroups)
        ? body.muscleGroups.map(String)
        : typeof body.muscleGroups === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(body.muscleGroups);
              return Array.isArray(parsed) ? parsed.map(String) : [];
            } catch {
              return body.muscleGroups
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
          })()
        : [];
      dayUpdates.muscleGroups = mg;
    }

    let exerciseListReplaced = false;
    if (Object.prototype.hasOwnProperty.call(body, "exercises")) {
      let exercisesInput = body.exercises;
      if (typeof exercisesInput === "string") {
        try {
          exercisesInput = JSON.parse(exercisesInput);
        } catch {
          return res.status(400).json({ ok: false, message: "exercises must be a JSON array" });
        }
      }
      if (!Array.isArray(exercisesInput)) {
        return res.status(400).json({ ok: false, message: "exercises must be an array" });
      }
      // Reuse the same slug resolver shape: wrap in a fake weeks tree.
      const fakeWeeks = [{ weekNumber: 1, days: [{ day, name: "_", exercises: exercisesInput }] }];
      const refs = await resolveExerciseSlugs(fakeWeeks);
      if (!refs.ok) {
        return res.status(refs.status).json({
          ok: false,
          message: refs.message,
          ...(refs.missing?.length ? { missing: refs.missing } : {}),
        });
      }
      dayUpdates.exercises = exercisesInput.map((e) => {
        const slug = String(e.exerciseSlug).trim();
        const meta = refs.slugMeta.get(slug) || {};
        return {
          exerciseId: meta.id,
          slug,
          title: String(e.title || meta.title || "").trim(),
          sets: Number(e.sets) || 0,
          reps: String(e.reps || "").trim(),
          // Duration is sourced from the Exercise; client-supplied duration is ignored.
          duration: Number(meta.duration) || 0,
        };
      });
      exerciseListReplaced = true;
    }

    if (Object.keys(dayUpdates).length === 0) {
      return res.status(400).json({ ok: false, message: "no updates provided" });
    }

    Object.assign(dayDoc, dayUpdates);
    await dayDoc.save();

    // Mirror name/muscleGroups/exerciseCount onto the parent Challenge.weeks[].days[] meta.
    const metaPatch = {};
    if (dayUpdates.name !== undefined) metaPatch["weeks.$[w].days.$[d].name"] = dayUpdates.name;
    if (dayUpdates.muscleGroups !== undefined) {
      metaPatch["weeks.$[w].days.$[d].muscleGroups"] = dayUpdates.muscleGroups;
    }
    if (exerciseListReplaced) {
      metaPatch["weeks.$[w].days.$[d].exerciseCount"] = dayDoc.exercises.length;
    }
    if (Object.keys(metaPatch).length > 0) {
      await Challenge.updateOne(
        { _id: id },
        { $set: metaPatch },
        { arrayFilters: [{ "w.weekNumber": dayDoc.weekNumber }, { "d.day": day }] }
      );
    }

    return res.json({ ok: true, data: dayDoc });
  } catch (err) {
    return next(err);
  }
}

async function deleteChallenge(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }

    const challenge = await Challenge.findById(id).select("slug");
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    const folderPrefix = challengeGcsFolder(challenge.slug);
    await Promise.allSettled([
      gcsdelete(folderPrefix, false),
      ChallengeDay.deleteMany({ challengeId: id }),
    ]);
    await Challenge.deleteOne({ _id: id });

    return res.json({
      ok: true,
      message: "challenge deleted",
      data: { gcsPrefix: `${folderPrefix}/` },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createChallenge,
  updateChallenge,
  listChallenges,
  getChallengesByDifficulty,
  getChallengeById,
  getChallengeBySlug,
  getChallengeDayBySlug,
  getChallengeDayById,
  updateChallengeDay,
  deleteChallenge,
};
