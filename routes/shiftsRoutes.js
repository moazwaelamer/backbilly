const express = require("express")
const router = express.Router()
const shifts = require("../controllers/shiftsController")
const { requireAuth, requireOwner } = require("../middleware/auth")

// لازم login عشان يبدأ او يخلص شيفت
router.post("/start", requireAuth, shifts.startShift)
router.post("/end", requireAuth, shifts.endShift)

// الكل يشوف الشيفت الحالي
router.get("/active", shifts.getActiveShift)

// owner بس يشوف التاريخ كامل
router.get("/history", requireAuth, requireOwner, shifts.getShiftHistory)

module.exports = router