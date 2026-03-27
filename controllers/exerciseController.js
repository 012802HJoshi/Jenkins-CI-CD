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
    const exercises = await Exercise.find().sort({ createdAt: -1 });
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createExercise, deleteExerciseFolder, getExerciseById, getAllExercises };