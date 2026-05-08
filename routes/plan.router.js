const express = require("express");
const {
  createPlan,
  getAPlanById,
  getAPlanBySlug,
  updatePlan,
  deletePlan,
  getAllPlans,
  getPlansByFilter,
} = require("../controllers/plan.controller");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.post(
  "/",
  upload.fields([
    { name: "bannerImage_male", maxCount: 1 },
    { name: "bannerImage_female", maxCount: 1 },
    { name: "squareImage_male", maxCount: 1 },
    { name: "squareImage_female", maxCount: 1 },
  ]),
  createPlan
);

// Static paths before "/:id" so "filters" is not captured as an id
router.get("/", getAllPlans);
router.get("/filters", getPlansByFilter);
router.get("/slug/:slug", getAPlanBySlug);

router.get("/:id", getAPlanById);

router.patch(
  "/:id",
  upload.fields([
    { name: "bannerImage_male", maxCount: 1 },
    { name: "bannerImage_female", maxCount: 1 },
    { name: "squareImage_male", maxCount: 1 },
    { name: "squareImage_female", maxCount: 1 },
  ]),
  updatePlan
);

router.delete("/:id", deletePlan);

module.exports = router;
