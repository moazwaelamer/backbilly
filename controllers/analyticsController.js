import pool from "../db/db.js"

/* ================= MOST BOOKED ROOM ================= */

export  const getMostBookedRoom = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.room_name, COUNT(*) AS bookings
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      GROUP BY r.room_name
      ORDER BY bookings DESC
      LIMIT 1
    `)
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= TOP SNACK ================= */

export const getTopSnack = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.item_name, SUM(s.quantity) AS total_sold
      FROM cafe_sale_items s
      JOIN inventory i ON i.item_id = s.item_id
      GROUP BY i.item_name
      ORDER BY total_sold DESC
      LIMIT 1
    `)
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= REPEAT CUSTOMERS ================= */

export const getRepeatCustomers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS repeat_customers
      FROM (
        SELECT player_id
        FROM sessions
        WHERE player_id IS NOT NULL
        GROUP BY player_id
        HAVING COUNT(*) > 1
      ) sub
    `)
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= WEEKLY REVENUE (rooms + cafe) ================= */

export const getWeeklyRevenue = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        day,
        SUM(revenue) AS revenue,
        SUM(rooms_revenue)  AS rooms_revenue,
        SUM(cafe_revenue)   AS cafe_revenue
      FROM (

        -- إيراد الأوضات
        SELECT
          TO_CHAR(actual_start, 'Dy') AS day,
          EXTRACT(DOW FROM actual_start)  AS dow,
          SUM(
            EXTRACT(EPOCH FROM (end_time - actual_start)) / 3600
            * r.price_single 
          ) AS revenue,
          SUM(
            EXTRACT(EPOCH FROM (end_time - actual_start)) / 3600
            * r.price_single 
          ) AS rooms_revenue,
          0 AS cafe_revenue
        FROM sessions s
        JOIN rooms r ON r.room_id = s.room_id
        WHERE s.actual_start >= NOW() - INTERVAL '7 days'
          AND s.reservation_status = 'Checked-In'
          AND s.end_time IS NOT NULL
        GROUP BY day, dow

        UNION ALL

        -- إيراد الكافيه
        SELECT
          TO_CHAR(created_at, 'Dy') AS day,
          EXTRACT(DOW FROM created_at) AS dow,
          SUM(total_amount) AS revenue,
          0                 AS rooms_revenue,
          SUM(total_amount) AS cafe_revenue
        FROM cafe_sales
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY day, dow

      ) combined
      GROUP BY day, dow
     ORDER BY dow
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= PEAK HOURS ================= */

export const getPeakHours = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM actual_start) AS hour,
        COUNT(*) AS sessions
      FROM sessions
      WHERE actual_start IS NOT NULL
      GROUP BY hour
      ORDER BY sessions DESC
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= TODAY STATS ================= */

export const getTodayStats = async (req, res) => {
  try {

    // إيراد الأوضات النهارده
    const roomsToday = await pool.query(`
      SELECT COALESCE(SUM(s.total_price), 0) AS revenue
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE DATE(s.actual_start) = CURRENT_DATE
        AND s.reservation_status = 'Checked-In'
        AND s.end_time IS NOT NULL
    `)

    // إيراد الكافيه النهارده
    const cafeToday = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS revenue
      FROM cafe_sales
      WHERE DATE(created_at) = CURRENT_DATE
    `)

    // عدد السيشنز النهارده
    const sessionsToday = await pool.query(`
      SELECT COUNT(*) AS count
      FROM sessions
      WHERE DATE(actual_start) = CURRENT_DATE
        AND actual_start IS NOT NULL
    `)

    // عدد مبيعات الكافيه النهارده
    const salesToday = await pool.query(`
      SELECT COUNT(*) AS count
      FROM cafe_sales
      WHERE DATE(created_at) = CURRENT_DATE
    `)

    const roomsRev  = Number(roomsToday.rows[0]?.revenue || 0)
    const cafeRev   = Number(cafeToday.rows[0]?.revenue  || 0)

    res.json({
      rooms_revenue:  roomsRev,
      cafe_revenue:   cafeRev,
      total_revenue:  roomsRev + cafeRev,
      sessions_count: Number(sessionsToday.rows[0]?.count || 0),
      sales_count:    Number(salesToday.rows[0]?.count    || 0),
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ================= SUMMARY (كل حاجة مع بعض) ================= */

export const getSummary = async (req, res) => {
  try {

    const mostBookedRoom = await pool.query(`
      SELECT r.room_name, COUNT(*) AS bookings
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      GROUP BY r.room_name
      ORDER BY bookings DESC
      LIMIT 1
    `)

    const topSnack = await pool.query(`
      SELECT i.item_name, SUM(s.quantity) AS total_sold
      FROM cafe_sale_items s
      JOIN inventory i ON i.item_id = s.item_id
      GROUP BY i.item_name
      ORDER BY total_sold DESC
      LIMIT 1
    `)

    const repeatCustomers = await pool.query(`
      SELECT COUNT(*) AS repeat_customers
      FROM (
        SELECT player_id
        FROM sessions
        WHERE player_id IS NOT NULL
        GROUP BY player_id
        HAVING COUNT(*) > 1
      ) sub
    `)

    const weeklyRevenue = await pool.query(`
      SELECT
        day,
        dow,
        SUM(revenue)       AS revenue,
        SUM(rooms_revenue) AS rooms_revenue,
        SUM(cafe_revenue)  AS cafe_revenue
      FROM (

        SELECT
          TO_CHAR(actual_start, 'Dy') AS day,
          EXTRACT(DOW FROM actual_start) AS dow,
          SUM(
            EXTRACT(EPOCH FROM (end_time - actual_start)) / 3600
            * r.price_single 
          ) AS revenue,
          SUM(
            EXTRACT(EPOCH FROM (end_time - actual_start)) / 3600
            * r.price_single 
          ) AS rooms_revenue,
          0 AS cafe_revenue
        FROM sessions s
        JOIN rooms r ON r.room_id = s.room_id
        WHERE s.actual_start >= NOW() - INTERVAL '7 days'
          AND s.reservation_status = 'Completed'
          AND s.end_time IS NOT NULL
        GROUP BY
          TO_CHAR(actual_start, 'Dy'),
          EXTRACT(DOW FROM actual_start)

        UNION ALL

        SELECT
          TO_CHAR(created_at, 'Dy') AS day,
          EXTRACT(DOW FROM created_at) AS dow,
          SUM(total_amount) AS revenue,
          0                 AS rooms_revenue,
          SUM(total_amount) AS cafe_revenue
        FROM cafe_sales
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY
          TO_CHAR(created_at, 'Dy'),
          EXTRACT(DOW FROM created_at)

      ) combined
      GROUP BY day, dow
      ORDER BY dow
    `)

    const peakHours = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM actual_start) AS hour,
        COUNT(*) AS sessions
      FROM sessions
      WHERE actual_start IS NOT NULL
      GROUP BY hour
      ORDER BY hour
    `)

    const roomsToday = await pool.query(`
      SELECT COALESCE(SUM(s.total_price), 0) AS revenue
FROM sessions s
WHERE DATE(s.actual_start) = CURRENT_DATE
AND s.reservation_status = 'Completed'
    `)

    const cafeToday = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS revenue
      FROM cafe_sales
      WHERE DATE(created_at) = CURRENT_DATE
    `)

    const roomsRev = Number(roomsToday.rows[0]?.revenue || 0)
    const cafeRev  = Number(cafeToday.rows[0]?.revenue  || 0)

    res.json({
      stats: {
        mostBookedRoom:  mostBookedRoom.rows[0]?.room_name   || "N/A",
        topSnack:        topSnack.rows[0]?.item_name         || "N/A",
        repeatCustomers: repeatCustomers.rows[0]?.repeat_customers || 0,
      },
      today: {
        rooms_revenue: roomsRev,
        cafe_revenue:  cafeRev,
        total_revenue: roomsRev + cafeRev,
      },
      weeklyRevenue: weeklyRevenue.rows,
      peakHours:     peakHours.rows,
    })

  } catch (err) {
    console.log("🔥 ERROR HERE:", err.message)
    res.status(500).json({ error: err.message })
  }
}