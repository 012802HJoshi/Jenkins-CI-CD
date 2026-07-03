const Plan = require("../models/Plan");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload, gcsdelete } = require("../config/storage.js");

const PLAN_GCS_PREFIX = "plans";

function planGcsFolder(slug) {
  const s = String(slug || "").trim();
  return `${PLAN_GCS_PREFIX}/${s}`;
}

function parsePremiumString(value) {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (value === 1) return "true";
    if (value === 0) return "false";
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return "true";
  if (["false", "0", "no", "off"].includes(normalized)) return "false";
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
  if (mimetype.includes("gif")) return "gif";
  return "jpg";
}

function getPayload(req) {
  const p = req.body;
  return p && typeof p === "object" ? p : {};
}

const PLAN_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const PLAN_GOALS = new Set(["weight_loss", "muscle_building", "keep_fit", "get_toned", "mobility_relax"]);
const PLAN_FOCUS_AREAS = new Set(["Arms", "Abs", "Legs", "Back", "Chest", "Full Body"]);

function parseNonNegativeNumber(value, fallback) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseExerciseDuration(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeExercisesInput(raw) {
  if (raw == null) {
    return { ok: true, arr: [] };
  }

  let arr = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: true, arr: [] };
    }
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        return { ok: false, status: 400, message: "exercises must be valid JSON array when sent as string" };
      }
    } else {
      arr = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(arr)) {
    return { ok: false, status: 400, message: "exercises must be an array" };
  }

  return { ok: true, arr };
}

function extractExerciseLookup(item) {
  if (item == null) {
    return null;
  }
  if (typeof item === "object" && !Array.isArray(item)) {
    const duration = item.duration !== undefined && item.duration !== null && item.duration !== ""
      ? parseExerciseDuration(item.duration)
      : undefined;
    if (duration === null) {
      return null;
    }
    const sets = item.sets !== undefined && item.sets !== null && item.sets !== ""
      ? parseExerciseDuration(item.sets)
      : undefined;
    if (sets === null) {
      return null;
    }
    const reps = item.reps !== undefined && item.reps !== null && item.reps !== ""
      ? parseExerciseDuration(item.reps)
      : undefined;
    if (reps === null) {
      return null;
    }
    const id = String(item.exerciseId || item._id || "").trim();
    if (id && mongoose.isValidObjectId(id)) {
      return { kind: "id", value: id, duration, sets, reps };
    }
    const slug = String(item.exerciseSlug || item.slug || "").trim();
    if (slug) {
      return { kind: "slug", value: slug, duration, sets, reps };
    }
    return null;
  }
  return null;
}

/**
 * Resolves exercises from slugs and/or ids. Preserves order (including duplicates).
 * @returns {{ ok: true, entries: { exercise: import("mongoose").Types.ObjectId, slug: string, title: string, duration: number, category: string, thumbnailmale: string, thumbnailfemale: string }[] } | { ok: false, status: number, message: string }}
 */
async function resolvePlanExercises(raw) {
  const normalized = normalizeExercisesInput(raw);
  if (!normalized.ok) {
    return { ok: false, status: normalized.status, message: normalized.message };
  }
  const arr = normalized.arr;

  const lookups = [];
  for (const item of arr) {
    const key = extractExerciseLookup(item);
    if (!key) {
      return {
        ok: false,
        status: 400,
        message:
          "each exercise must be an object with duration and one of exerciseSlug/slug or exerciseId/_id",
      };
    }
    lookups.push(key);
  }

  if (!lookups.length) {
    return { ok: true, entries: [] };
  }

  const slugSet = new Set();
  const idSet = new Set();
  for (const key of lookups) {
    if (key.kind === "slug") {
      slugSet.add(key.value);
    } else {
      idSet.add(key.value);
    }
  }

  const bySlug = new Map();
  const byId = new Map();
  const exerciseProjection = { slug: 1, title: 1, category: 1, thumbnailmale: 1, thumbnailfemale: 1 };

  if (slugSet.size) {
    const docs = await Exercise.find({ slug: { $in: [...slugSet] } }, exerciseProjection).lean();
    for (const d of docs) {
      bySlug.set(d.slug, d);
    }
  }
  if (idSet.size) {
    const docs = await Exercise.find({ _id: { $in: [...idSet] } }, exerciseProjection).lean();
    for (const d of docs) {
      byId.set(String(d._id), d);
    }
  }

  const entries = [];
  for (const key of lookups) {
    const doc = key.kind === "slug" ? bySlug.get(key.value) : byId.get(key.value);
    if (!doc) {
      return {
        ok: false,
        status: 400,
        message: "one or more exercises were not found (check exercise slugs or ids)",
      };
    }
    entries.push({
      exercise: doc._id,
      slug: doc.slug,
      title: doc.title,
      duration: key.duration,
      sets: key.sets,
      reps: key.reps,
      category: doc.category,
      thumbnailmale: doc.thumbnailmale,
      thumbnailfemale: doc.thumbnailfemale,
    });
  }

  return { ok: true, entries };
}

