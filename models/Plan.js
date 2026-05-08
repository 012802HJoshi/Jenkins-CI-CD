const mongoose = require("mongoose");

const PlanExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    thumbnailmale: { type: String, required: true, trim: true },
    thumbnailfemale: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: "" },
  difficulty: {
    type: String,
    enum: ["beginner", "intermediate", "advanced"],
    default: "beginner",
    required: true,
  },
  goal: {
    type: String,
    enum: ["weight_loss", "muscle_building", "stay_fit", "mobility_relax"],
    required: true,
  },
  premium: { type: String, enum: ["true", "false"], default: "false" },
  bannerImage_male: { type: String, required: true },
  bannerImage_female: { type: String, required: true },
  squareImage_male: { type: String, required: true },
  squareImage_female: { type: String, required: true },
  duration: { type: Number, default: 0, min: 0 },
  numberofExercises: { type: Number, default: 0, min: 0 },
  calories: { type: Number, default: 0, min: 0 },
  exercises: { type: [PlanExerciseSchema], default: [] },
});

PlanSchema.index({ difficulty: 1, goal: 1 });

module.exports = mongoose.model("Plan", PlanSchema, "plans");
