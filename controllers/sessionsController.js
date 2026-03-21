import db from "../db/db.js"

/* ================= START SESSION ================= */

export const startSession = async (req, res) => {
  try {
    let { room_id, duration, event_type, play_mode,
          customer_name, customer_phone,
          start_time, end_time
        } = req.body

    if (!room_id || !duration) {
      return res.status(400).json({ error: "Missing data" })
    }

    play_mode = event_type === "Gaming" ? play_mode : null

    const hours = Number(duration)
    if (isNaN(hours) || hours <= 0) {
      return res.status(400).json({ error: "Invalid duration" })
    }

    const start = start_time ? new Date(start_time) : new Date()
    const end   = end_time   ? new Date(end_time)   : new Date(start.getTime() + hours * 3600000)

    const conflict = await db.query(`
      SELECT 1 FROM sessions
      WHERE room_id = $1
      AND reservation_status IN ('Pending','Checked-In')
      AND (start_time < $3 AND end_time > $2)
    `, [room_id, start, end])

    if (conflict.rows.length) {
      return res.status(400).json({ error: "Room busy" })
    }

    const result = await db.query(`
      INSERT INTO sessions
      (room_id, event_type, play_mode, reservation_status,
       start_time, end_time, actual_start, source,
       customer_name, customer_phone)
      VALUES ($1, $2, $3, 'Checked-In', $4, $5, $6, 'Admin', $7, $8)
      RETURNING *
    `, [room_id, event_type, play_mode, start, end, start, customer_name || null, customer_phone || null])

    req.app.get("io").emit("dashboard_update")
    res.json(result.rows[0])

  } catch (err) {
    console.log("START SESSION ERROR:", err)
    res.status(500).json({ error: err.message })
  }
}

/* ================= CHECK IN ================= */

