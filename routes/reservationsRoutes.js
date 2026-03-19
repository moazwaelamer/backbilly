const express = require("express")
const router = express.Router()
const controller = require("../controllers/reservationsController");
const db = require("../db/db")
const reservations = require("../controllers/reservationsController")

/* ================= RESERVATIONS ================= */

router.post("/", reservations.createReservation)
router.get("/", reservations.getReservations)
router.post("/checkin", reservations.checkInReservation)
router.get("/availability", controller.getAvailability)
/* ================= AVAILABILITY ================= */

module.exports = router