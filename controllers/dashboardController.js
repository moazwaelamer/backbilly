import pool from "../db/db.js"

export const getDashboardStats = async (req, res) => {
  try {

    // ✅ FIX 1: بيحسب revenue للـ Checked-In والـ Completed
    const revenue = await pool.query(`
      SELECT COALESCE(SUM(
        ROUND(
          (EXTRACT(EPOCH FROM (COALESCE(s.actual_end, NOW())- s.actual_start)) / 3600)
          * CASE
              WHEN s.event_type = 'Gaming' AND s.play_mode = 'Single' THEN r.price_single
              WHEN s.event_type = 'Gaming' AND s.play_mode = 'Multi'  THEN r.price_multi
              WHEN s.event_type = 'Movie'    THEN r.price_movie
              WHEN s.event_type = 'Birthday' THEN r.price_birthday
              ELSE 0
            END
        , 2)
      ), 0) AS today_revenue
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE DATE(s.actual_start AT TIME ZONE 'Africa/Cairo') = DATE(NOW() AT TIME ZONE 'Africa/Cairo')
        AND s.reservation_status IN ('Checked-In', 'Completed')
        AND s.actual_start IS NOT NULL
    `)

    const fb = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS fb_revenue
      FROM cafe_sales
      WHERE DATE(created_at AT TIME ZONE 'Africa/Cairo') = DATE(NOW() AT TIME ZONE 'Africa/Cairo')
    `)

    const activeRooms = await pool.query(`
  SELECT COUNT(*) AS active_rooms FROM sessions
  WHERE reservation_status = 'Checked-In'
  AND actual_start IS NOT NULL
  AND (end_time IS NULL OR end_time > NOW())
`)

    const totalRooms = await pool.query(`
      SELECT COUNT(*) AS total_rooms FROM rooms WHERE is_active = true
    `)

    const bookings = await pool.query(`
      SELECT COUNT(*) AS bookings_today FROM sessions
      WHERE DATE(start_time AT TIME ZONE 'Africa/Cairo') = DATE(NOW() AT TIME ZONE 'Africa/Cairo')
    `)

    const shift = await pool.query(`
      SELECT * FROM shifts WHERE status = 'Active' LIMIT 1
    `)

    // ✅ FIX 2: بيستخدم total_price المحفوظ في الـ DB مش بيحسبها من أول
    const todaySessions = await pool.query(`
      SELECT
        s.session_id,
        r.room_name,
        s.customer_name,
        s.event_type,
        s.play_mode,
        s.start_time,
        s.end_time,
        s.actual_start,
        s.reservation_status,
        -- ✅ لو total_price محفوظ نستخدمه، لو لأ نحسبه ونقربه
        ROUND(COALESCE(
          s.total_price,
          (EXTRACT(EPOCH FROM (COALESCE(s.actual_end, s.end_time, NOW()) - s.actual_start)) / 3600)
          * CASE
              WHEN s.event_type = 'Gaming' AND s.play_mode = 'Single' THEN r.price_single
              WHEN s.event_type = 'Gaming' AND s.play_mode = 'Multi'  THEN r.price_multi
              WHEN s.event_type = 'Movie'    THEN r.price_movie
              WHEN s.event_type = 'Birthday' THEN r.price_birthday
              ELSE 0
            END
        , 0), 2) AS total_price
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE DATE(s.start_time AT TIME ZONE 'Africa/Cairo') = DATE(NOW() AT TIME ZONE 'Africa/Cairo')
      ORDER BY s.start_time DESC
    `)

    const shiftsToday = await pool.query(`
      SELECT
        shift_id, admin_name, shift_type, start_time, end_time,
        status, snacks_revenue, total_revenue,
        rooms_served AS sessions_count,
        ROUND((total_revenue - snacks_revenue)::numeric, 2) AS rooms_revenue
      FROM shifts
      WHERE DATE(start_time AT TIME ZONE 'Africa/Cairo') = DATE(NOW() AT TIME ZONE 'Africa/Cairo')
      ORDER BY start_time DESC
    `)

    const lowStock = await pool.query(`
      SELECT item_id, item_name, stock_quantity
      FROM inventory
      WHERE stock_quantity <= 5 AND status != 'Deleted'
      ORDER BY stock_quantity ASC
    `)

    res.json({
      today_revenue:  Number(revenue.rows[0].today_revenue),
      fb_revenue:     Number(fb.rows[0].fb_revenue),
      total_revenue:  Number(revenue.rows[0].today_revenue) + Number(fb.rows[0].fb_revenue),
      active_rooms:   Number(activeRooms.rows[0].active_rooms),
      total_rooms:    Number(totalRooms.rows[0].total_rooms),
      bookings_today: Number(bookings.rows[0].bookings_today),
      active_shift:   shift.rows[0] || null,
      sessions_today: todaySessions.rows,
      shifts_today:   shiftsToday.rows,
      low_stock:      lowStock.rows,
    })

  } catch (err) {
    console.log(err)
    res.status(500).json({ error: err.message })
  }
}