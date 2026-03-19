const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")
const app = express()
const reservationsRoutes = require("./routes/reservationsRoutes")
const dashboardRoutes = require("./routes/dashboardRoutes")
const sessionRoutes = require("./routes/sessionsRoutes")
const roomsRoutes = require("./routes/roomsRoutes")
const posRoutes = require("./routes/posRoutes")
const inventoryRoutes = require("./routes/inventoryRoutes")
const shiftsRoutes = require("./routes/shiftsRoutes")
const analyticsRoutes = require("./routes/analyticsRoutes")
const moviesRoutes = require("./routes/moviesRoutes")
const tournamentsRoutes = require("./routes/tournamentsRoutes")
const playersRoutes = require("./routes/playersRoutes")
const authRoutes = require("./routes/authRoutes")
const matchesRoutes = require("./routes/matchesRoutes")




/* ================= MIDDLEWARE ================= */

app.use(cors({
  origin: "*"
}))

app.use(express.json())

/* ================= HTTP SERVER ================= */

const server = http.createServer(app)

/* ================= SOCKET.IO ================= */

const io = new Server(server,{
  cors:{
    origin:"*",
    methods:["GET","POST","PUT","DELETE"]
  }
})

app.set("io",io)

io.on("connection",(socket)=>{

  console.log("Client connected:",socket.id)

  socket.on("joinTournament",(tournamentId)=>{
    socket.join(`tournament_${tournamentId}`)
  })

  socket.on("disconnect",()=>{
    console.log("Client disconnected:",socket.id)
  })

})

/* ================= ROUTES ================= */

app.use("/api/auth",authRoutes)

app.use("/api/reservations", reservationsRoutes)
app.use("/api/rooms", roomsRoutes)
app.use("/api/players", playersRoutes)
app.use("/api/sessions", sessionRoutes)

app.use("/api/dashboard",dashboardRoutes)
app.use("/api/shifts", shiftsRoutes)
app.use("/api/analytics", analyticsRoutes)

app.use("/api/inventory", inventoryRoutes)
app.use("/api/movies", moviesRoutes)

app.use("/api/tournaments", tournamentsRoutes)
app.use("/api/matches", matchesRoutes)
/* ================= STATIC FILES ================= */

app.use("/uploads", express.static("uploads"))

/* ================= POS ================= */

app.use("/pos", posRoutes)

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

