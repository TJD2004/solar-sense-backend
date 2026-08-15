import { Router } from "express";
import { getPerformance, getHealth, getSavings } from "../controllers/analyticsController.js";

const router = Router();

router.get("/performance", getPerformance);
router.get("/health", getHealth);
router.get("/savings", getSavings);

export default router;
