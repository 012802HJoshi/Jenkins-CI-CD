const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");
const { gcsdelete } = require("../config/gcsdelete");

/** GCS layout: `<slug>/men/…`, `<slug>/female/…`, and `<slug>/exercise.json` at slug root. */
const EXERCISE_GCS_MEN = "men";
const EXERCISE_GCS_FEMALE = "female";

function exerciseGenderFolder(slug, genderFolder) {
  const s = String(slug || "").trim();
  return `${s}/${genderFolder}`;
}

function extFromImageMime(mimetype) {
  if (!mimetype) return "jpg";
  if (mimetype.includes("png")) return "png";
  if (mimetype.includes("webp")) return "webp";
  return "jpg";
}

function extFromAudioMime(mimetype) {
  if (!mimetype) return "mp3";
  if (mimetype.includes("wav")) return "wav";
  if (mimetype.includes("ogg")) return "ogg";
  if (mimetype.includes("aac")) return "aac";
  if (mimetype.includes("mp4")) return "m4a";
  if (mimetype.includes("mpeg") || mimetype.includes("mp3")) return "mp3";
  return "mp3";
}

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

function parseNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function withForcedOriginalName(file, forcedName) {
  if (!file) return file;
  return { ...file, originalname: forcedName };
}

function toJsonFile(data, filename = "exercise.json") {
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  return {
    buffer,
    mimetype: "application/json",
    originalname: filename,
  };
}

