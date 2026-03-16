const pool = require("../db/db")

exports.getMostBookedRoom = async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT r.room_name,
      COUNT(*) AS bookings
      FROM sessions s
      JOIN rooms r
      ON r.room_id = s.room_id
      GROUP BY r.room_name
      ORDER BY bookings DESC
      LIMIT 1
    `)

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json(err.message)
  }

}
exports.getTopSnack = async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT i.item_name,
      SUM(s.quantity) AS total_sold
      FROM cafe_sale_items s
      JOIN inventory i
      ON i.item_id = s.item_id
      GROUP BY i.item_name
      ORDER BY total_sold DESC
      LIMIT 1
    `)

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json(err.message)
  }

}
exports.getRepeatCustomers = async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT COUNT(*) AS repeat_customers
      FROM (
        SELECT player_id
        FROM sessions
        GROUP BY player_id
        HAVING COUNT(*) > 1
      ) sub
    `)

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json(err.message)
  }

}
exports.getWeeklyRevenue = async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT
      TO_CHAR(created_at,'Dy') AS day,
      SUM(total_amount) AS revenue
      FROM cafe_sales
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day
    `)

    res.json(result.rows)

  }catch(err){
    res.status(500).json(err.message)
  }

}
exports.getPeakHours = async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT
      EXTRACT(HOUR FROM start_time) AS hour,
      COUNT(*) AS sessions
      FROM sessions
      GROUP BY hour
      ORDER BY sessions DESC
    `)

    res.json(result.rows)

  }catch(err){
    res.status(500).json(err.message)
  }

}
exports.getSummary = async (req,res)=>{

  try{

    const mostBookedRoom = await pool.query(`
      SELECT r.room_name,
      COUNT(*) AS bookings
      FROM sessions s
      JOIN rooms r
      ON r.room_id = s.room_id
      GROUP BY r.room_name
      ORDER BY bookings DESC
      LIMIT 1
    `)

    const topSnack = await pool.query(`
      SELECT i.item_name,
      SUM(s.quantity) AS total_sold
      FROM cafe_sale_items s
      JOIN inventory i
      ON i.item_id = s.item_id
      GROUP BY i.item_name
      ORDER BY total_sold DESC
      LIMIT 1
    `)

    const repeatCustomers = await pool.query(`
      SELECT COUNT(*) AS repeat_customers
      FROM (
        SELECT player_id
        FROM sessions
        GROUP BY player_id
        HAVING COUNT(*) > 1
      ) sub
    `)

    const weeklyRevenue = await pool.query(`
      SELECT
      TO_CHAR(created_at,'Dy') AS day,
      SUM(total_amount) AS revenue
      FROM cafe_sales
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day
    `)

    const peakHours = await pool.query(`
      SELECT
      EXTRACT(HOUR FROM start_time) AS hour,
      COUNT(*) AS sessions
      FROM sessions
      GROUP BY hour
      ORDER BY sessions DESC
      LIMIT 5
    `)

    res.json({

      mostBookedRoom: mostBookedRoom.rows[0],

      topSnack: topSnack.rows[0],

      repeatCustomers: repeatCustomers.rows[0],

      weeklyRevenue: weeklyRevenue.rows,

      peakHours: peakHours.rows

    })

  }catch(err){

    res.status(500).json(err.message)

  }

}