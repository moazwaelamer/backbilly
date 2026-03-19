import express from "express"
import * as inventoryController from "../controllers/inventoryController.js"

const router = express.Router()

router.get("/", inventoryController.getInventory)
router.post("/products", inventoryController.addProduct)
router.delete("/:id", inventoryController.deleteItem)
router.patch("/:id", inventoryController.updateItem)
router.get("/low-stock", inventoryController.getLowStock)

export default router