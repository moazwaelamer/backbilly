import express from 'express';
import path from 'path';                          // ← أضف
import { fileURLToPath } from 'url';              // ← أضف

const __filename = fileURLToPath(import.meta.url); // ← أضف
const __dirname = path.dirname(__filename);         // ← أضف

import cors from "cors"
import http from "http"
import { Server } from "socket.io"  
import pool from "./db/db.js"

import reservationsRoutes from "./routes/reservationsRoutes.js"
import dashboardRoutes from "./routes/dashboardRoutes.js"
import sessionRoutes from "./routes/sessionsRoutes.js"
import roomsRoutes from "./routes/roomsRoutes.js"
import posRoutes from "./routes/posRoutes.js"
import inventoryRoutes from "./routes/inventoryRoutes.js"
import shiftsRoutes from "./routes/shiftsRoutes.js"
import analyticsRoutes from "./routes/analyticsRoutes.js"
import moviesRoutes from "./routes/moviesRoutes.js"
import tournamentsRoutes from "./routes/tournamentsRoutes.js"
import playersRoutes from "./routes/playersRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import matchesRoutes from "./routes/matchesRoutes.js"

const app = express()

app.use(cors({ origin: "*" }))
app.use(express.json())

const server = http.createServer(app)

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }
})

app.set("io", io)

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)

  socket.on("joinTournament", (tournamentId) => {
    socket.join(`tournament_${tournamentId}`)
  })

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id)
  })
})

app.use("/api/auth",         authRoutes)
app.use("/api/reservations", reservationsRoutes)
app.use("/api/rooms",        roomsRoutes)
app.use("/api/players",      playersRoutes)
app.use("/api/sessions",     sessionRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/shifts",       shiftsRoutes)
app.use("/api/analytics",    analyticsRoutes)
app.use("/api/inventory",    inventoryRoutes)
app.use("/api/movies",       moviesRoutes)
app.use("/api/tournaments",  tournamentsRoutes)
app.use("/api/matches",      matchesRoutes)
app.use("/uploads",          express.static("uploads"))
app.use("/api/pos",          posRoutes)
app.use('/asst', express.static(path.join(__dirname, 'asst')));
const PORT = process.env.PORT || 5000

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  // ✅ AUTO-END SESSIONS — بيشتغل كل دقيقة
  // بيشوف لو في sessions خلص وقتها (end_time < NOW) وبيعملها Completed تلقائي
// ✅ صلح الـ Auto-start query
setInterval(async () => {
  try {
    const result = await pool.query(`
      UPDATE sessions
      SET
        reservation_status = 'Checked-In',
        actual_start = start_time
      WHERE reservation_status = 'Pending'
        AND start_time <= NOW()
        AND reservation_status != 'Checked-In'
      RETURNING session_id, room_id
    `)

    if (result.rows.length > 0) {
      console.log(`🚀 Auto-started ${result.rows.length} session(s)`)
      io.emit("dashboard_update")
    }
  } catch (err) {
    console.log("Auto-start error:", err.message)
  }
}, 30 * 1000)// كل 30 ثانية
})