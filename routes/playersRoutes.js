const express = require("express");
const router = express.Router();
const controller = require("../controllers/playersController");

router.get("/leaderboard", controller.getLeaderboard);
router.get("/:id/matches", controller.getPlayerMatches);
router.get("/:id", controller.getPlayerProfile);
router.post("/", controller.createPlayer);
router.post("/:id/avatar", controller.upload.single("avatar"), controller.updateAvatar);
router.put("/:id", controller.updateProfile);

module.exports = router;