const db = require("../db/db")

// =============================
// GENERATE BRACKET LOGIC
// =============================
const generateBracketLogic = async (tournamentId) => {

  const players = await db.query(`
    SELECT player_id
    FROM tournament_registrations
    WHERE tournament_id=$1
  `,[tournamentId])

  if(players.rows.length === 0){
    return
  }

  let list = players.rows.map(p => p.player_id)

  /* RANDOMIZE PLAYERS */
  list = list.sort(()=>Math.random()-0.5)

  for(let i=0;i<list.length;i+=2){

    const p1 = list[i]
    const p2 = list[i+1] || null

    await db.query(`
      INSERT INTO matches
      (tournament_id,player_1_id,player_2_id,round_number,match_number,winner_id)
      VALUES ($1,$2,$3,1,$4,$5)
    `,[
      tournamentId,
      p1,
      p2,
      (i/2)+1,
      p2 ? null : p1
    ])
  }
}

// =============================
// CREATE TOURNAMENT
// =============================
exports.createTournament = async (req,res)=>{

  const client = await db.connect()

  try{

    const {
      tournament_name,
      entry_fee,
      max_players,
      prize_pool,
      location,
      schedule
    } = req.body

    const start = schedule[0].start_time
    const end   = schedule[0].end_time
    const room_id = schedule[0].room_id

    await client.query("BEGIN")

    /* CHECK ROOM RESERVATION CONFLICT */
    const conflict = await client.query(`
      SELECT 1
      FROM sessions
      WHERE room_id=$1
      AND reservation_status IN ('Pending','Checked-In')
      AND start_time < $3
      AND end_time > $2
    `,[room_id,start,end])

    if(conflict.rows.length > 0){
      await client.query("ROLLBACK")
      return res.status(400).json({
        error:"Room already booked for that time"
      })
    }

    /* CHECK TOURNAMENT CONFLICT */
    const tournamentConflict = await client.query(`
      SELECT 1
      FROM tournament_schedules
      WHERE room_id=$1
      AND start_time < $3
      AND end_time > $2
    `,[room_id,start,end])

    if(tournamentConflict.rows.length > 0){
      await client.query("ROLLBACK")
      return res.status(400).json({
        error:"Room already reserved for another tournament"
      })
    }

    /* CREATE TOURNAMENT */
    const result = await client.query(`
      INSERT INTO tournaments
      (tournament_name,entry_fee,max_players,prize_pool,location,status)
      VALUES ($1,$2,$3,$4,$5,'Registration Open')
      RETURNING *
    `,[
      tournament_name,
      entry_fee,
      max_players,
      prize_pool,
      location
    ])

    const tournamentId = result.rows[0].tournament_id

    /* SAVE SCHEDULE */
    await client.query(`
      INSERT INTO tournament_schedules
      (tournament_id,room_id,start_time,end_time)
      VALUES ($1,$2,$3,$4)
    `,[
      tournamentId,
      room_id,
      start,
      end
    ])

    await client.query("COMMIT")

    res.json(result.rows[0])

  }catch(err){

    await client.query("ROLLBACK")
    console.log("CREATE TOURNAMENT ERROR:",err)

    res.status(500).json({
      error:"Failed to create tournament"
    })

  }finally{
    client.release()
  }
}

// =============================
// GET TOURNAMENTS
// =============================
exports.getTournaments = async (req,res)=>{

  try{

    const tournaments = await db.query(`
      SELECT
        t.*,
        ts.start_time,
        ts.end_time,
        r.room_name,
        COUNT(tr.player_id)::int AS registered_players
      FROM tournaments t

      LEFT JOIN tournament_registrations tr
      ON tr.tournament_id = t.tournament_id

      LEFT JOIN tournament_schedules ts
      ON ts.tournament_id = t.tournament_id

      LEFT JOIN rooms r
      ON r.room_id = ts.room_id

      GROUP BY t.tournament_id, ts.start_time, ts.end_time, r.room_name
      ORDER BY ts.start_time DESC
    `)

    res.json(tournaments.rows)

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:"Failed to load tournaments"
    })
  }
}

