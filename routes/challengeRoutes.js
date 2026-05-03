const express = require("express");
const {
  createChallenge,
  updateChallenge,
  listChallenges,
  getChallengesByDifficulty,
  getChallengeById,
  getChallengeBySlug,
  getChallengeDayBySlug,
  getChallengeDayById,
  updateChallengeDay,
  deleteChallenge,
} = require("../controllers/challengeController");
const { upload } = require("../middleware/upload");

const router = express.Router();

const challengeUpload = upload.fields([
  { name: "banner_male", maxCount: 1 },
  { name: "banner_female", maxCount: 1 },
]);

// Reads
router.get("/", listChallenges);
router.get("/filter", listChallenges);
router.get("/filters", listChallenges);
router.get("/difficulty/:difficulty", getChallengesByDifficulty);
router.get("/slug/:slug/day/:day", getChallengeDayBySlug);
router.get("/slug/:slug", getChallengeBySlug);
router.get("/:id/day/:day", getChallengeDayById);
router.get("/:id", getChallengeById);

// Writes
router.post("/", challengeUpload, createChallenge);
router.put("/:id", challengeUpload, updateChallenge);
router.patch("/:id", challengeUpload, updateChallenge);
router.patch("/:id/day/:day", updateChallengeDay);
router.delete("/:id", deleteChallenge);

module.exports = router;
