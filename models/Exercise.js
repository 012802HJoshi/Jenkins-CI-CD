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
    gender: { type: String, enum: ["men", "women", "all"], default: "all" },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    exerciseType: { type: [String], default: [] },
    videoUrl: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index for filter queries (e.g. find({ category: "Legs" })). No enum needed—frontend sends allowed values.
ExerciseSchema.index({ category: 1 });

ExerciseSchema.index({ equipment: 1 });

// Helps common combined filter: category + difficulty
ExerciseSchema.index({ category: 1, difficulty: 1 });

// Helps combined filter endpoint: category + equipment + difficulty + gender
ExerciseSchema.index({ category: 1, equipment: 1, difficulty: 1, gender: 1 });

module.exports = mongoose.model("Exercise", ExerciseSchema);