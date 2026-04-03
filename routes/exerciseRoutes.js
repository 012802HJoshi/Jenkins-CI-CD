const express = require("express");
const {
  createExercise,
  deleteExerciseFolder,
  getExerciseById,
  getAllExercises,
  getExerciseByCategory,
  getExerciseByEquipment,
  getExerciseByCategoryEquipmentDifficultyGender,
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
router.get("/filter", getExerciseByCategoryEquipmentDifficultyGender);
router.get("/filters", getExerciseByCategoryEquipmentDifficultyGender);
router.get("/category/:category", getExerciseByCategory); // /category/Legs
router.get("/equipment/:equipment", getExerciseByEquipment); // /equipment/barbell

router.get("/", getAllExercises);
router.get("/:id", getExerciseById);

router.delete("/:slug/folder", deleteExerciseFolder);

module.exports = router;