// =============================
// JOIN TOURNAMENT
// =============================
exports.joinTournament = async (req,res)=>{

  const {id} = req.params
  const {player_id} = req.body

  try{

    const tournament = await db.query(`
      SELECT max_players,status
      FROM tournaments
      WHERE tournament_id=$1
    `,[id])

    if(tournament.rows.length === 0){
      return res.status(404).json({error:"Tournament not found"})
    }

    if(tournament.rows[0].status !== "Registration Open"){
      return res.status(400).json({
        error:"Tournament registration closed"
      })
    }

    /* CHECK ALREADY REGISTERED */
    const exists = await db.query(`
      SELECT *
      FROM tournament_registrations
      WHERE tournament_id=$1 AND player_id=$2
    `,[id,player_id])

    if(exists.rows.length > 0){
      return res.status(400).json({
        error:"Player already registered"
      })
    }

    /* COUNT PLAYERS */
    const players = await db.query(`
      SELECT COUNT(player_id) as total
      FROM tournament_registrations
      WHERE tournament_id=$1
    `,[id])

    const totalPlayers = Number(players.rows[0].total)
    const maxPlayers = tournament.rows[0].max_players

    if(totalPlayers >= maxPlayers){
      return res.status(400).json({error:"Tournament is full"})
    }

    /* REGISTER PLAYER */
    await db.query(`
      INSERT INTO tournament_registrations
      (tournament_id,player_id)
      VALUES ($1,$2)
    `,[id,player_id])

    /* RECOUNT PLAYERS */
    const updatedPlayers = await db.query(`
      SELECT COUNT(player_id) as total
      FROM tournament_registrations
      WHERE tournament_id=$1
    `,[id])

    const updatedTotal = Number(updatedPlayers.rows[0].total)

    /* AUTO GENERATE BRACKET */
    if(updatedTotal === maxPlayers){

      await generateBracketLogic(id)

      await db.query(`
        UPDATE tournaments
        SET status='Started'
        WHERE tournament_id=$1
      `,[id])
    }

    res.json({
      message:"Joined tournament"
    })

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:"Failed to join tournament"
    })
  }
}

// =============================
// GET PLAYERS
// =============================
exports.getTournamentPlayers = async (req,res)=>{

  const {id} = req.params

  try{

    const players = await db.query(`
      SELECT
        p.player_id,
        p.full_name,
        p.phone
      FROM tournament_registrations tr
      JOIN players p
      ON p.player_id = tr.player_id
      WHERE tr.tournament_id = $1
    `,[id])

    res.json(players.rows)

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:"Failed to load players"
    })
  }
}

// =============================
// GET MATCHES
// =============================
exports.getTournamentMatches = async (req,res)=>{

  const {id} = req.params

  try{

    const matches = await db.query(`
      SELECT
        m.match_id,
        m.round_number AS round,
        m.match_number,
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

    res.status(500).json({
      error:"Failed to load matches"
    })
  }
}

// =============================
// REMOVE PLAYER
// =============================
exports.removePlayer = async (req,res)=>{

  const {tournamentId,playerId} = req.params

  try{

    await db.query(`
      DELETE FROM tournament_registrations
      WHERE tournament_id=$1 AND player_id=$2
    `,[tournamentId,playerId])

    res.json({
      message:"Player removed"
    })

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:"Failed to remove player"
    })
  }
}

// =============================
// DELETE TOURNAMENT
// =============================
exports.deleteTournament = async (req,res)=>{

  const {id} = req.params

  try{

    await db.query(`DELETE FROM matches WHERE tournament_id=$1`,[id])
    await db.query(`DELETE FROM tournament_registrations WHERE tournament_id=$1`,[id])
    await db.query(`DELETE FROM tournament_schedules WHERE tournament_id=$1`,[id])
    await db.query(`DELETE FROM tournaments WHERE tournament_id=$1`,[id])

    res.json({
      message:"Tournament deleted"
    })

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:"Failed to delete tournament"
    })
  }
}

// =============================
// GENERATE BRACKET (MANUAL)
// =============================
exports.generateBracket = async (req,res)=>{

  try{

    const { id } = req.params

    const players = await db.query(`
      SELECT player_id
      FROM tournament_registrations
      WHERE tournament_id=$1
    `,[id])

    if(players.rows.length < 2){
      return res.status(400).json({
        error:"Not enough players"
      })
    }

    const existing = await db.query(`
      SELECT match_id
      FROM matches
      WHERE tournament_id=$1
    `,[id])

    if(existing.rows.length > 0){
      return res.status(400).json({
        error:"Bracket already generated"
      })
    }

    await generateBracketLogic(id)

    res.json({
      message:"Bracket generated"
    })

  }catch(err){

    console.log(err)

    res.status(500).json({
      error:"Failed to generate bracket"
    })
  }
}