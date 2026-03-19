import express from "express"
import * as roomsController from "../controllers/roomsController.js"

const router = express.Router()

// ================= AVAILABLE ROOMS =================
router.get("/available", roomsController.getAvailableRooms)

// ================= ALL ROOMS =================
router.get("/", roomsController.getRooms)

export default router