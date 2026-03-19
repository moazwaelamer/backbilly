const db = require("../db/db")

/* START SESSION */

exports.startSession = async (req,res)=>{

  try{

    let { room_id, duration, event_type, play_mode } = req.body

    if(!room_id || !duration){
      return res.status(400).json({error:"Missing data"})
    }

    if(event_type === "Event"){
      play_mode = null
    }

    const hours = Number(duration)

    if(isNaN(hours) || hours <= 0){
      return res.status(400).json({error:"Invalid duration"})
    }

    const start = new Date()
    const end = new Date(start.getTime() + hours * 60 * 60 * 1000)

    // 🔥 CHECK CONFLICT (مكانه الصح)
    const conflict = await db.query(`
      SELECT 1 FROM sessions
      WHERE room_id=$1
      AND reservation_status IN ('Pending','Checked-In')
      AND (start_time < $3 AND end_time > $2)
    `,[room_id, start, end])

    if(conflict.rows.length){
      return res.status(400).json({error:"Room busy"})
    }

    const result = await db.query(`
      INSERT INTO sessions
      (
        room_id,
        event_type,
        play_mode,
        reservation_status,
        start_time,
        end_time,
        actual_start,
        source
      )
      VALUES ($1,$2,$3,'Checked-In',$4,$5,$4,'Admin')
      RETURNING *
    `,
    [
      room_id,
      event_type,
      play_mode,
      start,
      end
    ])

    req.app.get("io").emit("dashboard_update")

    res.json(result.rows[0])

  }catch(err){

    console.log("START SESSION ERROR:",err)
    res.status(500).json(err.message)

  }
}

/* CHECK IN */
exports.checkIn = async (req,res)=>{

  try{

    const { session_id } = req.body

    if(!session_id){
      return res.status(400).json({error:"Missing session_id"})
    }

    const result = await db.query(`
      UPDATE sessions
      SET
      reservation_status = 'Checked-In',
      actual_start = NOW()
      WHERE session_id = $1
      RETURNING *
    `,
    [session_id])

    req.app.get("io").emit("dashboard_update")

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json(err.message)
  }

}

/* SESSION SUMMARY */
exports.getSummary = async (req, res) => {
  try{
    const { session_id } = req.params

    const result = await db.query(`
      SELECT
        s.session_id,
        s.customer_name,
        s.customer_phone,
        r.room_name,
        s.actual_start,
        s.event_type,
        s.play_mode,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(s.actual_start, NOW())))/3600 AS duration_hours,
        (
          CASE
            WHEN s.event_type = 'Movie' THEN r.price_movie
            WHEN s.event_type = 'Birthday' THEN r.price_birthday
            WHEN s.event_type = 'Tournament' THEN 0
            WHEN s.play_mode = 'single' THEN r.price_single
            WHEN s.play_mode = 'multi' THEN r.price_multi
            ELSE r.price_single
          END
        ) * EXTRACT(EPOCH FROM (NOW() - COALESCE(s.actual_start, NOW())))/3600
        AS suggested_price
      FROM sessions s
      JOIN rooms r ON r.room_id = s.room_id
      WHERE s.session_id = $1
    `,[session_id])

    if(result.rows.length === 0){
      return res.status(404).json({error:"Session not found"})
    }

    // جيب الـ F&B orders
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
    `,[session_id])

    const fbTotal = fbResult.rows.reduce((sum, s) => sum + Number(s.fb_total), 0)
    const posItems = fbResult.rows.flatMap(s => s.pos_items)

   const total =
  Number(result.rows[0].suggested_price) + fbTotal;

res.json({
  ...result.rows[0],
  room_total: result.rows[0].suggested_price,
  pos_total: fbTotal,
  total,
  pos_items: posItems
});

  }catch(err){
    console.log("SUMMARY ERROR:", err)
    res.status(500).json(err.message)
  }
}


/* END SESSION */
exports.extendSession = async (req,res)=>{

  try{

    const { session_id, extra_hours } = req.body

    if(!session_id || !extra_hours){
      return res.status(400).json({ error:"Missing data" })
    }

    // 🔥 هات السيشن الحالي
    const session = await db.query(`
      SELECT room_id, end_time
      FROM sessions
      WHERE session_id = $1
    `,[session_id])

    if(session.rows.length === 0){
      return res.status(404).json({ error:"Session not found" })
    }

    const currentEnd = session.rows[0].end_time
    const roomId = session.rows[0].room_id

    const newEnd = new Date(
      new Date(currentEnd).getTime() + Number(extra_hours) * 3600000
    )

    // 🔥 check conflict (مهم جدًا)
    const conflict = await db.query(`
      SELECT 1 FROM sessions
      WHERE room_id=$1
      AND reservation_status IN ('Pending','Checked-In')
      AND session_id != $4 -- 🔥 استبعد نفسك
      AND start_time < $3
      AND end_time > $2
    `,[roomId, currentEnd, newEnd, session_id])

    if (conflict.rows.length) {
      return res.status(400).json({ 
        error: "Cannot extend, room is reserved after this time" 
      })
    }

    // ✅ update
    const result = await db.query(`
      UPDATE sessions
      SET end_time = $2
      WHERE session_id = $1
      RETURNING *
    `,[session_id, newEnd])

    req.app.get("io").emit("dashboard_update")

    res.json(result.rows[0])

  }catch(err){

    console.log("EXTEND ERROR:",err)
    res.status(500).json(err.message)

  }

}

exports.endSession = async (req,res)=>{
  try{

    const { session_id } = req.body

    if(!session_id){
      return res.status(400).json({error:"Missing session_id"})
    }

    const result = await db.query(`
      UPDATE sessions
      SET
        reservation_status='Completed',
        actual_end = NOW()
      WHERE session_id=$1
      RETURNING *
    `,[session_id])

    req.app.get("io").emit("dashboard_update")

    res.json(result.rows[0])

  }catch(err){
    console.log("END ERROR:",err)
    res.status(500).json(err.message)
  }
}