import db from "../db/db.js"

/* ================= CREATE RESERVATION ================= */

export const createReservation = async (req,res)=>{

  try{
    
    const {
      player_id = null,
      room_id,
      event_type,
      play_mode,
      start_time,
      end_time,
      source = "Admin"
    } = req.body

    const conflict = await db.query(`
      SELECT 1
      FROM sessions
      WHERE room_id = $1
      AND reservation_status IN ('Pending','Checked-In')
      AND (start_time < $3 AND end_time > $2)
    `,[room_id,start_time,end_time])

    if(conflict.rows.length > 0){
      return res.status(400).json({
        error:"Room already booked in this time slot"
      })
    }

    const room = await db.query(`
      SELECT price_single, price_multi, price_movie, price_birthday
      FROM rooms
      WHERE room_id = $1
    `,[room_id])

    const roomData = room.rows[0]

    const start = new Date(start_time)
    const end = new Date(end_time)
    const duration = (end - start) / (1000 * 60 * 60)

    let base = 0

    if(event_type === "Gaming"){
      base = play_mode === "Multi"
        ? roomData.price_multi
        : roomData.price_single
    }

    if(event_type === "Movie") base = roomData.price_movie
    if(event_type === "Birthday") base = roomData.price_birthday

    const total_price = base * duration

    const result = await db.query(`
      INSERT INTO sessions
      (
        player_id,
        room_id,
        event_type,
        play_mode,
        start_time,
        end_time,
        source,
        total_price,
        reservation_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending')
      RETURNING *
    `,[
      player_id,
      room_id,
      event_type,
      play_mode,
      start_time,
      end_time,
      source,
      total_price
    ])

    res.json(result.rows[0])

  }catch(err){
    console.log(err)
    res.status(500).json(err.message)
  }

}


/* ================= GET RESERVATIONS ================= */

export const getReservations = async (req,res)=>{

  try{

    const result = await db.query(`
      SELECT
        s.session_id,
        p.full_name,
        p.phone,
        r.room_name,
        s.start_time,
        s.end_time,
        s.reservation_status,
        s.event_type,
        s.play_mode
      FROM sessions s
      LEFT JOIN players p ON s.player_id = p.player_id
      LEFT JOIN rooms r ON s.room_id = r.room_id
      ORDER BY s.start_time DESC
    `)

    res.json(result.rows)

  }catch(err){
    res.status(500).json(err.message)
  }

}


/* ================= GET ALL ROOMS ================= */



/* ================= GET ALL ROOMS ================= */

export const getRooms = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        r.room_id,
        r.room_name,
        r.capacity,
        r.price_single,
        r.price_multi,
        r.price_movie,
        r.price_birthday,
        r.image,

        s.session_id,
        s.reservation_status,
        s.start_time,
        s.end_time,
        s.actual_start,
        s.customer_name,
        s.customer_phone,
        s.event_type,
        s.play_mode,

        CASE
          WHEN s.reservation_status = 'Checked-In' THEN 'Occupied'
          WHEN s.reservation_status = 'Pending'
               AND s.start_time <= NOW() + INTERVAL '60 minutes' THEN 'Reserved'
          ELSE 'Available'
        END AS status

      FROM rooms r

      LEFT JOIN LATERAL (
        SELECT *
        FROM sessions
        WHERE room_id = r.room_id
        AND reservation_status IN ('Pending','Checked-In')
        ORDER BY start_time DESC
        LIMIT 1
      ) s ON true

      WHERE r.is_active = true
      ORDER BY r.room_id
    `)

    res.json(result.rows)

  } catch (err) {
    console.log(err)
    res.status(500).json(err.message)
  }
}

/* ================= GET AVAILABLE ROOMS ================= */

export const getAvailableRooms = async (req, res) => {
  try {
    const { start_time, end_time } = req.query

    const result = await db.query(`
      SELECT
        r.room_id,
        r.room_name,
        r.price_single,
        r.price_multi,
        r.price_movie,
        r.price_birthday
      FROM rooms r
      WHERE r.is_active = true
      AND r.room_id NOT IN (
        SELECT s.room_id
        FROM sessions s
        WHERE s.reservation_status IN ('Pending','Checked-In')
        AND (s.start_time < $2 AND s.end_time > $1)
      )
      ORDER BY r.room_id
    `, [start_time, end_time])

    res.json(result.rows)
  } catch (err) {
    console.log(err)
    res.status(500).json(err.message)
  }
}