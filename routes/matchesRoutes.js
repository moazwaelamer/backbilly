import express from "express"
import * as controller from "../controllers/matchesController.js"

const router = express.Router()

// ================= SET MATCH WINNER =================
router.post("/:id/winner", controller.setMatchWinner)

export default router