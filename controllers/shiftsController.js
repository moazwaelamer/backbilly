const pool = require("../db/db")

// ===== START SHIFT =====
exports.startShift = async (req,res)=>{

  const { admin_name, shift_type } = req.body   // Morning / Evening

  if(!admin_name){
    return res.status(400).json({ error:"admin_name is required" })
  }

  try{

    // تأكد مفيش شيفت شغال
    const active = await pool.query(
      `SELECT shift_id
       FROM shifts
       WHERE status='Active'
       LIMIT 1`
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

    const result = await pool.query(
      `SELECT
        shift_id,
        admin_name,
        shift_type,
        start_time,
        end_time,
        rooms_served,
        snacks_revenue,
        total_revenue,
        status
       FROM shifts
       ORDER BY start_time DESC`
    )

    res.json(result.rows)

  }catch(err){
    res.status(500).json({ error: err.message })
  }

}