async function createPlan(req, res, next) {
  try {
    const body = getPayload(req);
    const name = String(body.name || "").trim();
    const slug = String(body.slug || "").trim();
    const goalRaw = String(body.goal ?? "").trim();
    const difficultyRaw = String(body.difficulty ?? "").trim();

    if (!name) {
      return res.status(400).json({ ok: false, message: "name is required" });
    }
    if (!slug) {
      return res.status(400).json({ ok: false, message: "slug is required" });
    }
    if (!goalRaw || !PLAN_GOALS.has(goalRaw)) {
      return res.status(400).json({
        ok: false,
        message: "goal is required and must be one of: weight_loss, muscle_building, keep_fit, get_toned, mobility_relax",
      });
    }

    const focus_area_raw = body.focus_area !== undefined ? body.focus_area : body.focusArea;
    let focus_area;
    if (focus_area_raw != null && String(focus_area_raw).trim() !== "") {
      focus_area = String(focus_area_raw).trim();
      if (!PLAN_FOCUS_AREAS.has(focus_area)) {
        return res.status(400).json({
          ok: false,
          message: "focus_area must be one of: Arms, Abs, Legs, Back, Chest, Full Body",
        });
      }
    }

    const outcome = body.outcome !== undefined ? String(body.outcome) : "";

    let difficulty = "beginner";
    if (difficultyRaw) {
      if (!PLAN_DIFFICULTIES.has(difficultyRaw)) {
        return res.status(400).json({
          ok: false,
          message: "difficulty must be one of: beginner, intermediate, advanced",
        });
      }
      difficulty = difficultyRaw;
    }

    const duration = parseNonNegativeNumber(body.duration, 0);
    const calories = parseNonNegativeNumber(body.calories, 0);
    if (calories === null) {
      return res.status(400).json({ ok: false, message: "calories must be a non-negative number" });
    }

    if (duration === null) {
      return res.status(400).json({ ok: false, message: "duration must be a non-negative number" });
    }

    const exercisesResult = await resolvePlanExercises(body.exercises);
    if (!exercisesResult.ok) {
      return res.status(exercisesResult.status).json({ ok: false, message: exercisesResult.message });
    }
    const exerciseEntries = exercisesResult.entries;

    const exercises = exerciseEntries.map((e) => ({
      exercise: e.exercise,
      slug: e.slug,
      title: e.title,
      duration: e.duration,
      sets: e.sets,
      reps: e.reps,
      category: e.category,
      thumbnailmale: e.thumbnailmale,
      thumbnailfemale: e.thumbnailfemale
    }));

    let numberofExercises = parseNonNegativeNumber(body.numberofExercises, undefined);
    if (numberofExercises === null) {
      return res.status(400).json({ ok: false, message: "numberofExercises must be a non-negative number" });
    }
    if (numberofExercises === undefined) {
      numberofExercises = exercises.length;
    } else if (numberofExercises !== exercises.length) {
      return res.status(400).json({
        ok: false,
        message: "numberofExercises must match the length of exercises when both are provided",
      });
    }

    const description = body.description !== undefined ? String(body.description) : "";

    const folder = planGcsFolder(slug);
    const bannerMaleFile = req.files?.bannerImage_male?.[0];
    const squareMaleFile = req.files?.squareImage_male?.[0];
    const bannerFemaleFile = req.files?.bannerImage_female?.[0];
    const squareFemaleFile = req.files?.squareImage_female?.[0];
    const bannerMaleFromBody = String(body.bannerImage_male || "").trim();
    const squareMaleFromBody = String(body.squareImage_male || "").trim();
    const bannerFemaleFromBody = String(body.bannerImage_female || "").trim();
    const squareFemaleFromBody = String(body.squareImage_female || "").trim();

    let bannerImage_male = bannerMaleFromBody;
    let squareImage_male = squareMaleFromBody;
    let bannerImage_female = bannerFemaleFromBody;
    let squareImage_female = squareFemaleFromBody;

    if (bannerMaleFile) {
      const ext = extFromMime(bannerMaleFile.mimetype);
      bannerImage_male = await gcsupload(folder, withForcedOriginalName(bannerMaleFile, `banner_male.${ext}`), false);
    }
    if (squareMaleFile) {
      const ext = extFromMime(squareMaleFile.mimetype);
      squareImage_male = await gcsupload(folder, withForcedOriginalName(squareMaleFile, `square_male.${ext}`), false);
    }
    if (bannerFemaleFile) {
      const ext = extFromMime(bannerFemaleFile.mimetype);
      bannerImage_female = await gcsupload(
        folder,
        withForcedOriginalName(bannerFemaleFile, `banner_female.${ext}`),
        false
      );
    }
    if (squareFemaleFile) {
      const ext = extFromMime(squareFemaleFile.mimetype);
      squareImage_female = await gcsupload(
        folder,
        withForcedOriginalName(squareFemaleFile, `square_female.${ext}`),
        false
      );
    }

    if (!bannerImage_male || !squareImage_male || !bannerImage_female || !squareImage_female) {
      return res.status(400).json({
        ok: false,
        message:
          "bannerImage_male, squareImage_male, bannerImage_female, and squareImage_female are required (upload files or pass URLs in the body)",
      });
    }

    const premium = parsePremiumString(body.premium);
    if (body.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be true or false" });
    }

    const plan = await Plan.create({
      name,
      slug,
      description,
      outcome,
      difficulty,
      goal: goalRaw,
      ...(focus_area !== undefined ? { focus_area } : {}),
      bannerImage_male,
      bannerImage_female,
      squareImage_male,
      squareImage_female,
      duration,
      calories,
      numberofExercises,
      exercises,
      ...(premium !== undefined ? { premium } : {}),
    });

    return res.status(201).json({ ok: true, data: plan });
  } catch (err) {
    return next(err);
  }
}

