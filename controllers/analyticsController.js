import { twin } from "../simulator/engine.js";

// GET /api/analytics/performance
export function getPerformance(req, res) {
  const curve = twin.getCurve();
  const totalExpected = curve.reduce((s, p) => s + p.expected, 0);
  const totalActual = curve.reduce((s, p) => s + p.generation, 0);
  const shortfallPct = totalExpected > 0 ? +((1 - totalActual / totalExpected) * 100).toFixed(1) : 0;

  res.json({
    scenarioId: twin.scenarioId,
    totalExpectedKWh: +totalExpected.toFixed(1),
    totalActualKWh: +totalActual.toFixed(1),
    shortfallPct,
    healthScore: twin.getHealth(),
    ...twin.getAnomalyState(),
  });
}

// GET /api/analytics/health
export function getHealth(req, res) {
  res.json({ healthScore: twin.getHealth(), scenarioId: twin.scenarioId });
}

// GET /api/analytics/savings
export function getSavings(req, res) {
  res.json(twin.getMonthly());
}
