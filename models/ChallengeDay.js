const mongoose = require("mongoose");

const ChallengeDayExerciseSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, default: "", trim: true },
    sets: { type: Number, default: 0, min: 0 },
    reps: { type: String, default: "", trim: true },
    duration: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    thumbnailmale: { type: String, required: true, trim: true },
    thumbnailfemale: { type: String, required: false, default: "", trim: true },
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
    calories: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true, min: 0 },
    exercises: { type: [ChallengeDayExerciseSchema], default: [] },
  }
);

ChallengeDaySchema.index({ challengeId: 1, day: 1 }, { unique: true });

module.exports = mongoose.model("ChallengeDay", ChallengeDaySchema, "challenge_days");
