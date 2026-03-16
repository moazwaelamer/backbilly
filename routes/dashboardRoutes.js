    const express = require("express")
    const router = express.Router()

    const dashboard = require("../controllers/dashboardController")

    router.get("/stats",dashboard.getDashboardStats)

    module.exports = router