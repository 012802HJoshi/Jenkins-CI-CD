const express = require("express");
const { createWorkout, listWorkouts } = require("../controllers/workoutController");

const router = express.Router();

router.get("/", listWorkouts);
router.post("/", createWorkout);

module.exports = router;

