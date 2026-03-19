import db from "../db/db.js"
/* ============================= */
/* GENERATE BRACKET LOGIC */
/* ============================= */
const generateBracketLogic = async (client, tournamentId) => {

  const players = await client.query(`
    SELECT tr.player_id, ps.elo_rank
    FROM tournament_registrations tr
    JOIN player_stats ps ON ps.player_id = tr.player_id
    WHERE tr.tournament_id=$1
    ORDER BY ps.elo_rank DESC
  `,[tournamentId])

  if(players.rows.length < 2) throw new Error("Not enough players")

  const existing = await client.query(`
    SELECT 1 FROM matches WHERE tournament_id=$1
  `,[tournamentId])

  if(existing.rows.length) throw new Error("Bracket already exists")

  const playersList = players.rows
  let matchNumber = 1
  let round1Matches = []

  // Round 1
  let i = 0, j = playersList.length - 1
  while(i < j){
    const result = await client.query(`
      INSERT INTO matches
      (tournament_id, player_1_id, player_2_id, round_number, match_number, winner_id)
      VALUES ($1,$2,$3,1,$4,NULL)
      RETURNING match_id
    `,[tournamentId, playersList[i].player_id, playersList[j].player_id, matchNumber++])
    round1Matches.push(result.rows[0].match_id)
    i++; j--;
  }

  // bye
  if(i === j){
    const result = await client.query(`
      INSERT INTO matches
      (tournament_id, player_1_id, player_2_id, round_number, match_number, winner_id)
      VALUES ($1,$2,NULL,1,$3,$2)
      RETURNING match_id
    `,[tournamentId, playersList[i].player_id, matchNumber++])
    round1Matches.push(result.rows[0].match_id)
  }

  // باقي الـ rounds
  let prevRoundMatches = round1Matches
  let currentRound = 2

  while(prevRoundMatches.length > 1){
    let nextRoundMatches = []

    for(let k = 0; k < prevRoundMatches.length; k += 2){
      const result = await client.query(`
        INSERT INTO matches
        (tournament_id, player_1_id, player_2_id, round_number, match_number, winner_id)
        VALUES ($1,NULL,NULL,$2,$3,NULL)
        RETURNING match_id
      `,[tournamentId, currentRound, matchNumber++])

      const nextMatchId = result.rows[0].match_id

      await client.query(`
        UPDATE matches SET next_match_id=$1 WHERE match_id=$2
      `,[nextMatchId, prevRoundMatches[k]])

      if(prevRoundMatches[k+1]){
        await client.query(`
          UPDATE matches SET next_match_id=$1 WHERE match_id=$2
        `,[nextMatchId, prevRoundMatches[k+1]])
      }

      nextRoundMatches.push(nextMatchId)
    }

    prevRoundMatches = nextRoundMatches
    currentRound++
  }
}
/* ============================= */
/* CREATE TOURNAMENT */
/* ============================= */
export const createTournament  = async (req, res) => {
  const client = await db.connect();

  try {
    const {
      tournament_name,
      entry_fee,
      max_players,
      prize_pool,
      location,
      start_date,
      end_date,
      schedule,
       room_id
    } = req.body;

    await client.query("BEGIN");

    // ✅ INSERT tournament (مظبوط)
    const result = await client.query(
      `INSERT INTO tournaments
(tournament_name, entry_fee, max_players, prize_pool, location, start_date, end_date, status, room_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,'Registration Open',$8)
RETURNING *`,
      [
        tournament_name,
        entry_fee,
        max_players,
        prize_pool,
        location,
        start_date,
        end_date,
        room_id
      ]
    );

    const tournamentId = result.rows[0].tournament_id;

    // ✅ validation صح
    if (schedule && !Array.isArray(schedule)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Schedule must be an array" });
    }

    if (schedule) {
  for (const slot of schedule) {
    const { room_id: slotRoomId, start_time, end_time } = slot;

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (isNaN(start) || isNaN(end)) {
      throw new Error("Invalid date format");
    }

    const overlap = await client.query(`
      SELECT 1 FROM sessions
      WHERE room_id=$1
      AND tstzrange(start_time, end_time) && tstzrange($2, $3)
    `, [slotRoomId, start, end]);  // ← هنا

    if (overlap.rows.length) {
      throw new Error("Room is already booked at this time");
    }

    await client.query(`
      INSERT INTO tournament_schedules
      (tournament_id, room_id, start_time, end_time)
      VALUES ($1,$2,$3,$4)
    `, [tournamentId, slotRoomId, start, end]);  // ← وهنا

    await client.query(`
      INSERT INTO sessions
      (room_id, event_type, play_mode, reservation_status, start_time, end_time, actual_start, source)
      VALUES ($1,'Tournament',NULL,'Pending',$2,$3,NULL,'Admin')
    `, [slotRoomId, start, end]);  // ← وهنا
}
    }
    await client.query("COMMIT");

    res.json(result.rows[0]);

  } catch (err) {
    await client.query("ROLLBACK");

    console.log("ERROR:", err.message);

    res.status(500).json({ error: err.message });

  } finally {
    client.release();
  }
};
/* ============================= */
/* GET TOURNAMENTS */
/* ============================= */
export const getTournaments = async (req,res)=>{

  try{

    const tournaments = await db.query(`
      SELECT
        t.*,
       COALESCE(
  json_agg(
    json_build_object(
      'start_time', ts.start_time,
      'end_time', ts.end_time,
      'room_name', r.room_name
    )
  ) FILTER (WHERE ts.schedule_id IS NOT NULL),
  '[]'
) AS schedule,
        COUNT(DISTINCT tr.player_id)::int AS registered_players
      FROM tournaments t
      LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.tournament_id
      LEFT JOIN tournament_schedules ts ON ts.tournament_id = t.tournament_id
      LEFT JOIN rooms r ON r.room_id = ts.room_id
      GROUP BY t.tournament_id
      ORDER BY t.tournament_id DESC
    `)

    res.json(tournaments.rows)

  }catch(err){

    console.log(err)

    res.status(400).json({ error: err.message })
  }
}

