const express = require("express")
const router = express.Router()

const roomsController = require("../controllers/roomsController")

router.get("/", roomsController.getRooms)

router.get("/available", roomsController.getAvailableRooms)

module.exports = router