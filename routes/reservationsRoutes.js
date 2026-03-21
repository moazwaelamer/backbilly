import express from "express"
import * as reservations from "../controllers/reservationsController.js"

const router = express.Router()

// ✅ الـ static routes الأول
router.post("/",                      reservations.createReservation)
router.get("/",                       reservations.getReservations)
router.post("/checkin",               reservations.checkInReservation)
router.get("/availability",           reservations.getAvailability)

// ✅ الـ dynamic routes بعدين
router.patch("/:id/cancel",           reservations.cancelReservation)
router.patch("/:id/deposit",          reservations.addDeposit)
router.patch("/:id/time",             reservations.updateReservationTime)

export default router