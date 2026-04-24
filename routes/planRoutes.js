const express = require("express");
const {
  createPlan,
  getAPlanById,
  updatePlan,
  deletePlan,
  getAllPlans,
  getPlansByFilter,
} = require("../controllers/planController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.post(
  "/",
  upload.fields([
    { name: "bannerImage", maxCount: 1 },
    { name: "squareImage", maxCount: 1 },
  ]),
  createPlan
);

// Static paths before "/:id" so "filters" is not captured as an id
router.get("/", getAllPlans);
router.get("/filters", getPlansByFilter);

router.get("/:id", getAPlanById);

router.patch(
  "/:id",
  upload.fields([
    { name: "bannerImage", maxCount: 1 },
    { name: "squareImage", maxCount: 1 },
  ]),
  updatePlan
);

router.delete("/:id", deletePlan);

module.exports = router;
