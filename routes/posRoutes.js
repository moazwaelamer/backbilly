const express = require("express");
const router = express.Router();

const posController = require("../controllers/posController");

router.post("/sale", posController.createSale);
router.get("/menu", posController.getMenu)
router.get("/sales", posController.getSales)
router.get("/sales/today", posController.getTodaySales)
router.get("/sales/:id", posController.getSaleById)

module.exports = router;