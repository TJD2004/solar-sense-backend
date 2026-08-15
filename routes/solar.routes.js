import { Router } from "express";
import { getLive, getToday, getHistory } from "../controllers/solarController.js";

const router = Router();

router.get("/live", getLive);
router.get("/today", getToday);
router.get("/history", getHistory);

export default router;
