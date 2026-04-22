const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");
const { gcsdelete } = require("../config/gcsdelete");

function parseStringArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fall through
    }
  }

  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseExerciseType(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.length ? String(value[0]).trim() : undefined;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length) {
        return String(parsed[0]).trim() || undefined;
      }
    } catch {
      // fall through to plain string handling
    }
  }

  return trimmed;
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

/**
 * Wraps a JSON payload as a mock multer-style file object so it can be
 * passed directly to gcsupload, which expects { buffer, mimetype, originalname }.
 */
function toJsonFile(data, filename = "exercise.json") {
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  return {
    buffer,
    mimetype: "application/json",
    originalname: filename,
  };
}

async function createExercise(req, res, next) {
  try {
    const body = req.body || {};
    const {
      title,
      slug,
      description,
      muscleGroup,
      secondaryMuscles,
      equipment,
      category,
      gender,
      difficulty,
      videoUrl: videoUrlFromBody,
      thumbnailUrl: thumbnailUrlFromBody,
    } = body;

    if (!title || !slug) {
      return res.status(400).json({ ok: false, message: "title and slug are required" });
    }

    const instructions = parseStringArray(body.instructions);
    const importantPoints = parseStringArray(body.importantPoints);
    const exerciseType = parseExerciseType(body.exerciseType);
    const premium = parseBoolean(body.premium);

    if (body.exerciseType !== undefined && exerciseType === undefined) {
      return res.status(400).json({ ok: false, message: "exerciseType must be a non-empty string" });
    }
    if (body.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    const videoUrl = videoFile
      ? await gcsupload(slug, withForcedOriginalName(videoFile, "video.mp4"), false)
      : (videoUrlFromBody || "");
    const thumbnailUrl = thumbFile
      ? await gcsupload(slug, withForcedOriginalName(thumbFile, "image.jpg"), false)
      : (thumbnailUrlFromBody || "");

    const exercise = await Exercise.create({
      title,
      slug,
      description,
      instructions,
      importantPoints,
      muscleGroup,
      secondaryMuscles,
      equipment,
      category,
      gender,
      difficulty,
      ...(exerciseType !== undefined ? { exerciseType } : {}),
      ...(premium !== undefined ? { premium } : {}),
      videoUrl,
      thumbnailUrl,
    });

    // Upload the exercise document as a JSON file into the same GCS folder
    const exerciseJson = exercise.toObject ? exercise.toObject() : exercise;
    await gcsupload(slug, toJsonFile(exerciseJson, "exercise.json"), false);

    return res.status(201).json({ ok: true, data: exercise });
  } catch (err) {
    return next(err);
  }
}

async function updateExercise(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid exercise id" });
    }

    const exercise = await Exercise.findById(id);
    if (!exercise) {
      return res.status(404).json({ ok: false, message: "exercise not found" });
    }

    const body = req.body || {};
    const updates = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.slug !== undefined) {
      const s = String(body.slug).trim();
      if (s) updates.slug = s;
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.muscleGroup !== undefined) updates.muscleGroup = body.muscleGroup;
    if (body.secondaryMuscles !== undefined) updates.secondaryMuscles = body.secondaryMuscles;
    if (body.equipment !== undefined) updates.equipment = body.equipment;
    if (body.category !== undefined) updates.category = body.category;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.premium !== undefined) {
      const premium = parseBoolean(body.premium);
      if (premium === undefined) {
        return res.status(400).json({ ok: false, message: "premium must be a boolean" });
      }
      updates.premium = premium;
    }
    if (body.difficulty !== undefined) updates.difficulty = body.difficulty;
    if (body.instructions !== undefined) updates.instructions = parseStringArray(body.instructions);
    if (body.importantPoints !== undefined) updates.importantPoints = parseStringArray(body.importantPoints);
    if (body.exerciseType !== undefined) {
      const exerciseType = parseExerciseType(body.exerciseType);
      if (exerciseType === undefined) {
        return res.status(400).json({ ok: false, message: "exerciseType must be a non-empty string" });
      }
      updates.exerciseType = exerciseType;
    }
    if (body.videoUrl !== undefined) updates.videoUrl = body.videoUrl;
    if (body.thumbnailUrl !== undefined) updates.thumbnailUrl = body.thumbnailUrl;

    const nextSlug = updates.slug !== undefined ? updates.slug : exercise.slug;
    if (updates.slug !== undefined && updates.slug !== exercise.slug) {
      const taken = await Exercise.findOne({ slug: updates.slug, _id: { $ne: id } });
      if (taken) {
        return res.status(409).json({ ok: false, message: "slug already in use" });
      }
    }

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];
    if (videoFile) {
      updates.videoUrl = await gcsupload(
        nextSlug,
        withForcedOriginalName(videoFile, "video.mp4"),
        false
      );
    }
    if (thumbFile) {
      updates.thumbnailUrl = await gcsupload(
        nextSlug,
        withForcedOriginalName(thumbFile, "image.jpg"),
        false
      );
    }

    Object.assign(exercise, updates);
    if (updates.title !== undefined && !String(exercise.title || "").trim()) {
      return res.status(400).json({ ok: false, message: "title cannot be empty" });
    }
    await exercise.save();

    const exerciseJson = exercise.toObject ? exercise.toObject() : exercise;
    await gcsupload(nextSlug, toJsonFile(exerciseJson, "exercise.json"), false);

    return res.json({ ok: true, data: exercise });
  } catch (err) {
    return next(err);
  }
}

