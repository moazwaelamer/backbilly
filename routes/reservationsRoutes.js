import express from "express"
import * as reservations from "../controllers/reservationsController.js"

const router = express.Router()

router.post("/",                   reservations.createReservation)
router.get("/",                    reservations.getReservations)
router.post("/checkin",            reservations.checkInReservation)
router.get("/availability",        reservations.getAvailability)
router.patch("/:id/cancel",        reservations.cancelReservation)
router.patch("/:id/deposit", reservations.addDeposit)      // ✅ جديد

export default router