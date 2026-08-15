import { twin } from "../simulator/engine.js";
import { recommendWindow } from "../simulator/math.js";
import { analyzePerformance, chatWithCopilot, explainSchedule } from "../services/groqService.js";
import { isDbConnected } from "../config/db.js";
import AIInsight from "../models/AIInsight.js";

async function persistInsight(doc) {
  if (!isDbConnected()) return;
  try {
    await AIInsight.create(doc);
  } catch (err) {
    console.warn(`[aiController] failed to persist insight: ${err.message}`);
  }
}

// POST /api/ai/analyze
// Explains *why* today's production deviates from expected (spec §5).
export async function analyze(req, res) {
  const scenario = twin.getScenarioDef();
  const curve = twin.getCurve();
  const healthScore = twin.getHealth();

  const result = await analyzePerformance({ scenario, healthScore, curve });

  persistInsight({
    type: "performance",
    score: healthScore,
    explanation: result.body,
    recommendations: result.tags,
    severity: result.severity,
    source: result.source,
  });

  res.json(result);
}

// POST /api/ai/chat  { message }
export async function chat(req, res) {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Request body must include a non-empty string `message`." });
  }

  const ctx = {
    curve: twin.getCurve(),
    monthly: twin.getMonthly(),
    scenario: twin.getScenarioDef(),
    healthScore: twin.getHealth(),
  };

  const result = await chatWithCopilot({ message, ctx, recommendWindow });

  persistInsight({
    type: "chat",
    explanation: result.reply,
    source: result.source,
  });

  res.json(result);
}

// POST /api/ai/schedule  { name, powerKW, durationHours }
export async function schedule(req, res) {
  const { name, powerKW, durationHours } = req.body || {};
  if (!name || !powerKW || !durationHours) {
    return res.status(400).json({ error: "Request body must include `name`, `powerKW`, and `durationHours`." });
  }

  const curve = twin.getCurve();
  const rec = recommendWindow(curve, Number(durationHours), Number(powerKW));
  const result = await explainSchedule({ appliance: { name, powerKW, durationHours }, rec });

  persistInsight({
    type: "schedule",
    explanation: result.explanation,
    source: result.source,
  });

  res.json({ ...rec, explanation: result.explanation, source: result.source });
}
