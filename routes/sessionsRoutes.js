import express from "express"
import * as sessions from "../controllers/sessionsController.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

router.post("/start", sessions.startSession)
router.post("/end", requireAuth, sessions.endSession)
router.post("/check-in", requireAuth, sessions.checkIn)
router.post("/extend", requireAuth, sessions.extendSession)

router.get("/summary/:session_id", requireAuth, sessions.getSummary)

export default router