const express = require("express")
const router = express.Router()
const multer = require("multer")

const storage = multer.diskStorage({
destination:(req,file,cb)=>{
cb(null,"uploads/")
},
filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname)
}
})

const upload = multer({storage})

const moviesController = require("../controllers/moviesController")

router.get("/", moviesController.getMovies)

router.post("/", upload.single("image"), moviesController.createMovie)

router.get("/:id/seats", moviesController.getSeats)

router.post("/book-seats", moviesController.bookSeats)

router.delete("/:id", moviesController.deleteMovie)

module.exports = router