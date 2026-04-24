const mongoose = require("mongoose");

const ChallengeDayExerciseSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise" },
    exerciseSlug: { type: String, required: true, trim: true },
    exerciseTitle: { type: String, default: "", trim: true },
    sets: { type: Number, default: 0, min: 0 },
    reps: { type: String, default: "", trim: true },
    restSeconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ChallengeDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    muscleGroups: { type: [String], default: [] },
    exercises: { type: [ChallengeDayExerciseSchema], default: [] },
  },
  { _id: false }
);

const ChallengeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    goal: {
      type: String,
      enum: ["weight_loss", "muscle_building", "stay_fit", "mobility_relax"],
      default: "muscle_building",
    },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    daysPerWeek: { type: Number, default: 0, min: 0 },
    weeks: { type: Number, default: 0, min: 0 },
    weeklySchedule: { type: [ChallengeDaySchema], default: [] },
    banner: { type: String, default: "", trim: true },
    image: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

ChallengeSchema.index({ difficulty: 1 });

// Keep existing "workouts" collection so data created with the old Workout model stays compatible.
module.exports = mongoose.model("Challenge", ChallengeSchema, "workouts");
