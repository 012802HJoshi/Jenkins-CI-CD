const mongoose = require("mongoose");

const WorkoutDayExerciseSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise" },
    exerciseSlug: { type: String, required: true, trim: true },
    exerciseTitle: { type: String, default: "", trim: true },
    sets: { type: Number, default: 0, min: 0 },
    reps: { type: String, default: "", trim: true }, // e.g. "8-12"
    restSeconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const WorkoutDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true }, // e.g. "Push A"
    muscleGroups: { type: [String], default: [] },
    exercises: { type: [WorkoutDayExerciseSchema], default: [] },
  },
  { _id: false }
);

const WorkoutSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    goal: { type: String, default: "", trim: true }, // e.g. "muscle_building"
    daysPerWeek: { type: Number, default: 0, min: 0 },
    weeks: { type: Number, default: 0, min: 0 },
    weeklySchedule: { type: [WorkoutDaySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Workout", WorkoutSchema);

