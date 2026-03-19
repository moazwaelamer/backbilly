const db = require("../db/db");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

function getStage(round, totalRounds){
  if(round === totalRounds) return "Final";
  if(round === totalRounds - 1) return "Semi-final";
  if(round === totalRounds - 2) return "Quarter-final";
  return "Normal";
}

exports.setMatchWinner = async (req,res)=>{

const client = await db.connect();

try{

await client.query("BEGIN");

const {id} = req.params;
const winnerId = Number(req.body.winner_id);

// ✅ FIX: validation
if(!winnerId){
  throw new Error("winner_id is required");
}

/* ================= GET MATCH ================= */

const match = await client.query(`
  SELECT * FROM matches WHERE match_id=$1 FOR UPDATE
`, [id]);

if(match.rows.length === 0){
  await client.query("ROLLBACK");
  return res.status(404).json({error:"Match not found"});
}

const m = match.rows[0];

/* ================= VALIDATION ================= */

if(m.winner_id){
  await client.query("ROLLBACK");
  return res.status(400).json({error:"Match already finished"});
}

if(
  winnerId !== m.player_1_id &&
  winnerId !== m.player_2_id
){
  await client.query("ROLLBACK");
  return res.status(400).json({error:"Invalid winner"});
}

/* ================= BYE ================= */

if(!m.player_2_id){

  await client.query(`
    UPDATE matches SET winner_id=$1 WHERE match_id=$2
  `,[m.player_1_id, id]);

  await client.query(`
    UPDATE sessions
    SET reservation_status='Completed',
        actual_end = NOW()
    WHERE match_id=$1
  `,[id]);

  if(m.next_match_id){
    const next = await client.query(`
      SELECT player_1_id, player_2_id
      FROM matches
      WHERE match_id=$1
    `,[m.next_match_id]);

    if(next.rows.length){
      const nm = next.rows[0];

      if(!nm.player_1_id){
        await client.query(`
          UPDATE matches SET player_1_id=$1 WHERE match_id=$2
        `,[m.player_1_id, m.next_match_id]);
      }
      else if(!nm.player_2_id){
        await client.query(`
          UPDATE matches SET player_2_id=$1 WHERE match_id=$2
        `,[m.player_1_id, m.next_match_id]);
      }
    }
  }

  await client.query("COMMIT");

  return res.json({
    message:"BYE win auto assigned",
    match_id: id
  });
}

/* ================= SAVE WINNER ================= */

await client.query(`
  UPDATE matches SET winner_id=$1 WHERE match_id=$2
`,[winnerId,id]);

/* ================= CLOSE SESSION ================= */

await client.query(`
  UPDATE sessions
  SET reservation_status='Completed',
      actual_end = NOW()
  WHERE match_id=$1 AND reservation_status IN ('Pending','Checked-In')
`,[id]);

/* ================= CALL N8N ================= */

const roundsRes = await client.query(`
  SELECT MAX(round_number) as max_round
  FROM matches
  WHERE tournament_id=$1
`, [m.tournament_id]);

const totalRounds = Number(roundsRes.rows[0].max_round);

let data = null;

try{
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  const response = await fetch("https://n8n.azteac.cloud/webhook/elo",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      player_1_id: m.player_1_id,
      player_2_id: m.player_2_id,
      winner_id: winnerId,
      match_id: id,
      stage: getStage(m.round_number, totalRounds)
    }),
    signal: controller.signal
  });

  clearTimeout(timeout)

  if(response.ok){
    data = await response.json();
  }

}catch(err){
  console.log("n8n failed:", err.message, err.name);
}
/* ================= UPDATE STATS ================= */

if(data && Array.isArray(data.players)){

for(const p of data.players){

const isWinner = Number(winnerId) === Number(p.id);

await client.query(`
UPDATE player_stats
SET 
  elo_rank=$1,
  total_games = total_games + 1,
  total_wins = total_wins + $2,
  total_losses = total_losses + $3,
  win_streak = CASE 
    WHEN $2 = 1 THEN win_streak + 1
    ELSE 0
  END,
  best_streak = GREATEST(best_streak, win_streak + CASE WHEN $2=1 THEN 1 ELSE 0 END),  
  last_match = NOW()
WHERE player_id=$4
`,[
  Number(p.elo),
  isWinner ? 1 : 0,
  isWinner ? 0 : 1,
  Number(p.id)
]);

await client.query(`
  UPDATE players SET tier=$1 WHERE player_id=$2
`,[p.tier, Number(p.id)]);

}

}

/* ================= NEXT MATCH ================= */

if(m.next_match_id){

const next = await client.query(`
  SELECT player_1_id, player_2_id
  FROM matches
  WHERE match_id=$1
`,[m.next_match_id]);

if(next.rows.length){

const nm = next.rows[0];

if(!nm.player_1_id){
await client.query(`
UPDATE matches SET player_1_id=$1 WHERE match_id=$2
`,[winnerId, m.next_match_id]);
}
else if(!nm.player_2_id){
await client.query(`
UPDATE matches SET player_2_id=$1 WHERE match_id=$2
`,[winnerId, m.next_match_id]);
}

}

}

/* ================= CHECK TOURNAMENT END ================= */

const remaining = await client.query(`
  SELECT 1 FROM matches
  WHERE tournament_id=$1 AND winner_id IS NULL
`, [m.tournament_id]);

if(remaining.rows.length === 0){
  await client.query(`
    UPDATE tournaments
    SET status='Completed'
    WHERE tournament_id=$1
  `,[m.tournament_id]);
}

/* ================= COMMIT ================= */

await client.query("COMMIT");

res.json({
  message:"Winner saved successfully",
  match_id: id
});

}catch(err){

await client.query("ROLLBACK");

console.log("MATCH ERROR:", err.message);

res.status(500).json({
  error:"Failed to update match"
});

}finally{
client.release();
}

};

