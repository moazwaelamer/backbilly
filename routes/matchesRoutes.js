const express = require("express");
const router = express.Router();

const controller = require("../controllers/matchesController");

// ================= SET MATCH WINNER =================
router.post("/:id/winner", controller.setMatchWinner);

module.exports = router;