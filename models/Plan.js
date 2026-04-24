const mongoose = require("mongoose");

const PlanExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
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
  bannerImage: { type: String, required: true },
  squareImage: { type: String, required: true },
  duration: { type: Number, default: 0, min: 0 },
  numberofExercises: { type: Number, default: 0, min: 0 },
  exercises: { type: [PlanExerciseSchema], default: [] },
});

PlanSchema.index({ difficulty: 1, goal: 1 });

module.exports = mongoose.model("Plan", PlanSchema, "plans");
