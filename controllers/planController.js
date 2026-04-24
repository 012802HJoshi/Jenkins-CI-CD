const Plan = require("../models/Plan");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");
const { gcsdelete } = require("../config/gcsdelete");

const PLAN_GCS_PREFIX = "plans";

function planGcsFolder(slug) {
  const s = String(slug || "").trim();
  return `${PLAN_GCS_PREFIX}/${s}`;
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
  if (mimetype.includes("gif")) return "gif";
  return "jpg";
}

function getPayload(req) {
  let payload = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;
  if (typeof req.body?.data === "string") {
    try {
      payload = JSON.parse(req.body.data);
    } catch {
      payload = req.body;
    }
  }
  return payload && typeof payload === "object" ? payload : {};
}

const PLAN_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const PLAN_GOALS = new Set(["weight_loss", "muscle_building", "stay_fit", "mobility_relax"]);

function parseNonNegativeNumber(value, fallback) {
  if (value == null || value === "") return fallback;
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
    const id = String(item.exerciseId || item._id || "").trim();
    if (id && mongoose.isValidObjectId(id)) {
      return { kind: "id", value: id };
    }
    const slug = String(item.exerciseSlug || item.slug || "").trim();
    if (slug) {
      return { kind: "slug", value: slug };
    }
    return null;
  }
  if (typeof item === "string") {
    const s = item.trim();
    if (!s) return null;
    if (mongoose.isValidObjectId(s)) {
      return { kind: "id", value: s };
    }
    return { kind: "slug", value: s };
  }
  return null;
}

/**
 * Resolves exercises from slugs and/or ids. Preserves order (including duplicates).
 * @returns {{ ok: true, entries: { exercise: import("mongoose").Types.ObjectId, slug: string, title: string }[] } | { ok: false, status: number, message: string }}
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
          "each exercise must be a slug string, a Mongo ObjectId string, or an object with exerciseSlug/slug or exerciseId",
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

  if (slugSet.size) {
    const docs = await Exercise.find({ slug: { $in: [...slugSet] } }, { slug: 1, title: 1 }).lean();
    for (const d of docs) {
      bySlug.set(d.slug, d);
    }
  }
  if (idSet.size) {
    const docs = await Exercise.find({ _id: { $in: [...idSet] } }, { slug: 1, title: 1 }).lean();
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
        message: "goal is required and must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
      });
    }

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
    const bannerFile = req.files?.bannerImage?.[0];
    const squareFile = req.files?.squareImage?.[0];
    const bannerFromBody = String(body.bannerImage || "").trim();
    const squareFromBody = String(body.squareImage || "").trim();

    let bannerImage = bannerFromBody;
    let squareImage = squareFromBody;

    if (bannerFile) {
      const ext = extFromMime(bannerFile.mimetype);
      bannerImage = await gcsupload(folder, withForcedOriginalName(bannerFile, `banner.${ext}`), false);
    }
    if (squareFile) {
      const ext = extFromMime(squareFile.mimetype);
      squareImage = await gcsupload(folder, withForcedOriginalName(squareFile, `square.${ext}`), false);
    }

    if (!bannerImage || !squareImage) {
      return res.status(400).json({
        ok: false,
        message: "bannerImage and squareImage are required (upload files or pass URLs in the body)",
      });
    }

    const premium = parseBoolean(body.premium);
    if (body.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const plan = await Plan.create({
      name,
      slug,
      description,
      difficulty,
      goal: goalRaw,
      bannerImage,
      squareImage,
      duration,
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

    const plan = await Plan.findById(id).populate(
      "exercises.exercise",
      "title slug muscleGroup equipment category difficulty videomale videofemale thumbnailmale thumbnailfemale"
    );

    if (!plan) {
      return res.status(404).json({ ok: false, message: "plan not found" });
    }

    return res.json({ ok: true, data: plan });
  } catch (err) {
    return next(err);
  }
}

async function getAllPlans(req, res, next) {
  try {
    const difficulty = String(req.query.difficulty || "").trim();
    const goal = String(req.query.goal || "").trim();

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
          message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
        });
      }
      filter.goal = goal;
    }

    const premium = parseBoolean(req.query.premium);
    if (req.query.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }
    if (premium !== undefined) filter.premium = premium;

    const plans = await Plan.find(filter)
      .sort({ name: 1 })
      .select(
        "name slug description difficulty goal premium bannerImage squareImage duration numberofExercises exercises"
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

    if (!difficulty || !goal) {
      return res.status(400).json({
        ok: false,
        message: "query params difficulty and goal are both required",
      });
    }

    if (!PLAN_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        ok: false,
        message: "difficulty must be one of: beginner, intermediate, advanced",
      });
    }

    if (!PLAN_GOALS.has(goal)) {
      return res.status(400).json({
        ok: false,
        message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
      });
    }

    const premium = parseBoolean(req.query.premium);
    if (req.query.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const filter = { difficulty, goal };
    if (premium !== undefined) filter.premium = premium;

    const plans = await Plan.find(filter)
      .sort({ name: 1 })
      .select(
        "name slug description difficulty goal premium bannerImage squareImage duration numberofExercises exercises"
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
          message: "goal must be one of: weight_loss, muscle_building, stay_fit, mobility_relax",
        });
      }
      updates.goal = g;
    }

    if (body.premium !== undefined) {
      const p = parseBoolean(body.premium);
      if (p === undefined) {
        return res.status(400).json({ ok: false, message: "premium must be a boolean" });
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

    const nextSlug = updates.slug !== undefined ? updates.slug : plan.slug;
    const folder = planGcsFolder(nextSlug);

    const bannerFile = req.files?.bannerImage?.[0];
    const squareFile = req.files?.squareImage?.[0];

    if (bannerFile) {
      const ext = extFromMime(bannerFile.mimetype);
      updates.bannerImage = await gcsupload(folder, withForcedOriginalName(bannerFile, `banner.${ext}`), false);
    }
    if (squareFile) {
      const ext = extFromMime(squareFile.mimetype);
      updates.squareImage = await gcsupload(folder, withForcedOriginalName(squareFile, `square.${ext}`), false);
    }

    if (body.bannerImage !== undefined && !bannerFile) {
      const u = String(body.bannerImage).trim();
      if (!u) {
        return res.status(400).json({ ok: false, message: "bannerImage URL cannot be empty" });
      }
      updates.bannerImage = u;
    }
    if (body.squareImage !== undefined && !squareFile) {
      const u = String(body.squareImage).trim();
      if (!u) {
        return res.status(400).json({ ok: false, message: "squareImage URL cannot be empty" });
      }
      updates.squareImage = u;
    }

    // Slug changes do not delete the old GCS prefix: existing bannerImage/squareImage URLs may still point there.

    Object.assign(plan, updates);
    await plan.save();

    const populated = await Plan.findById(plan._id).populate(
      "exercises.exercise",
      "title slug muscleGroup equipment category difficulty videomale videofemale thumbnailmale thumbnailfemale"
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
  updatePlan,
  deletePlan,
  getAllPlans,
  getPlansByFilter,
};
