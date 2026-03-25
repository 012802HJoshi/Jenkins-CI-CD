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

module.exports = mongoose.model("Exercise", ExerciseSchema);

