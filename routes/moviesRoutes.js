import express from "express"
import multer from "multer"
import { requireAuth, requireOwner } from "../middleware/auth.js"
import * as moviesController from "../controllers/moviesController.js"

const router = express.Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, "uploads/") },
  filename: (req, file, cb) => { cb(null, Date.now() + "-" + file.originalname) }
})

const upload = multer({ storage })

// الكل يقدر يشوف ويحجز
router.get("/", moviesController.getMovies)
router.get("/:id/seats", moviesController.getSeats)
router.post("/book-seats", moviesController.bookSeats)
router.get("/:id/bookings", requireAuth, requireOwner, moviesController.getMovieBookings)

// owner بس
router.post("/", requireAuth, requireOwner, upload.single("image"), moviesController.createMovie)
router.delete("/:id", requireAuth, requireOwner, moviesController.deleteMovie)

export default router