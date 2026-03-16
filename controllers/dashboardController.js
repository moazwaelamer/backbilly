const db = require("../db/db")

exports.getDashboardStats = async (req,res)=>{

  try{

    /* -------- TODAY REVENUE -------- */

    const revenue = await db.query(`
      SELECT COALESCE(SUM(total_price),0) AS today_revenue
      FROM sessions
      WHERE DATE(end_time) = CURRENT_DATE
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
      FROM  cafe_sales
      WHERE DATE(created_at) = CURRENT_DATE
    `)

    /* -------- ACTIVE SHIFT -------- */

    const shift = await db.query(`
      SELECT *
      FROM shifts
      WHERE status = 'Active'
      LIMIT 1
    `)

    res.json({

      today_revenue: Number(revenue.rows[0].today_revenue),
      fb_revenue: Number(fb.rows[0].fb_revenue),
      active_rooms: Number(activeRooms.rows[0].active_rooms),
      bookings_today: Number(bookings.rows[0].bookings_today),
      total_rooms: Number(totalRooms.rows[0].total_rooms),

      active_shift: shift.rows[0] || null

    })

  }catch(err){

    console.log(err)
    res.status(500).json(err.message)

  }

}