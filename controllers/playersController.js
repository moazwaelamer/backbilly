const db = require("../db/db");

exports.getPlayerProfile = async (req,res)=>{

 const {id} = req.params;

 try{

 const result = await db.query(`
 SELECT 
 p.player_id,
 p.full_name,
 p.phone,
 p.email,
 p.current_xp,
 p.tier,
 ps.elo_rank,
 ps.total_wins,
 ps.total_games,
 ps.win_streak
 FROM players p
 LEFT JOIN player_stats ps
 ON ps.player_id = p.player_id
 WHERE p.player_id = $1
 `,[id]);

 res.json(result.rows[0]);

 }catch(err){
 res.status(500).json(err.message)
 }

}


exports.getPlayerMatches = async (req,res)=>{

 const {id} = req.params

 try{

 const matches = await db.query(`
 SELECT 
 m.match_id,
 m.round,
 g.game_name,
 p1.full_name AS player1,
 p2.full_name AS player2,
 pw.full_name AS winner
 FROM matches m
 LEFT JOIN players p1 ON p1.player_id = m.player_1_id
 LEFT JOIN players p2 ON p2.player_id = m.player_2_id
 LEFT JOIN players pw ON pw.player_id = m.winner_id
 LEFT JOIN tournaments t ON t.tournament_id = m.tournament_id
 LEFT JOIN games g ON g.game_id = t.game_id
 WHERE m.player_1_id=$1 OR m.player_2_id=$1
 ORDER BY m.match_time DESC
 `,[id])

 res.json(matches.rows)

 }catch(err){
 res.status(500).json(err.message)
 }

}


exports.getPlayers = async (req,res)=>{

 try{

 const players = await db.query(`
 SELECT player_id, full_name, phone
 FROM players
 ORDER BY full_name
 `)

 res.json(players.rows)

 }catch(err){
 res.status(500).json(err.message)
 }

}


exports.createPlayer = async (req,res)=>{

 const {full_name, phone} = req.body

 try{

 const result = await db.query(`
 INSERT INTO players (full_name, phone)
 VALUES ($1,$2)
 RETURNING *
 `,
 [full_name, phone])

 res.json(result.rows[0])

 }catch(err){
 res.status(500).json(err.message)
 }

}