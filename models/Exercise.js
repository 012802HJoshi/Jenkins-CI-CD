const mongoose = require("mongoose");

const ExerciseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    instructions: { type: [String], default: [] },
    importantPoints: { type: [String], default: [] },
    muscleGroup: { type: String, default: "" },
    secondaryMuscles: { type: String, default: "" },
    equipment: { type: String, default: "" },
    category: { type: String, default: "" },
    premium: { type: Boolean, default: false },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    exerciseType: {
      type: String,
      enum: ["strength", "cardio_endurence", "flexibility_mobility", "HIIT_circuit", "warmup"],
      default: "strength",
    },
    videomale: { type: String, default: "" },
    videofemale: { type: String, default: "" },
    thumbnailmale: { type: String, default: "" },
    thumbnailfemale: { type: String, default: "" },
  },
  { timestamps: true }
);

ExerciseSchema.index({ category: 1, difficulty: 1 });

ExerciseSchema.index({ category: 1, exerciseType: 1, difficulty: 1 });

module.exports = mongoose.model("Exercise", ExerciseSchema);
