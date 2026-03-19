const express = require("express")
const router = express.Router()
const multer = require("multer")
const { requireAuth, requireOwner } = require("../middleware/auth")

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{ cb(null,"uploads/") },
  filename:(req,file,cb)=>{ cb(null,Date.now()+"-"+file.originalname) }
})

const upload = multer({storage})

const moviesController = require("../controllers/moviesController")

// الكل يقدر يشوف ويحجز
router.get("/", moviesController.getMovies)
router.get("/:id/seats", moviesController.getSeats)
router.post("/book-seats", moviesController.bookSeats)

// owner بس
router.post("/", requireAuth, requireOwner, upload.single("image"), moviesController.createMovie)
router.delete("/:id", requireAuth, requireOwner, moviesController.deleteMovie)

module.exports = router