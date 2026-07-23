const mongoose = require("mongoose");

const ExerciseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    instructions: { type: [String], default: [] },
    common_mistakes: { type: [String], default: [] },
    breathing_tips: { type: [String], default: [] },
    muscleGroup: { type: String, default: "" },
    secondaryMuscles: { type: String, default: "" },
    equipment: { type: String, default: "" },
    category: { type: String, default: "" },
    premium: { type: String, enum: ["true", "false"], default: "false" },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    exerciseType: {
      type: String,
      enum: ["compound", "isolation", "cardio", "streching", "warmup", "cool-down", "mobility"],
      default: "compound",
    },
    videomale: { type: String, required: true, trim: true },
    videofemale: { type: String, required: false, default: "", trim: true },
    thumbnailmale: { type: String, required: true, trim: true },
    thumbnailfemale: { type: String, required: false, default: "", trim: true },
    calories: { type: Number, default: 0 },
    audio: { type: String, required: false, default: "" },
    focusAreaImage: { type: String, required: false, default: "" },
  }
);

ExerciseSchema.index({ category: 1, difficulty: 1 });

ExerciseSchema.index({ category: 1, exerciseType: 1, difficulty: 1, equipment: 1 });

module.exports = mongoose.model("Exercise", ExerciseSchema);