import { Router } from "express";
import { getForecastToday, getForecastTomorrow, getForecastWeek } from "../controllers/forecastController.js";

const router = Router();

router.get("/today", getForecastToday);
router.get("/tomorrow", getForecastTomorrow);
router.get("/week", getForecastWeek);

export default router;
