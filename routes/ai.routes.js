import { Router } from "express";
import { analyze, chat, schedule } from "../controllers/aiController.js";

const router = Router();

router.post("/analyze", analyze);
router.post("/chat", chat);
router.post("/schedule", schedule);

export default router;
