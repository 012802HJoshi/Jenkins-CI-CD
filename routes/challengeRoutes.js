const express = require("express");
const {
  createChallenge,
  updateChallenge,
  listChallenges,
  getChallengesByDifficulty,
  getChallengeById,
  getChallengeBySlug,
  deleteChallenge,
} = require("../controllers/challengeController");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.get("/", listChallenges);

router.get("/filter", listChallenges);
router.get("/filters", listChallenges);
router.get("/difficulty/:difficulty", getChallengesByDifficulty);
router.get("/slug/:slug", getChallengeBySlug);
router.get("/:id", getChallengeById);


const challengeUpload = upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "banner", maxCount: 1 },
  { name: "bannerImage", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "squareImage", maxCount: 1 },
]);

router.put("/:id", challengeUpload, updateChallenge);
router.patch("/:id", challengeUpload, updateChallenge);

router.post("/", challengeUpload, createChallenge);
router.delete("/:id", deleteChallenge);

module.exports = router;
