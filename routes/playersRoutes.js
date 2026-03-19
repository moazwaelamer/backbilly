import express from "express"
import db from "../db/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import multer from "multer"
import * as controller from "../controllers/playersController.js"

const router = express.Router()

const SECRET = "bilys_secret_key_2026"

/* ============================= */
/* MULTER (رفع الصور) */
/* ============================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  }
})

const upload = multer({ storage })

/* ============================= */
/* REGISTER */
/* ============================= */
router.post("/register", async (req, res) => {
  const { full_name, phone, email, password, nickname, country } = req.body

  if (!full_name || !phone || !email || !password) {
    return res.status(400).json({ error: "All fields are required" })
  }

  try {
    const exists = await db.query(
      `SELECT player_id FROM players WHERE email=$1 OR phone=$2`,
      [email, phone]
    )

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: "Email or phone already registered" })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const result = await db.query(
      `INSERT INTO players (full_name, phone, email, password_hash, nickname, country, current_xp, tier)
       VALUES ($1,$2,$3,$4,$5,$6,0,'Bronze')
       RETURNING player_id, full_name, phone, email, nickname, country, current_xp, tier`,
      [full_name, phone, email, password_hash, nickname || null, country || null]
    )

    const player = result.rows[0]

    await db.query(
      `INSERT INTO player_stats (player_id, elo_rank, total_games, total_wins, win_streak)
       VALUES ($1,1000,0,0,0) ON CONFLICT DO NOTHING`,
      [player.player_id]
    )

    const token = jwt.sign(
      { player_id: player.player_id, role: "player" },
      SECRET,
      { expiresIn: "7d" }
    )

    res.json({
      player_id: player.player_id,
      full_name: player.full_name,
      phone: player.phone,
      email: player.email,
      nickname: player.nickname,
      country: player.country,
      xp: player.current_xp,
      tier: player.tier,
      role: "player",
      token
    })

  } catch (err) {
    console.log(err)
    res.status(500).json({ error: err.message })
  }
})

/* ============================= */
/* LOGIN */
/* ============================= */
router.post("/login", async (req, res) => {
  const { phone, password } = req.body

  if (!phone || !password) {
    return res.status(400).json({ error: "Phone and password required" })
  }

  try {
    const result = await db.query(
      `SELECT p.*, ps.elo_rank, ps.total_games, ps.total_wins, ps.win_streak
       FROM players p
       LEFT JOIN player_stats ps ON ps.player_id = p.player_id
       WHERE p.phone=$1`,
      [phone]
    )

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Player not found" })
    }

    const player = result.rows[0]

    if (!player.password_hash) {
      return res.status(400).json({ error: "Account has no password, contact admin" })
    }

    const valid = await bcrypt.compare(password, player.password_hash)
    if (!valid) return res.status(400).json({ error: "Wrong password" })

    const token = jwt.sign(
      { player_id: player.player_id, role: "player" },
      SECRET,
      { expiresIn: "7d" }
    )

    res.json({
      player_id: player.player_id,
      full_name: player.full_name,
      phone: player.phone,
      email: player.email,
      nickname: player.nickname,
      country: player.country,
      avatar_url: player.avatar_url,
      xp: player.current_xp || 0,
      tier: player.tier || "Bronze",
      elo_rank: player.elo_rank || 1000,
      total_games: player.total_games || 0,
      total_wins: player.total_wins || 0,
      role: "player",
      token
    })

  } catch (err) {
    console.log(err)
    res.status(500).json({ error: err.message })
  }
})

/* ============================= */
/* ROUTES من الـ controller */
/* ============================= */
router.get("/leaderboard", controller.getLeaderboard)
router.get("/:id/matches", controller.getPlayerMatches)
router.get("/:id", controller.getPlayerProfile)
router.post("/", controller.createPlayer)

// ✅ هنا استخدمنا upload الصح
router.post("/:id/avatar", upload.single("avatar"), controller.updateAvatar)

router.put("/:id", controller.updateProfile)

export default router