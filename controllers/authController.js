const db = require("../db/db")

exports.login = async (req,res)=>{

  try{

    const {username,password} = req.body

    const result = await db.query(`
      SELECT username, shift_type
      FROM admins
      WHERE username = $1
      AND password = $2
    `,[username,password])

    if(result.rows.length === 0){
      return res.status(401).json({
        error:"Invalid username or password"
      })
    }

    res.json({
      admin_name: result.rows[0].username,
      shift_type: result.rows[0].shift_type
    })

  }catch(err){
    console.log(err)
    res.status(500).json(err.message)
  }

}