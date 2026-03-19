const express = require("express")
const router = express.Router()
const dashboard = require("../controllers/dashboardController")
const { requireAuth } = require("../middleware/auth")

router.get("/stats", requireAuth, dashboard.getDashboardStats)

module.exports = router