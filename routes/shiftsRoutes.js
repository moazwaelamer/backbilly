import express from "express"
import * as shifts from "../controllers/shiftsController.js"

const router = express.Router()

router.post("/start", shifts.startShift)
router.post("/end", shifts.endShift)
router.get("/active", shifts.getActiveShift)
router.get("/history", shifts.getShiftHistory)
router.get("/report/:id", shifts.getShiftReport)

export default router