import { Router } from "express";
import { twin } from "../simulator/engine.js";
import { getPrediction, getModelMetrics, checkMLHealth } from "../services/mlService.js";
import { analyzePerformance } from "../services/groqService.js";
import { isDbConnected } from "../config/db.js";
import AIInsight from "../models/AIInsight.js";

const router = Router();

// GET /api/ml/health — Check if ML microservice is reachable
router.get("/health", async (req, res) => {
  const healthy = await checkMLHealth();
  res.json({ available: healthy });
});

// GET /api/ml/metrics — Model evaluation metrics (for Hackathon Judges Showcase)
router.get("/metrics", async (req, res) => {
  const metrics = await getModelMetrics();
  if (!metrics.available) {
    return res.status(503).json({ error: "ML service unavailable", available: false });
  }
  res.json(metrics);
});

// POST /api/ml/predict — Real-time solar generation prediction
// Body: { irradiance?, temp?, cloudCoverage?, humidity?, windSpeed?, capacityKW? }
router.post("/predict", async (req, res) => {
  const live = twin.getStatus();
  const now = new Date();

  // Merge live sensor data with request overrides
  const features = {
    hour: now.getHours() + now.getMinutes() / 60,
    month: now.getMonth() + 1,
    temp: req.body?.temp ?? live?.ambientTemp ?? live?.panelTemp ?? 28,
    irradiance: req.body?.irradiance ?? live?.irradiance ?? 850,
    cloudCoverage: req.body?.cloudCoverage ?? 15,
    humidity: req.body?.humidity ?? 50,
    windSpeed: req.body?.windSpeed ?? 10,
    capacityKW: req.body?.capacityKW ?? 5,
    ...req.body,
  };

  const prediction = await getPrediction(features);

  if (!prediction.available) {
    return res.status(503).json({ error: "ML microservice unavailable", available: false });
  }

  // Deviation analysis: compare ML prediction vs actual generation
  const actualSolar = live?.solar ?? null;
  let deviationPct = null;
  let isAnomaly = false;

  if (actualSolar !== null && prediction.predicted_solar_kw > 0.1) {
    deviationPct = ((prediction.predicted_solar_kw - actualSolar) / prediction.predicted_solar_kw) * 100;
    // Flag as anomaly if actual is more than 20% below prediction
    isAnomaly = deviationPct > 20;
  }

  // If anomalous, trigger AI analysis via Groq/Gemini
  let aiExplanation = null;
  if (isAnomaly) {
    try {
      const scenario = twin.getScenarioDef();
      const curve = twin.getCurve();
      const healthScore = twin.getHealth();

      const aiResult = await analyzePerformance({
        scenario,
        healthScore,
        curve,
        mlContext: {
          predicted_kw: prediction.predicted_solar_kw,
          actual_kw: actualSolar,
          deviation_pct: deviationPct.toFixed(1),
        },
      });

      aiExplanation = aiResult?.body ?? null;

      // Persist the ML anomaly insight to DB
      if (isDbConnected()) {
        AIInsight.create({
          type: "ml_anomaly",
          score: healthScore,
          explanation: aiResult?.body ?? "",
          recommendations: aiResult?.tags ?? [],
          severity: "high",
          source: aiResult?.source ?? "ml",
        }).catch((e) => console.warn("[mlRoutes] DB persist error:", e.message));
      }
    } catch (err) {
      console.warn("[mlRoutes] AI analysis failed:", err.message);
    }
  }

  res.json({
    ...prediction,
    actual_solar_kw: actualSolar,
    deviation_pct: deviationPct !== null ? +deviationPct.toFixed(1) : null,
    is_anomaly: isAnomaly,
    ai_explanation: aiExplanation,
    features_used: features,
  });
});

export default router;