async function getAPlanById(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid plan id" });
    }

    const plan = await Plan.findById(id).lean();

    if (!plan) {
      return res.status(404).json({ ok: false, message: "plan not found" });
    }

    const exerciseIds = [
      ...new Set(
        (plan.exercises || [])
          .map((item) => String(item.exercise || "").trim())
          .filter((value) => mongoose.isValidObjectId(value))
      ),
    ];
    const exercisesById = new Map();
    if (exerciseIds.length) {
      const exerciseDocs = await Exercise.find(
        { _id: { $in: exerciseIds } },
        { category: 1, thumbnailmale: 1, thumbnailfemale: 1 }
      ).lean();
      for (const doc of exerciseDocs) {
        exercisesById.set(String(doc._id), doc);
      }
    }

    plan.exercises = (plan.exercises || []).map((item) => {
      const exerciseDoc = exercisesById.get(String(item.exercise));
      return {
        ...item,
        category: item.category || exerciseDoc?.category || "",
        thumbnailmale: item.thumbnailmale || exerciseDoc?.thumbnailmale || "",
        thumbnailfemale: item.thumbnailfemale || exerciseDoc?.thumbnailfemale || "",
      };
    });

    return res.json({ ok: true, data: plan });
  } catch (err) {
    return next(err);
  }
}

