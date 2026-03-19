const express = require("express")
const router = express.Router()
const analyticsController = require("../controllers/analyticsController")
const { requireAuth, requireOwner } = require("../middleware/auth")

// owner بس
router.get("/most-booked-room", requireAuth, requireOwner, analyticsController.getMostBookedRoom)
router.get("/top-snack", requireAuth, requireOwner, analyticsController.getTopSnack)
router.get("/repeat-customers", requireAuth, requireOwner, analyticsController.getRepeatCustomers)
router.get("/weekly-revenue", requireAuth, requireOwner, analyticsController.getWeeklyRevenue)
router.get("/peak-hours", requireAuth, requireOwner, analyticsController.getPeakHours)
router.get("/summary", requireAuth, requireOwner, analyticsController.getSummary)

module.exports = router