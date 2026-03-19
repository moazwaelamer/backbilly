import express from "express"
import * as controller from "../controllers/tournamentsController.js"
import { requireAuth, requireOwner } from "../middleware/auth.js"

const router = express.Router()

// owner بس
router.post("/", requireAuth, requireOwner, controller.createTournament)
router.delete("/:id", requireAuth, requireOwner, controller.deleteTournament)
router.get("/:id/players", controller.getTournamentPlayers)

// الكل يقدر يشوف
router.get("/", controller.getTournaments)
router.get("/:id", controller.getTournamentById)
router.get("/:id/matches", controller.getTournamentMatches)

// join محتاج login بس
router.post("/:id/join", requireAuth, controller.joinTournament)

export default router