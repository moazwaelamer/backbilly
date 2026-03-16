const db = require("../db/db")

/* START SESSION */

exports.startSession = async (req,res)=>{

  try{

    let { room_id, duration, event_type, play_mode } = req.body

    if(event_type === "Event"){
      play_mode = null
    }

    const start = new Date()
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000)

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

    const io = req.app.get("io")
    io.emit("dashboard_update")

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

    const result = await db.query(`
      UPDATE sessions
      SET
      reservation_status = 'Checked-In',
      actual_start = NOW()
      WHERE session_id = $1
      RETURNING *
    `,
    [session_id])

    const io = req.app.get("io")
    io.emit("dashboard_update")

    res.json(result.rows[0])

  }catch(err){
    res.status(500).json(err.message)
  }

}


/* EXTEND SESSION */

exports.extendSession = async (req,res)=>{

  try{

    const { session_id, extra_hours } = req.body

    const result = await db.query(`
      UPDATE sessions
      SET end_time = end_time + ($2 * interval '1 hour')
      WHERE session_id = $1
      RETURNING *
    `,
    [
      session_id,
      extra_hours
    ])

    const io = req.app.get("io")
    io.emit("dashboard_update")

    res.json(result.rows[0])

  }catch(err){

    console.log("EXTEND SESSION ERROR:",err)
    res.status(500).json(err.message)

  }

}


/* SESSION SUMMARY */

exports.getSummary = async (req,res)=>{

  try{

    const { session_id } = req.params

    const result = await db.query(`
      SELECT
      s.session_id,
      r.room_name,
      s.actual_start,

      EXTRACT(EPOCH FROM (NOW() - s.actual_start))/3600 AS duration_hours,

      (
        CASE
        WHEN s.event_type = 'Movie' THEN r.price_movie
        WHEN s.event_type = 'Birthday' THEN r.price_birthday
        WHEN s.play_mode = 'single' THEN r.price_single
        WHEN s.play_mode = 'multi' THEN r.price_multi
        ELSE r.price_single
        END
      )
      *
      EXTRACT(EPOCH FROM (NOW() - s.actual_start))/3600
      AS suggested_price

      FROM sessions s
      JOIN rooms r
      ON r.room_id = s.room_id

      WHERE s.session_id = $1
    `,[session_id])

    if(result.rows.length === 0){
      return res.status(404).json({error:"Session not found"})
    }

    res.json(result.rows[0])

  }catch(err){

    console.log("SUMMARY ERROR:",err)
    res.status(500).json(err.message)

  }

}


/* END SESSION */

exports.endSession = async (req,res)=>{

  try{

    const { session_id } = req.body

    const priceResult = await db.query(`
      SELECT
      s.event_type,
      s.play_mode,
      s.actual_start,

      r.price_single,
      r.price_multi,
      r.price_movie,
      r.price_birthday

      FROM sessions s
      JOIN rooms r
      ON r.room_id = s.room_id

      WHERE s.session_id = $1
    `,[session_id])

    if(priceResult.rows.length === 0){
      return res.status(404).json({error:"Session not found"})
    }

    const data = priceResult.rows[0]

    const hours =
    (Date.now() - new Date(data.actual_start).getTime()) / 3600000

    let price_per_hour = 0

    if(data.event_type === "Movie"){
      price_per_hour = Number(data.price_movie)
    }
    else if(data.event_type === "Birthday"){
      price_per_hour = Number(data.price_birthday)
    }
    else if(data.play_mode === "single"){
      price_per_hour = Number(data.price_single)
    }
    else if(data.play_mode === "multi"){
      price_per_hour = Number(data.price_multi)
    }
    else{
      price_per_hour = Number(data.price_single)
    }

    let session_price = price_per_hour * hours

    session_price = Math.ceil(session_price)

    const result = await db.query(`
      UPDATE sessions
      SET
      reservation_status='Completed',
      actual_end = NOW(),
      total_price = $2
      WHERE session_id=$1
      RETURNING *
    `,
    [session_id,session_price])

    await db.query(`
      UPDATE shifts
      SET
      total_revenue = total_revenue + $1,
      rooms_served = rooms_served + 1
      WHERE status='Active'
    `,
    [session_price])

    const io = req.app.get("io")
    io.emit("dashboard_update")

    res.json({
      session: result.rows[0],
      revenue: session_price
    })

  }catch(err){

    console.log("END SESSION ERROR:",err)
    res.status(500).json(err.message)

  }

}