export const checkIn = async (req, res) => {
  try {
    const { session_id } = req.body

    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id" })
    }

    const result = await db.query(`
      UPDATE sessions
      SET reservation_status = 'Checked-In', actual_start = NOW()
      WHERE session_id = $1
      RETURNING *
    `, [session_id])

    req.app.get("io").emit("dashboard_update")
    res.json(result.rows[0])

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= SESSION SUMMARY ================= */

export const getSummary = async (req, res) => {
  try {
    const { session_id } = req.params

    const result = await db.query(`
      SELECT
        s.session_id,
        s.customer_name,
        s.customer_phone,
        s.deposit,
        r.room_name,
        s.actual_start,
        s.start_time,
        s.end_time,
        s.event_type,
        s.play_mode,
        COALESCE(s.actual_start, s.start_time) AS session_start,

        -- ✅ لو في end_time استخدمه، لو لأ احسب من دلوقتي
        EXTRACT(EPOCH FROM (
          COALESCE(s.end_time, NOW())
          - COALESCE(s.actual_start, s.start_time)
        )) / 3600 AS duration_hours,

        -- ✅ suggested_price بالـ actual duration
        (
          CASE
            WHEN s.event_type = 'Movie'      THEN r.price_movie
            WHEN s.event_type = 'Birthday'   THEN r.price_birthday
            WHEN s.event_type = 'Tournament' THEN 0
            WHEN s.play_mode  = 'Multi'      THEN r.price_multi
            ELSE r.price_single
          END
        ) * GREATEST(
          EXTRACT(EPOCH FROM (
            COALESCE(s.end_time, NOW())
            - COALESCE(s.actual_start, s.start_time)
          )) / 3600
        , 0) AS suggested_price

      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE s.session_id = $1
    `, [session_id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" })
    }

    const fbResult = await db.query(`
      SELECT
        cs.sale_id,
        cs.total_amount AS fb_total,
        json_agg(json_build_object(
          'item_name', i.item_name,
          'quantity', csi.quantity,
          'subtotal', csi.subtotal
        )) AS pos_items
      FROM cafe_sales cs
      JOIN cafe_sale_items csi ON csi.sale_id = cs.sale_id
      JOIN inventory i ON i.item_id = csi.item_id
      WHERE cs.session_id = $1
      GROUP BY cs.sale_id
    `, [session_id])

    const fbTotal  = fbResult.rows.reduce((sum, s) => sum + Number(s.fb_total), 0)
    const posItems = fbResult.rows.flatMap(s => s.pos_items)
    const row      = result.rows[0]
    const total    = Number(row.suggested_price) + fbTotal

    res.json({
      ...row,
      full_name:  row.customer_name || null,
      deposit:    Number(row.deposit || 0),
      room_total: row.suggested_price,
      pos_total:  fbTotal,
      total,
      pos_items:  posItems
    })

  } catch (err) {
    console.log("SUMMARY ERROR:", err)
    res.status(500).json({ error: err.message })
  }
}

/* ================= EXTEND SESSION ================= */

export const extendSession = async (req, res) => {
  try {
    const { session_id, extra_hours } = req.body

    if (!session_id || !extra_hours) {
      return res.status(400).json({ error: "Missing data" })
    }

    const session = await db.query(`
      SELECT room_id, end_time, actual_start, event_type, play_mode
      FROM sessions WHERE session_id = $1
    `, [session_id])

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" })
    }

    const s          = session.rows[0]
    const currentEnd = s.end_time ? new Date(s.end_time) : new Date()
    const roomId     = s.room_id
    const newEnd     = new Date(currentEnd.getTime() + Number(extra_hours) * 3600000)

    const conflict = await db.query(`
      SELECT 1 FROM sessions
      WHERE room_id = $1
      AND reservation_status IN ('Pending','Checked-In')
      AND session_id != $4
      AND start_time < $3
      AND end_time > $2
    `, [roomId, currentEnd, newEnd, session_id])

    if (conflict.rows.length) {
      return res.status(400).json({ error: "Cannot extend, room is reserved after this time" })
    }

    const room = await db.query(`
      SELECT price_single, price_multi, price_movie, price_birthday
      FROM rooms WHERE room_id = $1
    `, [roomId])

    const r = room.rows[0]
    let hourly = 0

    if (s.event_type === "Gaming") {
      hourly = s.play_mode === "Multi" ? r.price_multi : r.price_single
    } else if (s.event_type === "Movie") {
      hourly = r.price_movie
    } else if (s.event_type === "Birthday") {
      hourly = r.price_birthday
    }

    const extraPrice = hourly * Number(extra_hours)

    const result = await db.query(`
      UPDATE sessions
      SET
        end_time    = $2,
        total_price = COALESCE(total_price, 0) + $3
      WHERE session_id = $1
      RETURNING *
    `, [session_id, newEnd, extraPrice])

    req.app.get("io").emit("sessionExtended", { session_id, newEnd, extra_hours, extraPrice })
    res.json(result.rows[0])

  } catch (err) {
    console.log("EXTEND ERROR:", err)
    res.status(500).json({ error: err.message })
  }
}

/* ================= END SESSION ================= */

export const endSession = async (req, res) => {
  try {
    const io = req.app.get("io")
    const { session_id, final_price } = req.body

    const session = await db.query(`
      SELECT * FROM sessions WHERE session_id = $1
    `, [session_id])

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" })
    }

    const s       = session.rows[0]
    const endTime = new Date()
    const total   = final_price ?? s.total_price ?? 0

    const updated = await db.query(`
      UPDATE sessions
      SET
        actual_end         = $1,
        reservation_status = 'Completed',
        total_price        = $2
      WHERE session_id = $3
      RETURNING *
    `, [endTime, total, session_id])

    await db.query(`
      UPDATE shifts
      SET
        total_revenue = total_revenue + $1,
        rooms_served  = rooms_served  + 1
      WHERE status = 'Active'
    `, [total])

    io.emit("sessionEnded",    { session_id, total })
    io.emit("dashboard_update")

    res.json(updated.rows[0])

  } catch (err) {
    console.log("END ERROR:", err)
    res.status(500).json({ error: err.message })
  }
}