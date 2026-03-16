const express = require("express")
const router = express.Router()

const sessions = require("../controllers/sessionsController")

router.post("/start", sessions.startSession)
router.post("/end", sessions.endSession)
router.post("/check-in", sessions.checkIn)
router.post("/end-session", sessions.endSession)
router.get("/summary/:session_id", sessions.getSummary)

module.exports = router