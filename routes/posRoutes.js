import express from "express"
import * as posController from "../controllers/posController.js"
import * as shifts from "../controllers/shiftsController.js"

const router = express.Router()

router.post("/sale", posController.createSale)
router.get("/menu", posController.getMenu)
router.get("/sales", posController.getSales)
router.get("/report/:id", shifts.getShiftReport) // ✅ دلوقتي شغال
router.get("/sales/today", posController.getTodaySales)
router.get("/sales/:id", posController.getSaleById)

export default router