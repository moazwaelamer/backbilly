const express = require("express");
const router = express.Router();

const controller = require("../controllers/tournamentsController");


// ============================
// CREATE TOURNAMENT
// ============================
router.post("/", controller.createTournament);


// ============================
// GET TOURNAMENTS
// ============================
router.get("/", controller.getTournaments);

// get single tournament



// ============================
// PLAYERS
// ============================

// get players in tournament
router.get("/:id/players", controller.getTournamentPlayers);

// join tournament
router.post("/:id/join", controller.joinTournament);

// remove player
router.delete("/:tournamentId/players/:playerId", controller.removePlayer);


// ============================
// MATCHES / BRACKET
// ============================

// get bracket matches
router.get("/:id/matches", controller.getTournamentMatches);

// manual bracket generation
router.post("/:id/generate-bracket", controller.generateBracket);


// ============================
// DELETE TOURNAMENT
// ============================
router.delete("/:id", controller.deleteTournament);


module.exports = router;