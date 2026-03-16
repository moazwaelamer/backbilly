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

router.get("/availability", async (req, res) => {
  try {

    const room_id = Number(req.query.room_id)
    const date = req.query.date

    if (!room_id || !date) {
      return res.status(400).json({ error: "room_id and date required" })
    }

    const startDay = new Date(`${date}T00:00:00`)
    const endDay = new Date(`${date}T23:59:59`)

    const result = await db.query(`
      SELECT start_time, end_time
      FROM sessions
      WHERE room_id=$1
      AND start_time BETWEEN $2 AND $3
    `,[room_id,startDay,endDay])

    const bookings = result.rows
    const slots = []

    let current = new Date(`${date}T00:00:00`)

    while (current < endDay) {

      const hour = current.getHours().toString().padStart(2,"0")
      const min = current.getMinutes().toString().padStart(2,"0")

      const time = `${hour}:${min}`

      const conflict = bookings.some(b => {

        const start = new Date(b.start_time)
        const end = new Date(b.end_time)

        return current >= start && current < end
      })

      if(!conflict){
        slots.push(time)
      }

      current.setMinutes(current.getMinutes() + 30)
    }

    res.json(slots)

  } catch (err) {

    console.log("Availability Error:",err)
    res.status(500).json({error:"server error"})
  }
})

module.exports = router