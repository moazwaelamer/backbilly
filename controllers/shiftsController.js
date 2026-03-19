const pool = require("../db/db")

// ===== START SHIFT =====
exports.startShift = async (req,res)=>{

  // جيب الاسم من الـ token مش من الـ body
  const admin_name = req.admin?.username
  const shift_type = req.admin?.shift_type

  if(!admin_name){
    return res.status(400).json({ error:"Not authenticated" })
  }

  try{
    const active = await pool.query(
      `SELECT shift_id FROM shifts WHERE status='Active' LIMIT 1`
    )

    if(active.rows.length > 0){
      return res.status(400).json({
        error:"There is already an active shift"
      })
    }

    const result = await pool.query(
      `INSERT INTO shifts(admin_name,shift_type,status)
       VALUES($1,$2,'Active')
       RETURNING *`,
       [admin_name, shift_type || "Morning"]
    )

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json({ error: err.message })
  }
}


// ===== END SHIFT =====
exports.endShift = async (req,res)=>{

  try{

    const shift = await pool.query(
      `SELECT shift_id
       FROM shifts
       WHERE status='Active'
       LIMIT 1`
    )

    if(shift.rows.length === 0){
      return res.status(400).json({ error:"No active shift" })
    }

    const id = shift.rows[0].shift_id

    const result = await pool.query(
      `UPDATE shifts
       SET end_time = CURRENT_TIMESTAMP,
           status = 'Closed'
       WHERE shift_id = $1
       RETURNING *`,
       [id]
    )

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json({ error: err.message })
  }

}


// ===== GET ACTIVE SHIFT =====
exports.getActiveShift = async (req,res)=>{

  try{

    const result = await pool.query(
      `SELECT
        shift_id,
        admin_name,
        shift_type,
        start_time,
        NOW() - start_time AS duration,
        snacks_revenue,
        total_revenue,
        status
       FROM shifts
       WHERE status='Active'
       ORDER BY start_time DESC
       LIMIT 1`
    )

    if(result.rows.length === 0){
      return res.json(null)
    }

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json({ error: err.message })
  }

}


// ===== SHIFT HISTORY =====
exports.getShiftHistory = async (req,res)=>{
  try{
    const result = await pool.query(`
      SELECT
        sh.shift_id,
        sh.admin_name,
        sh.shift_type,
        sh.start_time,
        sh.end_time,
        sh.rooms_served,
        sh.snacks_revenue,
        sh.total_revenue,
        sh.status,
        COALESCE(SUM(s.total_price), 0) AS rooms_revenue,
        COUNT(DISTINCT s.session_id) AS sessions_count,
        sh.snacks_revenue + COALESCE(SUM(s.total_price), 0) AS grand_total
      FROM shifts sh
      LEFT JOIN sessions s 
        ON s.end_time BETWEEN sh.start_time AND COALESCE(sh.end_time, NOW())
        AND s.reservation_status = 'Completed'
      GROUP BY sh.shift_id
      ORDER BY sh.start_time DESC
    `)

    res.json(result.rows)

  }catch(err){
    res.status(500).json({ error: err.message })
  }
}