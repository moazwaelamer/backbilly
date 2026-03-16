const express = require("express")
const router = express.Router()

const inventory = require("../controllers/inventoryController")

router.get("/low-stock", inventory.getLowStock)

module.exports = router