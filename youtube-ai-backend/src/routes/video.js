import express from "express";
import { indexVideo } from "../controllers/video.js";

const router = express.Router();

router.post("/index", indexVideo);

export default router;
