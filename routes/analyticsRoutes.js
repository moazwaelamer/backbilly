const express = require("express")
const router = express.Router()

const analyticsController = require("../controllers/analyticsController")

router.get("/most-booked-room", analyticsController.getMostBookedRoom)

router.get("/top-snack", analyticsController.getTopSnack)

router.get("/repeat-customers", analyticsController.getRepeatCustomers)

router.get("/weekly-revenue", analyticsController.getWeeklyRevenue)

router.get("/peak-hours", analyticsController.getPeakHours)

router.get("/summary", analyticsController.getSummary)

module.exports = router