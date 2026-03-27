const express = require("express");
const { createExercise, deleteExerciseFolder, getExerciseById, getAllExercises } = require("../controllers/exerciseController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.post(
  "/",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  createExercise
);

router.get("/", getAllExercises);
router.get("/:id", getExerciseById);

router.delete("/:slug/folder", deleteExerciseFolder);

module.exports = router;

