const express = require("express");
const {
  createExercise,
  updateExercise,
  deleteExerciseFolder,
  getExerciseById,
  getAllExercises,
  getExerciseByCategory,
  getExerciseByExerciseType,
  getExercisesByFilter,
} = require("../controllers/exerciseController");
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

// Filters (keep before "/:id" — "/filter" must exist or "filter" is treated as :id and returns 400)
router.get("/filter", getExercisesByFilter);
router.get("/filters", getExercisesByFilter);
router.get("/category/:category", getExerciseByCategory); // /category/Legs
router.get("/exercise-type/:exerciseType", getExerciseByExerciseType); // e.g. /exercise-type/strength

router.get("/", getAllExercises);
router.get("/:id", getExerciseById);

router.patch(
  "/:id",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  updateExercise
);

router.delete("/:slug/folder", deleteExerciseFolder);

module.exports = router;

