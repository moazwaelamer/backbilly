import db from "../db/db.js"

/* ================= CREATE RESERVATION ================= */
export const createReservation = async (req, res) => {
  try {
    const io = req.app.get("io")
    console.log("📦 BODY:", req.body)
    const {
      name, phone, room_id,
      start_time, end_time,
      event_type, play_mode,
      seats, player_id,
      deposit = 0
    } = req.body

    if(!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required" })
    }

    const start = new Date(start_time)
    const end   = new Date(end_time)

    if(start >= end) {
      return res.status(400).json({ error: "Invalid time range" })
    }

    // ✅ منع الحجز في الماضي
    if(start < new Date()) {
      return res.status(400).json({ error: "Cannot book in the past" })
    }

    if(event_type === "Movie") {
      const result = await db.query(`
        INSERT INTO movie_night_bookings
        (customer_name, phone, seats, booking_time, player_id)
        VALUES ($1,$2,$3,NOW(),$4)
        RETURNING *
      `, [name, phone, seats || 1, player_id || null])
      io.emit("reservationCreated")
      return res.json(result.rows[0])
    }

    const conflict = await db.query(`
      SELECT 1 FROM sessions
      WHERE room_id=$1
      AND reservation_status IN ('Pending','Checked-In')
      AND start_time < $3
      AND end_time > $2
    `, [room_id, start, end])

    if(conflict.rows.length > 0) {
      return res.status(400).json({ error: "Room already booked" })
    }

    const tournamentConflict = await db.query(`
      SELECT 1 FROM tournament_schedules ts
      JOIN tournaments t ON t.tournament_id = ts.tournament_id
      WHERE ts.room_id=$1
      AND t.status != 'Completed'
      AND ts.start_time < $3
      AND ts.end_time > $2
    `, [room_id, start, end])

    if(tournamentConflict.rows.length > 0) {
      return res.status(400).json({ error: "Room reserved for tournament" })
    }

    const result = await db.query(`
      INSERT INTO sessions
      (customer_name, customer_phone, room_id, event_type, play_mode,
       start_time, end_time, reservation_status, player_id, deposit)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending',$8,$9)
      RETURNING *
    `, [name, phone, room_id, event_type, play_mode, start, end, player_id || null, deposit])

    io.emit("reservationCreated")
    io.emit("dashboard_update")
    res.json(result.rows[0])

  } catch(err) {
    console.log("DB ERROR:", err.message)
    res.status(500).json({ error: err.message })
  }
}

