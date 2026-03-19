const express = require("express")
const router = express.Router()

const roomsController = require("../controllers/roomsController")

// ================= AVAILABLE ROOMS =================
router.get("/available", roomsController.getAvailableRooms)

// ================= ALL ROOMS =================
router.get("/", roomsController.getRooms)

module.exports = router 