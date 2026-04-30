const express = require("express");
const {
  createExercise,
  updateExercise,
  deleteExerciseFolder,
  getExerciseById,
  getAllExercises,
  getExerciseByCategoryAndDifficulty,
  getExercisesByFilter,
  getAlphaSortedExercises
} = require("../controllers/exerciseController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.post(
  "/",
  upload.fields([
    { name: "videomale", maxCount: 1 },
    { name: "videofemale", maxCount: 1 },
    { name: "thumbnailmale", maxCount: 1 },
    { name: "thumbnailfemale", maxCount: 1 },
  ]),
  createExercise
);

// Filters (keep before "/:id" — "/filter" must exist or "filter" is treated as :id and returns 400)
router.get("/filter", getExercisesByFilter);
router.get("/filters", getExercisesByFilter);
// Matches index { category, difficulty }; other combos use GET / or /filter with query params
router.get("/category/:category/difficulty/:difficulty", getExerciseByCategoryAndDifficulty);

router.get("/", getAllExercises);
router.get("/:id", getExerciseById);

router.get('/sorted/alphabetical', getAlphaSortedExercises);

router.patch(
  "/:id",
  upload.fields([
    { name: "videomale", maxCount: 1 },
    { name: "videofemale", maxCount: 1 },
    { name: "thumbnailmale", maxCount: 1 },
    { name: "thumbnailfemale", maxCount: 1 },
  ]),
  updateExercise
);

router.delete("/:slug/folder", deleteExerciseFolder);

module.exports = router;

