import pool from "../db/db.js"

/* ================= PRICE LOGIC ================= */
const PRICE_CASE = `
  CASE 
    WHEN s.event_type = 'Gaming' AND s.play_mode = 'Single' THEN r.price_single
    WHEN s.event_type = 'Gaming' AND s.play_mode = 'Multi'  THEN r.price_multi
    WHEN s.event_type = 'Movie'   THEN r.price_movie
    WHEN s.event_type = 'Birthday' THEN r.price_birthday
    ELSE 0
  END
`

/* ================= START SHIFT ================= */
export const startShift = async (req, res) => {
  const { admin_name, shift_type } = req.body

  if (!admin_name) {
    return res.status(400).json({ error: "admin_name is required" })
  }

  try {
    const active = await pool.query(`
      SELECT shift_id FROM shifts
      WHERE status = 'Active'
        AND shift_type = $1
    `, [shift_type || "Morning"])

    if (active.rows.length > 0) {
      return res.status(400).json({
        error: `${shift_type} shift already active`
      })
    }

    const result = await pool.query(`
      INSERT INTO shifts (admin_name, shift_type, status)
      VALUES ($1, $2, 'Active')
      RETURNING *
    `, [admin_name, shift_type || "Morning"])

    res.json(result.rows[0])

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= END SHIFT ================= */
export const endShift = async (req, res) => {
  try {
    const io = req.app.get("io")
    const { shift_id } = req.body

    const shift = await pool.query(`
      SELECT * FROM shifts WHERE shift_id = $1
    `, [shift_id])

    if (shift.rows.length === 0) {
      return res.status(404).json({ error: "Shift not found" })
    }

    const startTime = shift.rows[0].start_time

    /* ===== SESSIONS ===== */
    const sessions = await pool.query(`
      SELECT
        s.session_id,
        r.room_name,
        s.customer_name,
        s.customer_phone,
        s.event_type,
        s.play_mode,
        s.actual_start,
        s.end_time,

        (EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.actual_start)) / 3600) AS duration_hours,

        (EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.actual_start)) / 3600)
        * ${PRICE_CASE} AS total_price

      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE s.actual_start >= $1
        AND s.actual_start IS NOT NULL
    `, [startTime])

    const roomsRev = sessions.rows.reduce(
      (sum, s) => sum + Number(s.total_price || 0),
      0
    )

    /* ===== CAFE ===== */
    const cafe = await pool.query(`
      SELECT
        cs.sale_id,
        cs.total_amount,
        cs.payment_method,
        cs.created_at,
        r.room_name,
        json_agg(
          json_build_object(
            'item_name', i.item_name,
            'quantity', si.quantity,
            'subtotal', si.subtotal
          )
        ) AS items
      FROM cafe_sales cs
      LEFT JOIN sessions s ON cs.session_id = s.session_id
      LEFT JOIN rooms r ON s.room_id = r.room_id
      JOIN cafe_sale_items si ON si.sale_id = cs.sale_id
      JOIN inventory i ON i.item_id = si.item_id
      WHERE cs.shift_id = $1
      GROUP BY cs.sale_id, r.room_name
    `, [shift_id])

    const cafeRev = cafe.rows.reduce(
      (sum, c) => sum + Number(c.total_amount || 0),
      0
    )

    /* ===== UPDATE SHIFT ===== */
    const result = await pool.query(`
      UPDATE shifts
      SET
        end_time = NOW(),
        status = 'Closed',
        total_revenue = $2,
        snacks_revenue = $3,
        rooms_served = $4
      WHERE shift_id = $1
      RETURNING *
    `, [
      shift_id,
      roomsRev + cafeRev,
      cafeRev,
      sessions.rows.length
    ])

    /* ===== REALTIME ===== */
    io.emit("shiftEnded", {
      shift: result.rows[0],
      sessions: sessions.rows,
      sales: cafe.rows,
      summary: {
        rooms_revenue: roomsRev,
        cafe_revenue: cafeRev,
        total: roomsRev + cafeRev
      }
    })

    res.json({
      shift: result.rows[0],
      sessions: sessions.rows,
      sales: cafe.rows,
      summary: {
        rooms_revenue: roomsRev,
        cafe_revenue: cafeRev,
        total: roomsRev + cafeRev
      }
    })

  } catch (err) {
    console.log(err)
    res.status(500).json({ error: err.message })
  }
}

/* ================= GET ACTIVE SHIFT ================= */
export const getActiveShift = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM shifts
      WHERE status = 'Active'
      ORDER BY start_time DESC
    `)

    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= SHIFT HISTORY ================= */
export const getShiftHistory = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM shifts
      ORDER BY start_time DESC
    `)

    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= SHIFT REPORT ================= */
export const getShiftReport = async (req, res) => {
  const { id } = req.params

  try {
    const shift = await pool.query(`
      SELECT * FROM shifts WHERE shift_id = $1
    `, [id])

    if (!shift.rows.length) {
      return res.status(404).json({ error: "Shift not found" })
    }

    const sessions = await pool.query(`
      SELECT
        s.session_id,
        r.room_name,
        s.customer_name,
        s.actual_start,
        s.end_time,

        (EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.actual_start)) / 3600) AS duration_hours,

        (EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.actual_start)) / 3600)
        * ${PRICE_CASE} AS total_price

      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE s.actual_start >= (SELECT start_time FROM shifts WHERE shift_id = $1)
        AND s.actual_start <= COALESCE(
          (SELECT end_time FROM shifts WHERE shift_id = $1),
          NOW()
        )
      ORDER BY s.actual_start ASC
    `, [id])

    const sales = await pool.query(`
      SELECT
        cs.sale_id,
        cs.total_amount,
        cs.created_at
      FROM cafe_sales cs
      WHERE cs.shift_id = $1
      ORDER BY cs.created_at ASC
    `, [id])

    res.json({
      shift: shift.rows[0],
      sessions: sessions.rows,
      sales: sales.rows
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}