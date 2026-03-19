import express from "express"
import * as analyticsController from "../controllers/analyticsController.js"
const router = express.Router()

router.get("/most-booked-room",  analyticsController.getMostBookedRoom)
router.get("/top-snack",         analyticsController.getTopSnack)
router.get("/repeat-customers",  analyticsController.getRepeatCustomers)
router.get("/weekly-revenue",    analyticsController.getWeeklyRevenue)
router.get("/peak-hours",        analyticsController.getPeakHours)
router.get("/today",             analyticsController.getTodayStats)
router.get("/summary",           analyticsController.getSummary)

export default router