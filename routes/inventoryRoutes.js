const express = require("express")
const router = express.Router()
const inventoryController = require("../controllers/inventoryController")
const { requireAuth, requireOwner } = require("../middleware/auth")

// الكل يشوف
router.get("/", inventoryController.getInventory)
router.get("/low-stock", inventoryController.getLowStock)

// owner بس
router.post("/products", requireAuth, requireOwner, inventoryController.addProduct)
router.delete("/:id", requireAuth, requireOwner, inventoryController.deleteItem)
router.patch("/:id", requireAuth, requireOwner, inventoryController.updateItem)

module.exports = router