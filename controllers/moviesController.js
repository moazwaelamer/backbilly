import pool from "../db/db.js"

/* CREATE MOVIE NIGHT */

export const createMovie = async (req,res)=>{

const { title, movie_date, total_seats, price } = req.body

if(!req.file){
  return res.status(400).json({
    error:"Movie image is required"
  })
}

const image_url = `/uploads/${req.file.filename}`

const client = await pool.connect()

try{

await client.query("BEGIN")

const movie = await client.query(
`INSERT INTO movie_nights
(title,movie_date,total_seats,price,image_url)
VALUES($1,$2,$3,$4,$5)
RETURNING movie_id`,
[title,movie_date,total_seats,price,image_url]
)

const movieId = movie.rows[0].movie_id

/* GENERATE SEATS */

const rows = ['A','B','C','D','E','F','G','H']

let seatCount = 0

for(let r=0;r<rows.length;r++){

for(let i=1;i<=5;i++){

if(seatCount >= total_seats) break

const seat = `${rows[r]}${i}`

await client.query(
`INSERT INTO movie_seats(movie_id,seat_number)
VALUES($1,$2)`,
[movieId,seat]
)

seatCount++

}

}

await client.query("COMMIT")

res.json({
message:"Movie created",
movie_id:movieId
})

}catch(err){

await client.query("ROLLBACK")

res.status(500).json({
error:err.message
})

}finally{

client.release()

}

}


/* GET MOVIES */

export const getMovies = async (req,res)=>{

try{

const result = await pool.query(`
SELECT 
m.movie_id,
m.title,
m.movie_date,
m.total_seats,
m.price,
m.image_url,
COUNT(s.seat_number) FILTER (WHERE s.is_booked=true) AS booked_seats
FROM movie_nights m
LEFT JOIN movie_seats s 
ON m.movie_id = s.movie_id
GROUP BY m.movie_id
ORDER BY m.movie_date
`)

res.json(result.rows)

}catch(err){

res.status(500).json({
error:err.message
})

}

}


/* GET SEATS */

export const getSeats = async (req,res)=>{

const { id } = req.params

try{

const result = await pool.query(
`SELECT seat_number,is_booked
FROM movie_seats
WHERE movie_id=$1
ORDER BY seat_number`,
[id]
)

res.json(result.rows)

}catch(err){

res.status(500).json({
error:err.message
})

}

}


/* BOOK SEATS */

export const bookSeats = async (req,res)=>{

const { movie_id, name, phone } = req.body
let { seats } = req.body

const client = await pool.connect()

try{

await client.query("BEGIN")

/* CHECK SOLD OUT */

const check = await client.query(
`SELECT COUNT(*) 
FROM movie_seats 
WHERE movie_id=$1 AND is_booked=true`,
[movie_id]
)

const booked = Number(check.rows[0].count)

const total = await client.query(
`SELECT total_seats 
FROM movie_nights 
WHERE movie_id=$1`,
[movie_id]
)

const totalSeats = total.rows[0].total_seats

if(booked >= totalSeats){

await client.query("ROLLBACK")

return res.status(400).json({
error:"Event sold out"
})

}

/* AUTO SEAT */

if(seats && seats[0] === "AUTO"){

const freeSeat = await client.query(
`SELECT seat_number
FROM movie_seats
WHERE movie_id=$1 AND is_booked=false
LIMIT 1`,
[movie_id]
)

if(freeSeat.rows.length === 0){

await client.query("ROLLBACK")

return res.status(400).json({
error:"No seats available"
})

}

seats = [freeSeat.rows[0].seat_number]

}

/* BOOK SEATS */

for(const seat of seats){

await client.query(
`UPDATE movie_seats
SET is_booked=true
WHERE movie_id=$1 AND seat_number=$2`,
[movie_id,seat]
)

}

/* UPDATE BOOKED SEATS */

await client.query(
`UPDATE movie_nights
SET booked_seats = booked_seats + $1
WHERE movie_id=$2`,
[seats.length, movie_id]
)

/* SAVE BOOKING */

await client.query(
`INSERT INTO movie_night_bookings
(movie_id,customer_name,phone,seats)
VALUES($1,$2,$3,$4)`,
[movie_id,name,phone,seats.length]
)

await client.query("COMMIT")

res.json({
message:"Seats booked",
seats
})

}catch(err){

await client.query("ROLLBACK")

res.status(500).json({
error:err.message
})

}finally{

client.release()

}

}


/* DELETE MOVIE */

export const deleteMovie = async (req,res)=>{

const { id } = req.params

const client = await pool.connect()

try{

await client.query("BEGIN")

await client.query(
`DELETE FROM movie_seats WHERE movie_id=$1`,
[id]
)

await client.query(
`DELETE FROM movie_nights WHERE movie_id=$1`,
[id]
)

await client.query("COMMIT")

res.json({
message:"Movie deleted"
})

}catch(err){

await client.query("ROLLBACK")

res.status(500).json({
error:err.message
})

}finally{

client.release()

}

}


/* GET MOVIE BOOKINGS */

export const getMovieBookings = async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query(`
      SELECT 
        b.booking_id,
        b.customer_name,
        b.phone,
        b.seats,
        b.created_at
      FROM movie_night_bookings b
      WHERE b.movie_id = $1
      ORDER BY b.created_at DESC
    `, [id])
    res.json(result.rows)
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
}