async function getAPlanBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      return res.status(400).json({ ok: false, message: "invalid plan slug" });
    }

    const plan = await Plan.findOne({ slug }).lean();

    if (!plan) {
      return res.status(404).json({ ok: false, message: "plan not found" });
    }

    const exerciseIds = [
      ...new Set(
        (plan.exercises || [])
          .map((item) => String(item.exercise || "").trim())
          .filter((value) => mongoose.isValidObjectId(value))
      ),
    ];
    const exercisesById = new Map();
    if (exerciseIds.length) {
      const exerciseDocs = await Exercise.find(
        { _id: { $in: exerciseIds } },
        { category: 1, thumbnailmale: 1, thumbnailfemale: 1 }
      ).lean();
      for (const doc of exerciseDocs) {
        exercisesById.set(String(doc._id), doc);
      }
    }

    plan.exercises = (plan.exercises || []).map((item) => {
      const exerciseDoc = exercisesById.get(String(item.exercise));
      return {
        ...item,
        category: item.category || exerciseDoc?.category || "",
        thumbnailmale: item.thumbnailmale || exerciseDoc?.thumbnailmale || "",
        thumbnailfemale: item.thumbnailfemale || exerciseDoc?.thumbnailfemale || "",
      };
    });

    return res.json({ ok: true, data: plan });
  } catch (err) {
    return next(err);
  }
}

async function getAllPlans(req, res, next) {
  try {
    const difficulty = String(req.query.difficulty || "").trim();
    const goal = String(req.query.goal || "").trim();
    const focus_area_raw = req.query.focus_area || req.query.focusArea || "";
    const focus_area = String(focus_area_raw).trim();

    const filter = {};
    if (difficulty) {
      if (!PLAN_DIFFICULTIES.has(difficulty)) {
        return res.status(400).json({
          ok: false,
          message: "difficulty must be one of: beginner, intermediate, advanced",
        });
      }
      filter.difficulty = difficulty;
    }
    if (goal) {
      if (!PLAN_GOALS.has(goal)) {
        return res.status(400).json({
          ok: false,
          message: "goal must be one of: weight_loss, muscle_building, keep_fit, get_toned, mobility_relax",
        });
      }
      filter.goal = goal;
    }
    if (focus_area) {
      if (!PLAN_FOCUS_AREAS.has(focus_area)) {
        return res.status(400).json({
          ok: false,
          message: "focus_area must be one of: Arms, Abs, Legs, Back, Chest, Full Body",
        });
      }
      filter.focus_area = focus_area;
    }

    const plans = await Plan.find(filter)
      .sort({ name: 1 })
      .select(
        "name slug difficulty goal focus_area outcome premium squareImage_male squareImage_female duration calories numberofExercises"
      )
      .lean();

    return res.json({ ok: true, data: plans });
  } catch (err) {
    return next(err);
  }
}

async function getPlansByFilter(req, res, next) {
  try {
    const difficulty = String(req.query.difficulty || "").trim();
    const goal = String(req.query.goal || "").trim();
    const focus_area_raw = req.query.focus_area || req.query.focusArea || "";
    const focus_area = String(focus_area_raw).trim();

    const filter = {};

    if (difficulty) {
      if (!PLAN_DIFFICULTIES.has(difficulty)) {
        return res.status(400).json({
          ok: false,
          message: "difficulty must be one of: beginner, intermediate, advanced",
        });
      }
      filter.difficulty = difficulty;
    }

    if (goal) {
      if (!PLAN_GOALS.has(goal)) {
        return res.status(400).json({
          ok: false,
          message: "goal must be one of: weight_loss, muscle_building, keep_fit, get_toned, mobility_relax",
        });
      }
      filter.goal = goal;
    }

    if (focus_area) {
      if (!PLAN_FOCUS_AREAS.has(focus_area)) {
        return res.status(400).json({
          ok: false,
          message: "focus_area must be one of: Arms, Abs, Legs, Back, Chest, Full Body",
        });
      }
      filter.focus_area = focus_area;
    }

    const plans = await Plan.find(filter)
      .sort({ name: 1 })
      .select(
        "name slug difficulty goal focus_area outcome premium squareImage_male squareImage_female duration calories numberofExercises"
      )
      .lean();

    return res.json({ ok: true, data: plans });
  } catch (err) {
    return next(err);
  }
}

