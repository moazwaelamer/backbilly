const jwt = require("jsonwebtoken")
const db = require("../db/db")

const SECRET = "bilys_secret_key_2026"

exports.login = async (req,res)=>{
  try{
    const {username, password} = req.body

    const result = await db.query(`
      SELECT username, shift_type, role
      FROM admins
      WHERE username = $1
      AND password = $2
    `,[username, password])

    if(result.rows.length === 0){
      return res.status(401).json({
        error:"Invalid username or password"
      })
    }

    const admin = result.rows[0]

    const token = jwt.sign({
      username: admin.username,
      shift_type: admin.shift_type,
      role: admin.role
    }, SECRET, { expiresIn: "12h" })

    res.json({
      admin_name: admin.username,
      shift_type: admin.shift_type,
      role: admin.role,
      token
    })

  }catch(err){
    console.log(err)
    res.status(500).json(err.message)
  }
}