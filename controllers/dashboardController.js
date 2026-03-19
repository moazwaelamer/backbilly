const db = require("../db/db")

exports.getDashboardStats = async (req,res)=>{
  try{

    /* -------- SESSIONS TODAY DETAILS -------- */
    const sessionsToday = await db.query(`
      SELECT 
        s.session_id,
        s.customer_name,
        s.customer_phone,
        r.room_name,
        s.event_type,
        s.play_mode,
        s.start_time,
        s.end_time,
        s.actual_start,
        s.actual_end,
        COALESCE(s.total_price, 0) AS total_price,
        s.reservation_status,
        s.source
      FROM sessions s
      LEFT JOIN rooms r ON r.room_id = s.room_id
      WHERE DATE(s.start_time) = CURRENT_DATE
      AND s.event_type != 'Tournament'
      ORDER BY s.start_time DESC
    `)

    /* -------- SHIFT REVENUE -------- */
    const shiftRevenue = await db.query(`
      SELECT
        sh.shift_id,
        sh.admin_name,
        sh.shift_type,
        sh.start_time,
        sh.end_time,
        sh.status,
        COALESCE(SUM(s.total_price), 0) AS rooms_revenue,
        COALESCE(sh.snacks_revenue, 0) AS snacks_revenue,
        COALESCE(SUM(s.total_price), 0) + COALESCE(sh.snacks_revenue, 0) AS total_revenue,
        COUNT(DISTINCT s.session_id) AS sessions_count
      FROM shifts sh
      LEFT JOIN sessions s 
        ON s.end_time BETWEEN sh.start_time AND COALESCE(sh.end_time, NOW())
        AND s.reservation_status = 'Completed'
      WHERE DATE(sh.start_time) = CURRENT_DATE
      GROUP BY sh.shift_id
      ORDER BY sh.start_time DESC
    `)

    /* -------- TODAY REVENUE -------- */
    const revenue = await db.query(`
      SELECT COALESCE(SUM(total_price),0) AS today_revenue
      FROM sessions
      WHERE DATE(end_time) = CURRENT_DATE
      AND reservation_status = 'Completed'
    `)

    /* -------- ACTIVE ROOMS -------- */
    const activeRooms = await db.query(`
      SELECT COUNT(*) AS active_rooms
      FROM sessions
      WHERE reservation_status = 'Checked-In'
    `)

    /* -------- BOOKINGS TODAY -------- */
    const bookings = await db.query(`
      SELECT COUNT(*) AS bookings_today
      FROM sessions
      WHERE DATE(start_time) = CURRENT_DATE
      AND event_type != 'Tournament'
    `)

    /* -------- TOTAL ROOMS -------- */
    const totalRooms = await db.query(`
      SELECT COUNT(*) AS total_rooms
      FROM rooms
      WHERE is_active = true
    `)

    /* -------- F&B REVENUE -------- */
    const fb = await db.query(`
      SELECT COALESCE(SUM(total_amount),0) AS fb_revenue
      FROM cafe_sales
      WHERE DATE(created_at) = CURRENT_DATE
    `)

    /* -------- ACTIVE SHIFT -------- */
    const shift = await db.query(`
      SELECT *
      FROM shifts
      WHERE status = 'Active'
      LIMIT 1
    `)

    /* -------- MOST BOOKED ROOM TODAY -------- */
    const mostBookedRoom = await db.query(`
      SELECT r.room_name, COUNT(*) AS bookings
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE DATE(s.start_time) = CURRENT_DATE
      GROUP BY r.room_name
      ORDER BY bookings DESC
      LIMIT 1
    `)

    /* -------- TODAY F&B SALES DETAILS -------- */
    const fbSales = await db.query(`
      SELECT 
        cs.sale_id,
        cs.total_amount,
        cs.payment_method,
        cs.created_at,
        json_agg(json_build_object(
          'item_name', i.item_name,
          'quantity', csi.quantity,
          'price', csi.price,
          'subtotal', csi.subtotal
        )) AS items
      FROM cafe_sales cs
      JOIN cafe_sale_items csi ON csi.sale_id = cs.sale_id
      JOIN inventory i ON i.item_id = csi.item_id
      WHERE DATE(cs.created_at) = CURRENT_DATE
      GROUP BY cs.sale_id
      ORDER BY cs.created_at DESC
    `)

    /* -------- LOW STOCK -------- */
    const lowStock = await db.query(`
      SELECT item_id, item_name, stock_quantity, low_stock_threshold
      FROM inventory
      WHERE stock_quantity <= low_stock_threshold
      AND status = 'Available'
      ORDER BY stock_quantity ASC
    `)

    /* -------- TOURNAMENTS TODAY -------- */
    const tournaments = await db.query(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.status,
        t.max_players,
        COUNT(tr.player_id)::int AS registered_players
      FROM tournaments t
      LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.tournament_id
      WHERE DATE(t.start_date) = CURRENT_DATE
      GROUP BY t.tournament_id
      ORDER BY t.tournament_id DESC
    `)

    res.json({
      today_revenue: Number(revenue.rows[0].today_revenue),
      fb_revenue: Number(fb.rows[0].fb_revenue),
      active_rooms: Number(activeRooms.rows[0].active_rooms),
      bookings_today: Number(bookings.rows[0].bookings_today),
      total_rooms: Number(totalRooms.rows[0].total_rooms),
      active_shift: shift.rows[0] || null,
      sessions_today: sessionsToday.rows,
      shifts_today: shiftRevenue.rows,
      most_booked_room: mostBookedRoom.rows[0] || null,
      fb_sales_today: fbSales.rows,
      low_stock: lowStock.rows,
      tournaments_today: tournaments.rows
    })

  }catch(err){
    console.log(err)
    res.status(500).json(err.message)
  }
}