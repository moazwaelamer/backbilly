const express = require("express");
const router = express.Router();
const controller = require("../controllers/tournamentsController");
const { requireAuth, requireOwner } = require("../middleware/auth");

// owner بس
router.post("/", requireAuth, requireOwner, controller.createTournament);
router.delete("/:id", requireAuth, requireOwner, controller.deleteTournament);
router.get("/:id/players", controller.getTournamentPlayers);
// الكل يقدر يشوف
router.get("/", controller.getTournaments);
router.get("/:id", controller.getTournamentById);
router.get("/:id/matches", controller.getTournamentMatches);

// الـ join محتاج login بس مش owner
router.post("/:id/join", requireAuth, controller.joinTournament);

module.exports = router;