/* ============================= */
/* JOIN TOURNAMENT */
/* ============================= */
export const joinTournament = async (req,res)=>{

  const client = await db.connect()

  try{

    const {id} = req.params
    const {player_id} = req.body

    await client.query("BEGIN")

    const tournament = await client.query(`
      SELECT max_players,status
      FROM tournaments
      WHERE tournament_id=$1
    `,[id])

    if(tournament.rows.length === 0){
      throw new Error("Tournament not found")
    }

    if(tournament.rows[0].status !== "Registration Open"){
      throw new Error("Registration closed")
    }

    const exists = await client.query(`
      SELECT 1 FROM tournament_registrations
      WHERE tournament_id=$1 AND player_id=$2
    `,[id,player_id])

    if(exists.rows.length){
      throw new Error("Already registered")
    }

    const players = await client.query(`
      SELECT COUNT(player_id) as total
      FROM tournament_registrations
      WHERE tournament_id=$1
    `,[id])

    const totalPlayers = Number(players.rows[0].total)
    const maxPlayers = tournament.rows[0].max_players

    if(totalPlayers >= maxPlayers){
      throw new Error("Tournament full")
    }

    await client.query(`
      INSERT INTO tournament_registrations
      (tournament_id,player_id)
      VALUES ($1,$2)
    `,[id,player_id])

    await client.query(`
  INSERT INTO player_stats
  (player_id, elo_rank, total_games, total_wins, win_streak)
  VALUES ($1,1000,0,0,0)
  ON CONFLICT DO NOTHING
`,[player_id])

    const updatedPlayers = await client.query(`
      SELECT COUNT(player_id) as total
      FROM tournament_registrations
      WHERE tournament_id=$1
    `,[id])

  if(Number(updatedPlayers.rows[0].total) === maxPlayers){

    await generateBracketLogic(client, id)

    const matches = await client.query(`
      SELECT * FROM matches
      WHERE tournament_id=$1
      ORDER BY match_number
    `, [id])

    const sessions = await client.query(`
      SELECT s.*
      FROM sessions s
      JOIN tournament_schedules ts 
        ON ts.room_id = s.room_id
        AND ts.start_time::timestamptz = s.start_time
      WHERE ts.tournament_id = $1
      ORDER BY s.start_time
    `, [id])

    const round1Matches = matches.rows.filter(m => m.round_number === 1)

    for (let i = 0; i < round1Matches.length; i++) {
      const match = round1Matches[i]
      const session = sessions.rows[i]

     if (session) {
  await client.query(`
    UPDATE sessions SET match_id=$1 WHERE session_id=$2
  `,[match.match_id, session.session_id])
}
    }
 
    await client.query(`
      UPDATE tournaments
      SET status='In Progress'
      WHERE tournament_id=$1
    `,[id])

  } // ← إقفال الـ if

  await client.query("COMMIT")
  res.json({ message:"Joined tournament" })

  }catch(err){
    await client.query("ROLLBACK")
    res.status(400).json({ error: err.message })
  }finally{
    client.release()
  }
}