function requiredMediaValue({ file, bodyValue }) {
  if (file) return "__FROM_FILE__";
  if (bodyValue == null) return "";
  return String(bodyValue).trim();
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
      difficulty,
      audio,
      focusAreaImage,
      videomale: videomaleFromBody,
      videofemale: videofemaleFromBody,
      thumbnailmale: thumbnailmaleFromBody,
      thumbnailfemale: thumbnailfemaleFromBody,
    } = body;

    if (!title || !slug) {
      return res.status(400).json({ ok: false, message: "title and slug are required" });
    }

    const instructions = parseStringArray(body.instructions);
    const importantPoints = parseStringArray(body.importantPoints);
    const exerciseType = parseExerciseType(body.exerciseType);
    const premium = parseBoolean(body.premium);
    const calories = parseNonNegativeNumber(body.calories);

    if (body.exerciseType !== undefined && exerciseType === undefined) {
      return res.status(400).json({ ok: false, message: "exerciseType must be a non-empty string" });
    }
    if (body.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }
    if (calories === null) {
      return res.status(400).json({ ok: false, message: "calories must be a non-negative number" });
    }

    const maleVideoFile = req.files?.videomale?.[0];
    const femaleVideoFile = req.files?.videofemale?.[0];
    const thumbMaleFile = req.files?.thumbnailmale?.[0];
    const thumbFemaleFile = req.files?.thumbnailfemale?.[0];
    const audioFile = req.files?.audio?.[0];
    const focusAreaImageFile = req.files?.focusAreaImage?.[0];

    const pathMen = () => exerciseGenderFolder(slug, EXERCISE_GCS_MEN);
    const pathFemale = () => exerciseGenderFolder(slug, EXERCISE_GCS_FEMALE);
    const pathRoot = () => String(slug || "").trim();

    const bodyVideomale =
      body.videomale != null && String(body.videomale).trim() !== "" ? body.videomale : videomaleFromBody;
    const bodyVideofemale =
      body.videofemale != null && String(body.videofemale).trim() !== "" ? body.videofemale : videofemaleFromBody;

    const requiredVideomale = requiredMediaValue({
      file: maleVideoFile,
      bodyValue: bodyVideomale,
    });
    const requiredVideofemale = requiredMediaValue({
      file: femaleVideoFile,
      bodyValue: bodyVideofemale,
    });
    const requiredThumbnailmale = requiredMediaValue({
      file: thumbMaleFile,
      bodyValue: thumbnailmaleFromBody,
    });
    const requiredThumbnailfemale = requiredMediaValue({
      file: thumbFemaleFile,
      bodyValue: thumbnailfemaleFromBody,
    });

    if (!requiredVideomale || !requiredVideofemale || !requiredThumbnailmale || !requiredThumbnailfemale) {
      return res.status(400).json({
        ok: false,
        message:
          "videomale, videofemale, thumbnailmale, and thumbnailfemale are required (file upload or non-empty URL)",
      });
    }

    const videomale = maleVideoFile
      ? await gcsupload(
          pathMen(),
          withForcedOriginalName(maleVideoFile, "video.mp4"),
          false
        )
      : bodyVideomale != null && String(bodyVideomale) !== ""
        ? String(bodyVideomale)
        : "";
    const videofemale = femaleVideoFile
      ? await gcsupload(
          pathFemale(),
          withForcedOriginalName(femaleVideoFile, "video.mp4"),
          false
        )
      : bodyVideofemale != null && String(bodyVideofemale) !== ""
        ? String(bodyVideofemale)
        : "";

    const thumbnailmale = thumbMaleFile
      ? await gcsupload(
          pathMen(),
          withForcedOriginalName(
            thumbMaleFile,
            `thumbnail.${extFromImageMime(thumbMaleFile.mimetype)}`
          ),
          false
        )
      : thumbnailmaleFromBody != null && String(thumbnailmaleFromBody) !== ""
        ? String(thumbnailmaleFromBody)
        : "";
    const thumbnailfemale = thumbFemaleFile
      ? await gcsupload(
          pathFemale(),
          withForcedOriginalName(
            thumbFemaleFile,
            `thumbnail.${extFromImageMime(thumbFemaleFile.mimetype)}`
          ),
          false
        )
      : thumbnailfemaleFromBody != null && String(thumbnailfemaleFromBody) !== ""
        ? String(thumbnailfemaleFromBody)
        : "";

    const audioValue = audioFile
      ? await gcsupload(
          pathRoot(),
          withForcedOriginalName(audioFile, `audio.${extFromAudioMime(audioFile.mimetype)}`),
          false
        )
      : audio !== undefined
        ? String(audio)
        : "";
    const focusAreaImageValue = focusAreaImageFile
      ? await gcsupload(
          pathRoot(),
          withForcedOriginalName(
            focusAreaImageFile,
            `focus-area.${extFromImageMime(focusAreaImageFile.mimetype)}`
          ),
          false
        )
      : focusAreaImage !== undefined
        ? String(focusAreaImage)
        : "";

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
      ...(exerciseType !== undefined ? { exerciseType } : {}),
      ...(premium !== undefined ? { premium } : {}),
      ...(calories !== undefined ? { calories } : {}),
      audio: audioValue,
      focusAreaImage: focusAreaImageValue,
      videomale,
      videofemale,
      thumbnailmale,
      thumbnailfemale,
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
    if (body.calories !== undefined) {
      const calories = parseNonNegativeNumber(body.calories);
      if (calories === null) {
        return res.status(400).json({ ok: false, message: "calories must be a non-negative number" });
      }
      updates.calories = calories;
    }
    if (body.audio !== undefined) updates.audio = String(body.audio);
    if (body.focusAreaImage !== undefined) updates.focusAreaImage = String(body.focusAreaImage);
    if (body.videomale !== undefined) updates.videomale = body.videomale;
    if (body.videofemale !== undefined) updates.videofemale = body.videofemale;
    if (body.thumbnailmale !== undefined) updates.thumbnailmale = body.thumbnailmale;
    if (body.thumbnailfemale !== undefined) updates.thumbnailfemale = body.thumbnailfemale;

    if (updates.videomale !== undefined && !String(updates.videomale).trim()) {
      return res.status(400).json({ ok: false, message: "videomale cannot be empty" });
    }
    if (updates.videofemale !== undefined && !String(updates.videofemale).trim()) {
      return res.status(400).json({ ok: false, message: "videofemale cannot be empty" });
    }
    if (updates.thumbnailmale !== undefined && !String(updates.thumbnailmale).trim()) {
      return res.status(400).json({ ok: false, message: "thumbnailmale cannot be empty" });
    }
    if (updates.thumbnailfemale !== undefined && !String(updates.thumbnailfemale).trim()) {
      return res.status(400).json({ ok: false, message: "thumbnailfemale cannot be empty" });
    }

    const nextSlug = updates.slug !== undefined ? updates.slug : exercise.slug;
    if (updates.slug !== undefined && updates.slug !== exercise.slug) {
      const taken = await Exercise.findOne({ slug: updates.slug, _id: { $ne: id } });
      if (taken) {
        return res.status(409).json({ ok: false, message: "slug already in use" });
      }
    }

    const maleVideoFile = req.files?.videomale?.[0];
    const femaleVideoFile = req.files?.videofemale?.[0];
    const thumbMaleFile = req.files?.thumbnailmale?.[0];
    const thumbFemaleFile = req.files?.thumbnailfemale?.[0];
    const audioFile = req.files?.audio?.[0];
    const focusAreaImageFile = req.files?.focusAreaImage?.[0];
    const pathMen = () => exerciseGenderFolder(nextSlug, EXERCISE_GCS_MEN);
    const pathFemale = () => exerciseGenderFolder(nextSlug, EXERCISE_GCS_FEMALE);
    const pathRoot = () => String(nextSlug || "").trim();

    if (maleVideoFile) {
      updates.videomale = await gcsupload(
        pathMen(),
        withForcedOriginalName(maleVideoFile, "video.mp4"),
        false
      );
    }
    if (femaleVideoFile) {
      updates.videofemale = await gcsupload(
        pathFemale(),
        withForcedOriginalName(femaleVideoFile, "video.mp4"),
        false
      );
    }
    if (thumbMaleFile) {
      updates.thumbnailmale = await gcsupload(
        pathMen(),
        withForcedOriginalName(
          thumbMaleFile,
          `thumbnail.${extFromImageMime(thumbMaleFile.mimetype)}`
        ),
        false
      );
    }
    if (thumbFemaleFile) {
      updates.thumbnailfemale = await gcsupload(
        pathFemale(),
        withForcedOriginalName(
          thumbFemaleFile,
          `thumbnail.${extFromImageMime(thumbFemaleFile.mimetype)}`
        ),
        false
      );
    }
    if (audioFile) {
      updates.audio = await gcsupload(
        pathRoot(),
        withForcedOriginalName(audioFile, `audio.${extFromAudioMime(audioFile.mimetype)}`),
        false
      );
    }
    if (focusAreaImageFile) {
      updates.focusAreaImage = await gcsupload(
        pathRoot(),
        withForcedOriginalName(
          focusAreaImageFile,
          `focus-area.${extFromImageMime(focusAreaImageFile.mimetype)}`
        ),
        false
      );
    }

    Object.assign(exercise, updates);
    if (updates.title !== undefined && !String(exercise.title || "").trim()) {
      return res.status(400).json({ ok: false, message: "title cannot be empty" });
    }
    if (!String(exercise.videomale || "").trim()) {
      return res.status(400).json({ ok: false, message: "videomale is required" });
    }
    if (!String(exercise.videofemale || "").trim()) {
      return res.status(400).json({ ok: false, message: "videofemale is required" });
    }
    if (!String(exercise.thumbnailmale || "").trim()) {
      return res.status(400).json({ ok: false, message: "thumbnailmale is required" });
    }
    if (!String(exercise.thumbnailfemale || "").trim()) {
      return res.status(400).json({ ok: false, message: "thumbnailfemale is required" });
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

async function getExerciseBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      return res.status(400).json({ ok: false, message: "invalid exercise slug" });
    }

    const exercise = await Exercise.findOne({ slug });
    if (!exercise) {
      return res.status(404).json({ ok: false, message: "exercise not found" });
    }

    return res.json({ ok: true, data: exercise });
  } catch (err) {
    return next(err);
  }
}

