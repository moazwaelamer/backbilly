const express = require("express")
const router = express.Router()

const shifts = require("../controllers/shiftsController")

router.post("/start", shifts.startShift)
router.post("/end", shifts.endShift)
router.get("/active", shifts.getActiveShift)
router.get("/history", shifts.getShiftHistory)

module.exports = router