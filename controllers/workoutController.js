const Workout = require("../models/Workout");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");

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

async function attachExerciseReferences(payload) {
  const normalized = { ...payload };
  const weeklySchedule = Array.isArray(payload?.weeklySchedule) ? payload.weeklySchedule : [];

  const allSlugs = weeklySchedule
    .flatMap((day) => (Array.isArray(day?.exercises) ? day.exercises : []))
    .map((item) => item?.exerciseSlug)
    .filter(Boolean);

  if (!allSlugs.length) return normalized;

  const uniqueSlugs = [...new Set(allSlugs)];
  const matchedExercises = await Exercise.find({ slug: { $in: uniqueSlugs } }, { _id: 1, slug: 1 });
  const slugToId = new Map(matchedExercises.map((item) => [item.slug, item._id]));

  normalized.weeklySchedule = weeklySchedule.map((day) => {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    return {
      ...day,
      exercises: exercises.map((item) => ({
        ...item,
        exerciseId: slugToId.get(item.exerciseSlug) || undefined,
      })),
    };
  });

  return normalized;
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

    const payloadWithRefs = await attachExerciseReferences(payload);
    const workoutName = String(payloadWithRefs?.name || "").trim();
    if (!workoutName) {
      return res.status(400).json({ ok: false, message: "name is required" });
    }

    const workoutFolder = `workout_plan/${workoutName}`;
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
      .select("_id name goal daysPerWeek weeks bannerUrl imageUrl");
    return res.json({ ok: true, data: workouts });
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

module.exports = { createWorkout, listWorkouts, getWorkoutById };

