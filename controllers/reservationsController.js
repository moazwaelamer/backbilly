const db = require("../db/db")

/* ================= CREATE RESERVATION ================= */

exports.createReservation = async (req,res)=>{

  try{

    const io = req.app.get("io")

   const {
  name,
  phone,
  room_id,
  start_time,
  end_time,
  event_type,
  play_mode,
  seats
} = req.body
    if(!name || !phone){
      return res.status(400).json({
        error:"Name and phone are required"
      })
    }
const start = new Date(start_time)
const end = new Date(end_time)

if(start >= end){
  return res.status(400).json({
    error:"Invalid time range"
  })
}

    /* ================= MOVIE EVENT ================= */

   if(event_type === "Movie"){

const result = await db.query(`
INSERT INTO movie_night_bookings
(customer_name, phone, seats, booking_time)
VALUES ($1,$2,$3,NOW())
RETURNING *
`,[name,phone,seats || 1])

io.emit("reservationCreated")

return res.json(result.rows[0])

}

    /* ================= NORMAL ROOM BOOKING ================= */

    /* CHECK CONFLICT */

    /* CHECK ROOM BOOKING CONFLICT */

const conflict = await db.query(`
SELECT 1
FROM sessions
WHERE room_id = $1
AND reservation_status IN ('Pending','Checked-In')
AND start_time < $3
AND end_time > $2
`,[room_id,start,end])

if(conflict.rows.length > 0){
  return res.status(400).json({
    error:"Room already booked"
  })
}

/* CHECK TOURNAMENT CONFLICT */

const tournamentConflict = await db.query(`
SELECT 1
FROM tournament_schedules ts
JOIN tournaments t
ON t.tournament_id = ts.tournament_id
WHERE ts.room_id = $1
AND t.status != 'Completed'
AND ts.start_time < $3
AND ts.end_time > $2
`,[room_id,start,end])

if(tournamentConflict.rows.length > 0){
  return res.status(400).json({
    error:"Room reserved for tournament"
  })
}
    const result = await db.query(`
     INSERT INTO sessions
(customer_name,customer_phone,room_id,event_type,play_mode,start_time,end_time,reservation_status)
VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending')
      RETURNING *
    `,
    [
      name,
      phone,
      room_id,
      event_type,
      play_mode,
      start,
      end
    ])

    io.emit("reservationCreated")

    res.json(result.rows[0])

  }catch(err){

    console.log("DB ERROR:",err.message)

    res.status(500).json({
      error:err.message
    })

  }

} 
exports.getReservations = async (req,res)=>{

  try{

    const result = await db.query(`

      SELECT
        s.session_id AS id,
        s.customer_name,
        s.customer_phone,
        r.room_name,
        s.event_type,
        s.start_time,
        s.end_time,
        s.reservation_status,
        s.source

      FROM sessions s
      JOIN rooms r ON s.room_id = r.room_id

      UNION ALL

      SELECT
        m.booking_id AS id,
        m.customer_name,
        m.phone AS customer_phone,
        'Movie Event' AS room_name,
        'Movie' AS event_type,
        m.booking_time AS start_time,
        m.booking_time AS end_time,
        'Booked' AS reservation_status,
        'Website' AS source

      FROM movie_night_bookings m

      ORDER BY start_time DESC
    `)

    res.json(result.rows)

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:err.message
    })

  }

}
/* ================= CHECK IN RESERVATION ================= */

exports.checkInReservation = async (req,res)=>{

  try{

    const io = req.app.get("io")

    const { session_id } = req.body

    /* UPDATE SESSION */

    const session = await db.query(`
      UPDATE sessions
      SET
        reservation_status='Checked-In',
        actual_start = NOW()
      WHERE session_id=$1
      RETURNING *
    `,[session_id])

   if(session.rows.length === 0){
return res.status(404).json({
error:"Session not found"
})
}

const room_id = session.rows[0].room_id

    /* GET ROOM PRICE */

    const room = await db.query(`
      SELECT price_per_hour
      FROM rooms
      WHERE room_id=$1
    `,[room_id])

    const price = room.rows[0]?.price_per_hour || 0

    /* UPDATE ACTIVE SHIFT */

    await db.query(`
      UPDATE shifts
      SET
        rooms_served = rooms_served + 1,
        total_revenue = total_revenue + $1
      WHERE status='Active'
    `,[price])

    io.emit("sessionStarted")

    res.json(session.rows[0])

  }catch(err){

    res.status(500).json({
      error:err.message
    })

  }

}/* ================= GET AVAILABILITY ================= */

exports.getAvailability = async (req,res)=>{

try{

const { room_id, date } = req.query

const result = await db.query(`

SELECT to_char(slot,'HH24:MI') as slot
FROM generate_series(
($2 || ' 00:00')::timestamp,
($2 || ' 23:30')::timestamp,
interval '30 minutes'
) slot

WHERE NOT EXISTS (

SELECT 1
FROM sessions s
WHERE s.room_id = $1
AND s.reservation_status IN ('Pending','Checked-In') -- 🔥 أهم سطر
AND slot >= s.start_time
AND slot < s.end_time

)

AND NOT EXISTS (

SELECT 1
FROM tournament_schedules ts
WHERE ts.room_id = $1
AND slot >= ts.start_time
AND slot < ts.end_time

)

ORDER BY slot

`,[room_id,date])

res.json(result.rows.map(r=>r.slot))

}catch(err){

console.log(err)

res.status(500).json({
error:"Failed to load availability"
})

}

}