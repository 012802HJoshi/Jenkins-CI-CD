const Workout = require("../models/Workout");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");
const { gcsdelete } = require("../config/gcsdelete");

const WORKOUT_PLAN_GCS_PREFIX = "workout_plan";

function workoutGcsFolder(slug) {
  const s = String(slug || "").trim();
  return `${WORKOUT_PLAN_GCS_PREFIX}/${s}`;
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

/**
 * Resolves exerciseId from exerciseSlug and validates every slug exists in Exercise.
 * @returns {{ ok: true, payload: object } | { ok: false, status: number, message: string, missing?: string[] }}
 */
async function attachExerciseReferences(payload) {
  const normalized = { ...payload };
  const weeklySchedule = Array.isArray(payload?.weeklySchedule) ? payload.weeklySchedule : [];

  for (const day of weeklySchedule) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    for (const item of exercises) {
      const slug = String(item?.exerciseSlug || "").trim();
      if (!slug) {
        return {
          ok: false,
          status: 400,
          message: "exerciseSlug is required for every exercise in weeklySchedule",
        };
      }
    }
  }

  const allSlugs = weeklySchedule
    .flatMap((day) => (Array.isArray(day?.exercises) ? day.exercises : []))
    .map((item) => String(item?.exerciseSlug || "").trim())
    .filter(Boolean);

  if (!allSlugs.length) {
    return { ok: true, payload: normalized };
  }

  const uniqueSlugs = [...new Set(allSlugs)];
  const matchedExercises = await Exercise.find({ slug: { $in: uniqueSlugs } }, { _id: 1, slug: 1 });
  const matchedSet = new Set(matchedExercises.map((e) => e.slug));
  const missing = uniqueSlugs.filter((s) => !matchedSet.has(s));

  if (missing.length) {
    return {
      ok: false,
      status: 400,
      message: "one or more exercise slugs do not exist",
      missing,
    };
  }

  const slugToId = new Map(matchedExercises.map((item) => [item.slug, item._id]));

  normalized.weeklySchedule = weeklySchedule.map((day) => {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    return {
      ...day,
      exercises: exercises.map((item) => ({
        ...item,
        exerciseId: slugToId.get(String(item.exerciseSlug || "").trim()) || undefined,
      })),
    };
  });

  return { ok: true, payload: normalized };
}

async function createWorkout(req, res, next) {
  try {
    let payload = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;
    if (typeof req.body?.data === "string") {
      try {
        payload = JSON.parse(req.body.data);
      } catch {
        payload = req.body;
      }
    }

    const refsResult = await attachExerciseReferences(payload);
    if (!refsResult.ok) {
      return res.status(refsResult.status).json({
        ok: false,
        message: refsResult.message,
        ...(refsResult.missing?.length ? { missing: refsResult.missing } : {}),
      });
    }
    const payloadWithRefs = refsResult.payload;

    const workoutName = String(payloadWithRefs?.name || "").trim();
    const slug = String(payloadWithRefs?.slug || "").trim();
    if (!workoutName) {
      return res.status(400).json({ ok: false, message: "name is required" });
    }
    if (!slug) {
      return res.status(400).json({ ok: false, message: "slug is required" });
    }

    const diffRaw = String(payloadWithRefs.difficulty ?? "").trim();
    if (!diffRaw) {
      delete payloadWithRefs.difficulty;
    } else {
      payloadWithRefs.difficulty = diffRaw;
    }

    const workoutFolder = workoutGcsFolder(slug);
    const thumbFile = req.files?.thumbnail?.[0];
    const imageFile = req.files?.image?.[0];

    if (thumbFile) {
      const ext = extFromMime(thumbFile.mimetype);
      payloadWithRefs.bannerUrl = await gcsupload(
        workoutFolder,
        withForcedOriginalName(thumbFile, `thumbnail.${ext}`),
        false
      );
    }
    if (imageFile) {
      const ext = extFromMime(imageFile.mimetype);
      payloadWithRefs.imageUrl = await gcsupload(
        workoutFolder,
        withForcedOriginalName(imageFile, `image.${ext}`),
        false
      );
    }

    const workout = await Workout.create(payloadWithRefs);
    return res.status(201).json({ ok: true, data: workout });
  } catch (err) {
    return next(err);
  }
}

async function listWorkouts(req, res, next) {
  try {
    const workouts = await Workout.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id slug name goal difficulty daysPerWeek weeks bannerUrl imageUrl");
    return res.json({ ok: true, data: workouts });
  } catch (err) {
    return next(err);
  }
}

const WORKOUT_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);

async function getWorkoutsByDifficulty(req, res, next) {
  try {
    const difficulty = String(req.params.difficulty || "").trim().toLowerCase();
    if (!difficulty || !WORKOUT_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        ok: false,
        message: "difficulty must be one of: beginner, intermediate, advanced",
      });
    }

    const workouts = await Workout.find({ difficulty })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id slug name goal difficulty daysPerWeek weeks bannerUrl imageUrl")
      .lean();

    return res.json({ ok: true, data: workouts });
  } catch (err) {
    return next(err);
  }
}

async function getWorkoutBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      return res.status(400).json({ ok: false, message: "slug is required" });
    }

    const workout = await Workout.findOne({ slug }).populate(
      "weeklySchedule.exercises.exerciseId",
      "title slug muscleGroup equipment"
    );

    if (!workout) {
      return res.status(404).json({ ok: false, message: "workout not found" });
    }

    return res.json({ ok: true, data: workout });
  } catch (err) {
    return next(err);
  }
}

async function getWorkoutById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid workout id" });
    }

    const workout = await Workout.findById(id).populate(
      "weeklySchedule.exercises.exerciseId",
      "title slug muscleGroup equipment"
    );

    if (!workout) {
      return res.status(404).json({ ok: false, message: "workout not found" });
    }

    return res.json({ ok: true, data: workout });
  } catch (err) {
    return next(err);
  }
}

async function deleteWorkout(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid workout id" });
    }

    const workout = await Workout.findById(id).select("slug");
    if (!workout) {
      return res.status(404).json({ ok: false, message: "workout not found" });
    }

    const folderPrefix = workoutGcsFolder(workout.slug);
    await gcsdelete(folderPrefix, false);

    await Workout.deleteOne({ _id: id });

    return res.json({ ok: true, message: "workout deleted", data: { gcsPrefix: `${folderPrefix}/` } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createWorkout,
  listWorkouts,
  getWorkoutsByDifficulty,
  getWorkoutById,
  getWorkoutBySlug,
  deleteWorkout,
};