const LIST_SELECT =
  "_id title slug category equipment premium difficulty exerciseType calories thumbnailmale thumbnailfemale";

  const EXERCISE_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);


async function getAllExercises(req, res, next) {
  try {
    const category = (req.query.category || "").trim();
    const difficulty = (req.query.difficulty || "").trim();
    const exerciseType = parseExerciseType(req.query.exerciseType);

    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (exerciseType) filter.exerciseType = exerciseType;

    const exercises = await Exercise.find(filter)
      .sort({ title: 1 })
      .select(LIST_SELECT );
    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}



/** Matches index { category: 1, difficulty: 1 }. */
async function getExerciseByCategoryAndDifficulty(req, res, next) {
  try {
    const category = (req.params.category || "").trim();
    const difficulty = String(req.params.difficulty || "").trim().toLowerCase();
    if (!category) {
      return res.status(400).json({ ok: false, message: "category is required" });
    }
    if (!difficulty || !EXERCISE_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        ok: false,
        message: "difficulty must be one of: beginner, intermediate, advanced",
      });
    }
    const exercises = await Exercise.find({ category, difficulty })
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
    const equipment = (req.query.equipment || "").trim();
    const exerciseType = parseExerciseType(req.query.exerciseType);

    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (equipment) filter.equipment = equipment;
    if (exerciseType) filter.exerciseType = exerciseType;

    const exercises = await Exercise.find(filter)
      .sort({ title: 1 })
      .select(LIST_SELECT)
      .lean();

    return res.json({ ok: true, data: exercises });
  } catch (err) {
    return next(err);
  }
}

async function getAlphaSortedExercises(req, res, next) {
  try {
    const exercises = await Exercise.find({})
      .sort({ title: 1 })
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
  getExerciseBySlug,
  getAllExercises,
  getExerciseByCategoryAndDifficulty,
  getExercisesByFilter,
  getAlphaSortedExercises
};