/* ================= GET RESERVATIONS ================= */
export const getReservations = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        s.session_id,
        s.session_id AS id,
        s.customer_name,
        s.customer_phone,
        r.room_name,
        s.event_type,
        s.start_time,
        s.end_time,
        s.reservation_status,
        s.source,
        s.deposit
      FROM sessions s
      JOIN rooms r ON s.room_id = r.room_id
      WHERE
        s.reservation_status = 'Checked-In'
        OR (s.reservation_status = 'Pending' AND s.start_time > NOW())

      UNION ALL

      SELECT
        m.booking_id AS session_id,
        m.booking_id AS id,
        m.customer_name,
        m.phone AS customer_phone,
        'Movie Event' AS room_name,
        'Movie' AS event_type,
        m.booking_time AS start_time,
        m.booking_time AS end_time,
        'Booked' AS reservation_status,
        'Website' AS source,
        0 AS deposit
      FROM movie_night_bookings m

      ORDER BY start_time ASC
    `)
    res.json(result.rows)
  } catch(err) {
    console.log(err)
    res.status(500).json({ error: err.message })
  }
}

/* ================= CHECK IN RESERVATION ================= */
export const checkInReservation = async (req, res) => {
  try {
    const io = req.app.get("io")
    const { session_id } = req.body

    const session = await db.query(`
      UPDATE sessions
      SET reservation_status='Checked-In', actual_start = NOW()
      WHERE session_id=$1
      RETURNING *
    `, [session_id])

    if(session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" })
    }

    io.emit("sessionStarted")
    io.emit("dashboard_update")
    res.json(session.rows[0])

  } catch(err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= GET AVAILABILITY ================= */
export const getAvailability = async (req, res) => {
  try {
    const { room_id, date } = req.query
    const roomId = parseInt(room_id)

    const allSlots = await db.query(`
      SELECT to_char(gs, 'HH24:MI') AS slot
      FROM generate_series(
        ($1 || ' 00:00')::timestamp,
        ($1 || ' 23:45')::timestamp,
        interval '15 minutes'
      ) gs
      ORDER BY gs
    `, [date])

    const bookedSlots = await db.query(`
      SELECT DISTINCT to_char(gs, 'HH24:MI') AS slot
      FROM generate_series(
        ($2 || ' 00:00')::timestamp,
        ($2 || ' 23:45')::timestamp,
        interval '15 minutes'
      ) gs
      WHERE EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.room_id = $1
        AND s.reservation_status IN ('Pending','Checked-In')
        AND gs >= (s.start_time AT TIME ZONE 'Africa/Cairo')
        AND gs <  (s.end_time   AT TIME ZONE 'Africa/Cairo')
      )
    `, [roomId, date])

    const tournamentSlots = await db.query(`
      SELECT DISTINCT to_char(gs, 'HH24:MI') AS slot
      FROM generate_series(
        ($2 || ' 00:00')::timestamp,
        ($2 || ' 23:45')::timestamp,
        interval '15 minutes'
      ) gs
      WHERE EXISTS (
        SELECT 1 FROM tournament_schedules ts
        WHERE ts.room_id = $1
        AND gs >= (ts.start_time AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Cairo')
        AND gs <  (ts.end_time   AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Cairo')
      )
    `, [roomId, date])

    const bookedSet     = new Set(bookedSlots.rows.map(r => r.slot))
    const tournamentSet = new Set(tournamentSlots.rows.map(r => r.slot))

    const result = allSlots.rows.map(r => ({
      time:       r.slot,
      available:  !bookedSet.has(r.slot) && !tournamentSet.has(r.slot),
      booked:     bookedSet.has(r.slot),
      tournament: tournamentSet.has(r.slot),
    }))

    res.json(result)

  } catch (err) {
    console.log(err)
    res.status(500).json({ error: "Failed to load availability" })
  }
}

/* ================= CANCEL RESERVATION ================= */
export const cancelReservation = async (req, res) => {
  try {
    const io = req.app.get("io")
    const { id } = req.params

    const session = await db.query(`
      SELECT * FROM sessions WHERE session_id = $1
    `, [id])

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" })
    }

    const s = session.rows[0]

    if (s.reservation_status === "Checked-In" || s.reservation_status === "Completed") {
      return res.status(400).json({ error: "Cannot cancel this booking" })
    }

    await db.query(`
      UPDATE sessions SET reservation_status = 'Cancelled' WHERE session_id = $1
    `, [id])

    io.emit("reservationCancelled", { session_id: id })
    io.emit("dashboard_update")

    res.json({ message: "Cancelled" })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= ADD DEPOSIT ================= */
export const addDeposit = async (req, res) => {
  try {
    const io  = req.app.get("io")
    const { id } = req.params
    const { amount } = req.body

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid deposit amount" })
    }

    const result = await db.query(`
      UPDATE sessions
      SET deposit = COALESCE(deposit, 0) + $1
      WHERE session_id = $2
      AND reservation_status IN ('Pending', 'Checked-In')
      RETURNING session_id, deposit
    `, [Number(amount), id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found or cannot add deposit" })
    }

    io.emit("dashboard_update")

    res.json({
      message: "Deposit added",
      session_id: result.rows[0].session_id,
      deposit: result.rows[0].deposit
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}