const mongoose = require("mongoose");

const ChallengeDayExerciseSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, default: "", trim: true },
    sets: { type: Number, default: 0, min: 0 },
    reps: { type: String, default: "", trim: true },
    duration: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ChallengeDaySchema = new mongoose.Schema(
  {
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      required: true,
      index: true,
    },
    day: { type: Number, required: true, min: 1 },
    weekNumber: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    muscleGroups: { type: [String], default: [] },
    exercises: { type: [ChallengeDayExerciseSchema], default: [] },
  },
  { timestamps: true }
);

ChallengeDaySchema.index({ challengeId: 1, day: 1 }, { unique: true });

module.exports = mongoose.model("ChallengeDay", ChallengeDaySchema, "workout_days");
