const Workout = require("../models/Workout");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");

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
    const payload = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;

    const payloadWithRefs = await attachExerciseReferences(payload);
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
      .select("_id name goal daysPerWeek weeks");
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

