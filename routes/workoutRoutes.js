const express = require("express");
const { createWorkout, listWorkouts, getWorkoutById } = require("../controllers/workoutController");

const router = express.Router();

router.get("/", listWorkouts);
router.get("/:id", getWorkoutById);
router.post("/", createWorkout);

module.exports = router;