async function deleteExerciseFolder(req, res, next) {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ ok: false, message: "slug is required" });

    const gcsResult = await gcsdelete(slug, false);
    const dbResult = await Exercise.deleteOne({ slug });

    return res.json({
      ok: true,
      data: {
        gcs: gcsResult,
        db: {
          acknowledged: dbResult.acknowledged,
          deletedCount: dbResult.deletedCount,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getExerciseById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid exercise id" });
    }

    const exercise = await Exercise.findById(id);
    if (!exercise) {
      return res.status(404).json({ ok: false, message: "exercise not found" });
    }

    return res.json({ ok: true, data: exercise });
  } catch (err) {
    return next(err);
  }
}

async function getAllExercises(req, res, next) {
  try {
    const category = (req.query.category || "").trim();
    const difficulty = (req.query.difficulty || "").trim();
    const gender = (req.query.gender || "").trim();
    const exerciseType = parseExerciseType(req.query.exerciseType);
    const premium = parseBoolean(req.query.premium);

    if (req.query.exerciseType !== undefined && exerciseType === undefined) {
      return res.status(400).json({ ok: false, message: "exerciseType must be a non-empty string" });
    }
    if (req.query.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (gender) filter.gender = gender;
    if (exerciseType) filter.exerciseType = exerciseType;
    if (premium !== undefined) filter.premium = premium;

    const exercises = await Exercise.find(filter)
      .sort({ createdAt: -1 })
      .select(
        "_id title slug muscleGroup thumbnailUrl equipment category gender premium difficulty exerciseType"
      );
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

const LIST_SELECT =
  "_id title slug muscleGroup thumbnailUrl secondaryMuscles equipment category gender premium difficulty exerciseType";

async function getExerciseByCategory(req, res, next) {
  try {
    const category = (req.params.category || "").trim();
    const exercises = await Exercise.find({ category })
      .sort({ createdAt: -1 })
      .select(LIST_SELECT)
      .lean();
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

async function getExerciseByExerciseType(req, res, next) {
  try {
    const exerciseType = parseExerciseType(req.params.exerciseType);
    if (exerciseType === undefined) {
      return res.status(400).json({ ok: false, message: "exerciseType must be a non-empty string" });
    }
    const exercises = await Exercise.find({ exerciseType })
      .sort({ createdAt: -1 })
      .select(LIST_SELECT)
      .lean();
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

async function getExercisesByFilter(req, res, next) {
  try {
    const category = (req.query.category || "").trim();
    const difficulty = (req.query.difficulty || "").trim();
    const gender = (req.query.gender || "").trim();
    const exerciseType = parseExerciseType(req.query.exerciseType);
    const premium = parseBoolean(req.query.premium);

    if (req.query.exerciseType !== undefined && exerciseType === undefined) {
      return res.status(400).json({ ok: false, message: "exerciseType must be a non-empty string" });
    }
    if (req.query.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (gender) filter.gender = gender;
    if (exerciseType) filter.exerciseType = exerciseType;
    if (premium !== undefined) filter.premium = premium;

    const exercises = await Exercise.find(filter)
      .sort({ createdAt: -1 })
      .select(LIST_SELECT)
      .lean();

    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createExercise,
  updateExercise,
  deleteExerciseFolder,
  getExerciseById,
  getAllExercises,
  getExerciseByCategory,
  getExerciseByExerciseType,
  getExercisesByFilter,
};