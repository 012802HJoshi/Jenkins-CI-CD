const express = require("express");
const {
  createWorkout,
  listWorkouts,
  getWorkoutsByDifficulty,
  getWorkoutById,
  getWorkoutBySlug,
  deleteWorkout,
} = require("../controllers/workoutController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.get("/", listWorkouts);
router.get("/difficulty/:difficulty", getWorkoutsByDifficulty);
router.get("/slug/:slug", getWorkoutBySlug);
router.get("/:id", getWorkoutById);
router.post(
  "/",
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  createWorkout
);
router.delete("/:id", deleteWorkout);

module.exports = router;

