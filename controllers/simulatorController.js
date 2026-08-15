import { twin } from "../simulator/engine.js";
import { SCENARIO_LIST } from "../simulator/scenarios.js";

// POST /api/simulator/scenario  { scenarioId, offline?, overrides?, resetOverrides? }
export function setScenario(req, res) {
  const { scenarioId, offline, overrides, resetOverrides } = req.body || {};
  if (scenarioId !== undefined) {
    const valid = SCENARIO_LIST.some((s) => s.id === scenarioId);
    if (!valid) {
      return res.status(400).json({
        error: `Unknown scenarioId "${scenarioId}". Valid values: ${SCENARIO_LIST.map((s) => s.id).join(", ")}`,
      });
    }
    twin.setScenario(scenarioId);
  }
  if (offline !== undefined) {
    twin.setOffline(!!offline);
  }
  if (resetOverrides) {
    twin.resetOverrides();
  } else if (overrides !== undefined) {
    twin.setOverrides(overrides);
  }
  res.json(twin.getStatus());
}

// GET /api/simulator/status
export function getStatus(req, res) {
  res.json(twin.getStatus());
}
