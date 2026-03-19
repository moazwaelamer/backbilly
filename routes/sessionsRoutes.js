const express = require("express")
const router = express.Router()
const sessions = require("../controllers/sessionsController")
const { requireAuth } = require("../middleware/auth")

router.post("/start", sessions.startSession)
router.post("/end", requireAuth, sessions.endSession)
router.post("/check-in", requireAuth, sessions.checkIn)
router.post("/extend", requireAuth, sessions.extendSession) // 🔥 الحل هنا

router.get("/summary/:session_id", requireAuth, sessions.getSummary)

module.exports = router