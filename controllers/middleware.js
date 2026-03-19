const jwt = require("jsonwebtoken")
const SECRET = "bilys_secret_key_2026"

exports.requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  
  if(!token){
    return res.status(401).json({ error: "No token provided" })
  }

  try{
    const decoded = jwt.verify(token, SECRET)
    req.admin = decoded
    next()
  }catch(err){
    return res.status(401).json({ error: "Invalid token" })
  }
}

exports.requireOwner = (req, res, next) => {
  if(req.admin.role !== "owner"){
    return res.status(403).json({ error: "Owner access only" })
  }
  next()
}