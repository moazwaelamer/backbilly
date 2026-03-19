import db from "../db/db.js"
import multer from "multer"
import path from "path"

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
})

export const upload = multer({ storage })

// ================= PROFILE =================
export const getPlayerProfile = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT * FROM (
        SELECT 
          p.player_id,
          p.full_name,
          p.phone,
          p.email,
          p.avatar_url,
          p.nickname,
          p.country,
          p.current_xp,
          p.tier,
          p.created_at,
          COALESCE(ps.elo_rank, 1000) AS elo_rank,
          COALESCE(ps.total_wins, 0) AS total_wins,
          COALESCE(ps.total_losses, 0) AS total_losses,
          COALESCE(ps.total_games, 0) AS total_games,
          COALESCE(ps.win_streak, 0) AS win_streak,
          COALESCE(ps.best_streak, 0) AS best_streak,
          COALESCE(ps.tier, 'Bronze') AS rank_tier,
          RANK() OVER (ORDER BY COALESCE(ps.elo_rank, 1000) DESC) AS rank,
          COALESCE(
            ROUND((ps.total_wins::decimal / NULLIF(ps.total_games, 0)) * 100, 2)
          , 0) AS win_rate
        FROM players p
        LEFT JOIN player_stats ps ON ps.player_id = p.player_id
      ) ranked
      WHERE player_id = $1
    `, [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Player not found" })
    }

    const roomBookings = await db.query(`
      SELECT 
        s.session_id AS reservation_id,
        s.start_time,
        s.end_time,
        s.event_type,
        s.play_mode,
        s.reservation_status,
        r.room_name,
        ROUND(EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600, 1) AS hours
      FROM sessions s
      LEFT JOIN rooms r ON r.room_id = s.room_id
      WHERE s.player_id = $1
      AND s.event_type != 'Tournament'
      ORDER BY s.start_time DESC
      LIMIT 10
    `, [id])

    const movieBookings = await db.query(`
      SELECT 
        b.booking_id,
        m.title AS movie_name,
        m.movie_date,
        b.seats,
        b.created_at
      FROM movie_night_bookings b
      JOIN movie_nights m ON m.movie_id = b.movie_id
      WHERE b.player_id = $1
      ORDER BY b.created_at DESC
      LIMIT 5
    `, [id])

    const tournaments = await db.query(`
      SELECT DISTINCT
        t.tournament_id,
        t.tournament_name,
        t.status,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM matches m 
            WHERE m.tournament_id = t.tournament_id 
            AND m.winner_id = $1
          ) THEN true
          ELSE false
        END AS won
      FROM tournament_registrations tr
      JOIN tournaments t ON t.tournament_id = tr.tournament_id
      WHERE tr.player_id = $1
      ORDER BY t.tournament_id DESC
    `, [id])

    const matches = await db.query(`
      SELECT 
        m.match_id,
        m.round_number AS round,
        t.tournament_name,
        COALESCE(p1.full_name, 'BYE') AS player1,
        COALESCE(p2.full_name, 'BYE') AS player2,
        COALESCE(pw.full_name, 'TBD') AS winner,
        CASE 
          WHEN m.winner_id IS NULL THEN 'PENDING'
          WHEN m.winner_id = $1 THEN 'WIN'
          ELSE 'LOSS'
        END AS result
      FROM matches m
      LEFT JOIN players p1 ON p1.player_id = m.player_1_id
      LEFT JOIN players p2 ON p2.player_id = m.player_2_id
      LEFT JOIN players pw ON pw.player_id = m.winner_id
      LEFT JOIN tournaments t ON t.tournament_id = m.tournament_id
      WHERE m.player_1_id = $1 OR m.player_2_id = $1
      ORDER BY m.match_id DESC
      LIMIT 10
    `, [id])

    const hoursPlayed = await db.query(`
      SELECT COALESCE(
        ROUND(SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600), 1)
      , 0) AS total_hours
      FROM sessions
      WHERE player_id = $1
      AND reservation_status = 'Completed'
    `, [id])

    res.json({
      ...result.rows[0],
      total_hours: Number(hoursPlayed.rows[0].total_hours).toFixed(1),
      room_bookings: roomBookings.rows,
      movie_bookings: movieBookings.rows,
      tournaments_played: tournaments.rows,
      match_history: matches.rows
    });

  } catch (err) {
    console.log("🔥 ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= UPDATE AVATAR =================
export const updateAvatar = async (req, res) => {
  const { id } = req.params
  if (!req.file) return res.status(400).json({ error: "No image uploaded" })
  const avatar_url = `/uploads/${req.file.filename}`
  try {
    const result = await db.query(
      `UPDATE players SET avatar_url=$1 WHERE player_id=$2 RETURNING *`,
      [avatar_url, id]
    )
    res.json(result.rows[0])
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
}

// ================= UPDATE PROFILE =================
export const updateProfile = async (req, res) => {
  const { id } = req.params
  const { nickname, country, email } = req.body
  try {
    const result = await db.query(`
      UPDATE players 
      SET 
        nickname = COALESCE($1, nickname),
        country = COALESCE($2, country),
        email = COALESCE($3, email)
      WHERE player_id=$4 
      RETURNING *
    `, [nickname, country, email, id])
    res.json(result.rows[0])
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
}

// ================= MATCH HISTORY =================
export const getPlayerMatches = async (req, res) => {
  const { id } = req.params;
  try {
    const matches = await db.query(`
      SELECT 
        m.match_id,
        m.round_number AS round,
        t.tournament_name,
        COALESCE(p1.full_name, 'BYE') AS player1,
        COALESCE(p2.full_name, 'BYE') AS player2,
        COALESCE(pw.full_name, 'TBD') AS winner,
        CASE 
          WHEN m.winner_id IS NULL THEN 'PENDING'
          WHEN m.winner_id = $1 THEN 'WIN'
          ELSE 'LOSS'
        END AS result
      FROM matches m
      LEFT JOIN players p1 ON p1.player_id = m.player_1_id
      LEFT JOIN players p2 ON p2.player_id = m.player_2_id
      LEFT JOIN players pw ON pw.player_id = m.winner_id
      LEFT JOIN tournaments t ON t.tournament_id = m.tournament_id
      WHERE m.player_1_id=$1 OR m.player_2_id=$1
      ORDER BY m.match_id DESC
    `, [id]);
    res.json(matches.rows);
  } catch(err) {
    console.log(err);
    res.status(500).json({ error: "Failed to load matches" });
  }
};

// ================= LEADERBOARD =================
export const getLeaderboard = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.player_id,
        p.full_name,
        p.avatar_url,
        p.nickname,
        p.country,
        p.tier,
        COALESCE(ps.elo_rank, 1000) AS elo_rank,
        COALESCE(ps.total_wins, 0) AS total_wins,
        COALESCE(ps.total_losses, 0) AS total_losses,
        COALESCE(ps.total_games, 0) AS total_games,
        COALESCE(ps.win_streak, 0) AS win_streak,
        COALESCE(ps.best_streak, 0) AS best_streak,
        COALESCE(ps.tier, 'Bronze') AS rank_tier,
        RANK() OVER (ORDER BY COALESCE(ps.elo_rank, 1000) DESC) AS rank,
        COALESCE(
          ROUND((ps.total_wins::decimal / NULLIF(ps.total_games, 0)) * 100, 2)
        , 0) AS win_rate
      FROM players p
      LEFT JOIN player_stats ps ON ps.player_id = p.player_id
      ORDER BY COALESCE(ps.elo_rank, 1000) DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch(err) {
    console.log("🔥 ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= CREATE PLAYER =================
export const createPlayer = async (req, res) => {
  const { full_name, phone } = req.body;
  try {
    if (!full_name || !phone) {
      return res.status(400).json({ error: "Name and phone required" });
    }
    const result = await db.query(`
      INSERT INTO players (full_name, phone)
      VALUES ($1,$2)
      RETURNING *
    `, [full_name, phone]);
    const player = result.rows[0];
    await db.query(`
      INSERT INTO player_stats (player_id)
      VALUES ($1)
      ON CONFLICT DO NOTHING
    `, [player.player_id]);
    res.json(player);
  } catch(err) {
    console.log(err);
    res.status(500).json({ error: "Failed to create player" });
  }
};