import { twin } from "../simulator/engine.js";
import { isDbConnected } from "../config/db.js";
import SolarReading from "../models/SolarReading.js";

// GET /api/solar/live
export function getLive(req, res) {
  res.json(twin.getLiveSnapshot());
}

// GET /api/solar/today
export function getToday(req, res) {
  const curve = twin.getCurve();
  res.json({
    scenarioId: twin.scenarioId,
    curve,
    dailyKWh: twin.getDailyKWh(),
    healthScore: twin.getHealth(),
    ...twin.getAnomalyState(),
  });
}

// GET /api/solar/history?range=7d|30d|6m|1y
// If Mongo is connected, aggregates persisted SolarReading docs; otherwise
// falls back to a synthesized series so the route always returns something
// sensible in memory-only mode.
export async function getHistory(req, res) {
  const range = req.query.range || "7d";
  const rangeToDays = { "7d": 7, "30d": 30, "6m": 182, "1y": 365 };
  const days = rangeToDays[range] ?? 7;

  if (isDbConnected()) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const readings = await SolarReading.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          avgSolar: { $avg: "$solarPower" },
          avgConsumption: { $avg: "$consumption" },
          totalExport: { $sum: "$gridExport" },
          totalImport: { $sum: "$gridImport" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    if (readings.length) {
      return res.json({ range, source: "db", points: readings });
    }
  }

  // Synthesized fallback (no persisted data yet, or memory-only mode).
  const points = Array.from({ length: days }).map((_, i) => {
    const d = new Date(Date.now() - (days - i - 1) * 24 * 60 * 60 * 1000);
    const wobble = 0.85 + ((i * 37) % 30) / 100; // deterministic 0.85-1.15 spread
    return {
      _id: d.toISOString().slice(0, 10),
      avgSolar: +(3.2 * wobble).toFixed(2),
      avgConsumption: +(2.1 * (0.9 + ((i * 17) % 20) / 100)).toFixed(2),
      totalExport: +(6 * wobble).toFixed(1),
      totalImport: +(1.5 * (1.1 - wobble * 0.1)).toFixed(1),
    };
  });
  res.json({ range, source: "synthesized", points });
}
