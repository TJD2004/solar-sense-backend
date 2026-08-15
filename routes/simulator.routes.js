import { Router } from "express";
import { setScenario, getStatus } from "../controllers/simulatorController.js";

const router = Router();

router.post("/scenario", setScenario);
router.get("/status", getStatus);

export default router;