async function updatePlan(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid plan id" });
    }

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({ ok: false, message: "plan not found" });
    }

    const body = getPayload(req);
    const updates = {};

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) {
        return res.status(400).json({ ok: false, message: "name cannot be empty" });
      }
      updates.name = n;
    }

    if (body.slug !== undefined) {
      const s = String(body.slug).trim();
      if (!s) {
        return res.status(400).json({ ok: false, message: "slug cannot be empty" });
      }
      if (s !== plan.slug) {
        const taken = await Plan.findOne({ slug: s, _id: { $ne: id } });
        if (taken) {
          return res.status(409).json({ ok: false, message: "slug already in use" });
        }
      }
      updates.slug = s;
    }

    if (body.description !== undefined) {
      updates.description = String(body.description);
    }

    if (body.difficulty !== undefined) {
      const d = String(body.difficulty).trim();
      if (!PLAN_DIFFICULTIES.has(d)) {
        return res.status(400).json({
          ok: false,
          message: "difficulty must be one of: beginner, intermediate, advanced",
        });
      }
      updates.difficulty = d;
    }

    if (body.goal !== undefined) {
      const g = String(body.goal).trim();
      if (!PLAN_GOALS.has(g)) {
        return res.status(400).json({
          ok: false,
          message: "goal must be one of: weight_loss, muscle_building, keep_fit, get_toned, mobility_relax",
        });
      }
      updates.goal = g;
    }

    if (body.outcome !== undefined) {
      updates.outcome = String(body.outcome);
    }

    const focus_area_raw = body.focus_area !== undefined ? body.focus_area : body.focusArea;
    if (focus_area_raw !== undefined) {
      if (focus_area_raw === null || String(focus_area_raw).trim() === "") {
        updates.focus_area = undefined;
      } else {
        const fa = String(focus_area_raw).trim();
        if (!PLAN_FOCUS_AREAS.has(fa)) {
          return res.status(400).json({
            ok: false,
            message: "focus_area must be one of: Arms, Abs, Legs, Back, Chest, Full Body",
          });
        }
        updates.focus_area = fa;
      }
    }

    if (body.premium !== undefined) {
      const p = parsePremiumString(body.premium);
      if (p === undefined) {
        return res.status(400).json({ ok: false, message: "premium must be true or false" });
      }
      updates.premium = p;
    }

    if (body.duration !== undefined) {
      const duration = parseNonNegativeNumber(body.duration, undefined);
      if (duration === null) {
        return res.status(400).json({ ok: false, message: "duration must be a non-negative number" });
      }
      updates.duration = duration;
    }

    if (body.exercises !== undefined) {
      const exercisesResult = await resolvePlanExercises(body.exercises);
      if (!exercisesResult.ok) {
        return res.status(exercisesResult.status).json({ ok: false, message: exercisesResult.message });
      }
      const exerciseEntries = exercisesResult.entries;
      updates.exercises = exerciseEntries.map((e) => ({
        exercise: e.exercise,
        slug: e.slug,
        title: e.title,
        duration: e.duration,
        sets: e.sets,
        reps: e.reps,
        category: e.category,
        thumbnailmale: e.thumbnailmale,
        thumbnailfemale: e.thumbnailfemale,
      }));
      updates.numberofExercises = updates.exercises.length;
    }

    if (body.numberofExercises !== undefined && body.exercises === undefined) {
      const n = parseNonNegativeNumber(body.numberofExercises, undefined);
      if (n === null) {
        return res.status(400).json({ ok: false, message: "numberofExercises must be a non-negative number" });
      }
      if (n !== plan.exercises.length) {
        return res.status(400).json({
          ok: false,
          message: "numberofExercises must match current exercises length unless exercises is updated in the same request",
        });
      }
      updates.numberofExercises = n;
    }
    if (body.calories !== undefined) {
      const calories = parseNonNegativeNumber(body.calories, undefined);
      if (calories === null) {
        return res.status(400).json({ ok: false, message: "calories must be a non-negative number" });
      }
      updates.calories = calories;
    }

    const nextSlug = updates.slug !== undefined ? updates.slug : plan.slug;
    const folder = planGcsFolder(nextSlug);

    const bannerMaleFile = req.files?.bannerImage_male?.[0];
    const squareMaleFile = req.files?.squareImage_male?.[0];
    const bannerFemaleFile = req.files?.bannerImage_female?.[0];
    const squareFemaleFile = req.files?.squareImage_female?.[0];

    if (bannerMaleFile) {
      const ext = extFromMime(bannerMaleFile.mimetype);
      updates.bannerImage_male = await gcsupload(
        folder,
        withForcedOriginalName(bannerMaleFile, `banner_male.${ext}`),
        false
      );
    }
    if (squareMaleFile) {
      const ext = extFromMime(squareMaleFile.mimetype);
      updates.squareImage_male = await gcsupload(
        folder,
        withForcedOriginalName(squareMaleFile, `square_male.${ext}`),
        false
      );
    }
    if (bannerFemaleFile) {
      const ext = extFromMime(bannerFemaleFile.mimetype);
      updates.bannerImage_female = await gcsupload(
        folder,
        withForcedOriginalName(bannerFemaleFile, `banner_female.${ext}`),
        false
      );
    }
    if (squareFemaleFile) {
      const ext = extFromMime(squareFemaleFile.mimetype);
      updates.squareImage_female = await gcsupload(
        folder,
        withForcedOriginalName(squareFemaleFile, `square_female.${ext}`),
        false
      );
    }

    if (body.bannerImage_male !== undefined && !bannerMaleFile) {
      const u = String(body.bannerImage_male).trim();
      if (!u) {
        return res.status(400).json({ ok: false, message: "bannerImage_male URL cannot be empty" });
      }
      updates.bannerImage_male = u;
    }
    if (body.squareImage_male !== undefined && !squareMaleFile) {
      const u = String(body.squareImage_male).trim();
      if (!u) {
        return res.status(400).json({ ok: false, message: "squareImage_male URL cannot be empty" });
      }
      updates.squareImage_male = u;
    }
    if (body.bannerImage_female !== undefined && !bannerFemaleFile) {
      const u = String(body.bannerImage_female).trim();
      if (!u) {
        return res.status(400).json({ ok: false, message: "bannerImage_female URL cannot be empty" });
      }
      updates.bannerImage_female = u;
    }
    if (body.squareImage_female !== undefined && !squareFemaleFile) {
      const u = String(body.squareImage_female).trim();
      if (!u) {
        return res.status(400).json({ ok: false, message: "squareImage_female URL cannot be empty" });
      }
      updates.squareImage_female = u;
    }

    // Slug changes do not delete the old GCS prefix: existing image URLs may still point there.

    Object.assign(plan, updates);
    await plan.save();

    const populated = await Plan.findById(plan._id).populate(
      "exercises.exercise",
      "title slug muscleGroup equipment category difficulty videomale videofemale thumbnailmale thumbnailfemale calories audio focusAreaImage"
    );

    return res.json({ ok: true, data: populated });
  } catch (err) {
    return next(err);
  }
}

async function deletePlan(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid plan id" });
    }

    const plan = await Plan.findById(id).select("slug");
    if (!plan) {
      return res.status(404).json({ ok: false, message: "plan not found" });
    }

    const folderPrefix = planGcsFolder(plan.slug);
    try {
      await gcsdelete(folderPrefix, false);
    } catch {
      // Continue with DB delete even if GCS cleanup fails
    }

    await Plan.deleteOne({ _id: id });

    return res.json({
      ok: true,
      message: "plan deleted",
      data: { gcsPrefix: `${folderPrefix}/` },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPlan,
  getAPlanById,
  getAPlanBySlug,
  updatePlan,
  deletePlan,
  getAllPlans,
  getPlansByFilter,
};
