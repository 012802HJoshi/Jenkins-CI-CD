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
    } = req.body || {};

    if (!title || !slug) {
      return res.status(400).json({ ok: false, message: "title and slug are required" });
    }

    const instructions = parseStringArray(req.body?.instructions);
    const importantPoints = parseStringArray(req.body?.importantPoints);
    const exerciseType = parseStringArray(req.body?.exerciseType);

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
      exerciseType,
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
    const exercises = await Exercise.find()
      .sort({ createdAt: -1 })
      .select("_id title slug muscleGroup thumbnailUrl equipment category gender difficulty exerciseType");
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

const LIST_SELECT =
  "_id title slug muscleGroup thumbnailUrl secondaryMuscles equipment category gender difficulty exerciseType";

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

async function getExerciseByEquipment(req, res, next) {
  try {
    const equipment = (req.params.equipment || "").trim();
    const exercises = await Exercise.find({ equipment })
      .sort({ createdAt: -1 })
      .select(LIST_SELECT)
      .lean();
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

async function getExerciseByCategoryEquipmentDifficultyGender(req, res, next) {
  try {
    const category = (req.query.category || "").trim();
    const equipment = (req.query.equipment || "").trim();
    const difficulty = (req.query.difficulty || "").trim();
    const gender = (req.query.gender || "").trim();

    const filter = {};
    if (category) filter.category = category;
    if (equipment) filter.equipment = equipment;
    if (difficulty) filter.difficulty = difficulty;
    if (gender) filter.gender = gender;

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
  deleteExerciseFolder,
  getExerciseById,
  getAllExercises,
  getExerciseByCategory,
  getExerciseByEquipment,
  getExerciseByCategoryEquipmentDifficultyGender,
};