const express = require("express");
const { getEnums } = require("../controllers/enum.controller");

const router = express.Router();

router.get("/", getEnums);

module.exports = router;