/* ============================= */
/* GET MATCHES */
/* ============================= */
export const getTournamentMatches = async (req,res)=>{

  const {id} = req.params

  try{

    const matches = await db.query(`
      SELECT
        m.match_id,
        m.round_number AS round,
        m.match_number,
        m.player_1_id,
        m.player_2_id,
        p1.full_name AS player1,
        p2.full_name AS player2,
        pw.full_name AS winner
      FROM matches m
      LEFT JOIN players p1 ON p1.player_id = m.player_1_id
      LEFT JOIN players p2 ON p2.player_id = m.player_2_id
      LEFT JOIN players pw ON pw.player_id = m.winner_id
      WHERE m.tournament_id=$1
      ORDER BY m.round_number,m.match_number
    `,[id])

    res.json(matches.rows)

  }catch(err){

    console.log(err)

   res.status(400).json({ error: err.message })
  }
}/* ============================= */
/* GET SINGLE TOURNAMENT */
/* ============================= */
export const getTournamentById = async (req,res)=>{

  const { id } = req.params

  try{

    const result = await db.query(`
      SELECT 
    t.*,
    COALESCE(
      json_agg(
        json_build_object(
          'room_id', ts.room_id,
          'room_name', r.room_name,
          'start_time', ts.start_time,
          'end_time', ts.end_time
        )
      ) FILTER (WHERE ts.schedule_id IS NOT NULL),
      '[]'
    ) AS schedule
  FROM tournaments t
  LEFT JOIN tournament_schedules ts ON ts.tournament_id = t.tournament_id
  LEFT JOIN rooms r ON r.room_id = ts.room_id
  WHERE t.tournament_id=$1
  GROUP BY t.tournament_id
`, [id])

    if(result.rows.length === 0){
      return res.status(404).json({error:"Tournament not found"})
    }

 const scheduleData = await db.query(`
  SELECT ts.room_id, r.room_name, ts.start_time, ts.end_time
  FROM tournament_schedules ts
  JOIN rooms r ON r.room_id = ts.room_id
  WHERE ts.tournament_id = $1
`, [id])

res.json({
  ...result.rows[0],
  schedule: scheduleData.rows
})

  }catch(err){

    console.log(err)

   res.status(400).json({ error: err.message })
  }

}

/* ============================= */
/* DELETE TOURNAMENT */
/* ============================= */
export const deleteTournament = async (req,res)=>{
  const { id } = req.params;
  const client = await db.connect();

  try{
    await client.query("BEGIN");

    // 1. امسح sessions المرتبطة بالـ matches
    await client.query(`
      DELETE FROM sessions 
      WHERE match_id IN (
        SELECT match_id FROM matches WHERE tournament_id=$1
      )
    `,[id]);

    // 2. امسح الـ matches
    await client.query(`DELETE FROM matches WHERE tournament_id=$1`,[id]);

    // 3. امسح الـ registrations
    await client.query(`DELETE FROM tournament_registrations WHERE tournament_id=$1`,[id]);

    // 4. امسح sessions المرتبطة بالـ schedules
    await client.query(`
      DELETE FROM sessions 
      WHERE session_id IN (
        SELECT s.session_id FROM sessions s
        JOIN tournament_schedules ts 
          ON ts.room_id = s.room_id 
          AND ts.start_time::timestamptz = s.start_time
        WHERE ts.tournament_id=$1
      )
    `,[id]);

    // 5. امسح الـ schedules
    await client.query(`DELETE FROM tournament_schedules WHERE tournament_id=$1`,[id]);

    // 6. امسح الـ tournament
    await client.query(`DELETE FROM tournaments WHERE tournament_id=$1`,[id]);

    await client.query("COMMIT");

    res.json({ message:"Tournament deleted" });

  }catch(err){
    await client.query("ROLLBACK");
    console.log(err);
    res.status(400).json({ error: err.message })
  }finally{
    client.release();
  }
};
export const getTournamentPlayers = async (req, res) => {
  const { id } = req.params
  try{
    const result = await db.query(`
      SELECT p.player_id, p.full_name, p.phone
      FROM tournament_registrations tr
      JOIN players p ON p.player_id = tr.player_id
      WHERE tr.tournament_id = $1
    `, [id])
    res.json(result.rows)
  }catch(err){
    res.status(500).json({ error: err.message })
  }
}