const express = require("express");
const { createWorkout, listWorkouts, getWorkoutById } = require("../controllers/workoutController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.get("/", listWorkouts);
router.get("/:id", getWorkoutById);
router.post(
  "/",
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  createWorkout
);

module.exports = router;

