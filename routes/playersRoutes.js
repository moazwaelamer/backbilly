const express = require("express")
const router = express.Router()
const controller = require("../controllers/playersController")

router.get("/", controller.getPlayers)
router.post("/", controller.createPlayer)

module.exports = router