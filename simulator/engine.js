// The server-side Digital Twin. Previously this state (scenario, offline
// toggle, live reading, tick count) lived only in the browser's
// SimulationContext, so two tabs/devices could disagree and nothing
// persisted. This module is now the single source of truth: one instance,
// shared by every request and pushed to every connected socket, exactly
// mirroring client/src/context/SimulationContext.jsx's tick/scenario logic.

import { EventEmitter } from "node:events";
import {
  buildTodayCurve,
  nextLiveReading,
  INITIAL_LIVE_READING,
  deriveDailyKWh,
  deriveHealthScore,
  deriveMonthlyImpact,
  BASELINE_SYSTEM,
} from "./math.js";
import { getScenario, SCENARIO_LIST } from "./scenarios.js";

const TICK_MS = 2000; // IoT devices push every 2-5s; 2s gives a visibly live feed

class DigitalTwin extends EventEmitter {
  constructor() {
    super();
    this.scenarioId = "normal";
    this.offline = false;
    this.tick = 0;
    this.overrides = {};
    this.live = { ...INITIAL_LIVE_READING };
    this._interval = null;
  }

  start() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), TICK_MS);
    // don't let the timer keep the process alive in tests/scripts
    this._interval.unref?.();
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
  }

  _tick() {
    if (this.offline) return;
    this.tick += 1;
    this.live = nextLiveReading(this.live, this.scenarioId, this.overrides);
    this.emit("tick", this.getLiveSnapshot());
    this.emit("scenario", this.getStatus());
  }

  setScenario(id) {
    this.scenarioId = SCENARIO_LIST.some((s) => s.id === id) ? id : "normal";
    this._tick();
    this.emit("scenario", this.getStatus());
    return this.scenarioId;
  }

  setOverrides(overrides) {
    if (!overrides) {
      this.overrides = {};
    } else {
      this.overrides = { ...this.overrides, ...overrides };
    }
    this._tick();
    this.emit("scenario", this.getStatus());
    return this.overrides;
  }

  resetOverrides() {
    this.overrides = {};
    this._tick();
    this.emit("scenario", this.getStatus());
  }

  setOffline(offline) {
    this.offline = !!offline;
    this.emit("scenario", this.getStatus());
    return this.offline;
  }

  toggleOffline() {
    return this.setOffline(!this.offline);
  }

  // Today's hourly curve for the active scenario — recomputed on read
  getCurve() {
    return buildTodayCurve(this.scenarioId, this.overrides);
  }

  getScenarioDef() {
    return getScenario(this.scenarioId);
  }

  getLiveSnapshot() {
    return {
      ...this.live,
      scenarioId: this.scenarioId,
      offline: this.offline,
      tick: this.tick,
      timestamp: new Date().toISOString(),
    };
  }

  // Mirrors SimulationContext's transientBlip/anomalyActive logic exactly:
  // on a normal day the twin still occasionally flags a brief transient
  // blip for demo texture; any fault scenario is a standing anomaly for as
  // long as it's selected.
  getAnomalyState() {
    const transientBlip = this.scenarioId === "normal" && this.tick > 0 && this.tick % 9 === 0;
    const isExtremeTemp = (this.overrides?.temp >= 40) || (this.live?.panelTemp >= 45) || (this.live?.ambientTemp >= 40);
    const isCloudyOrRain = (this.overrides?.cloudCoverage >= 60) || (this.overrides?.weather === "cloudy") || (this.overrides?.weather === "rainy");
    const isShadingOrSoiling = (this.overrides?.shading >= 30) || (this.overrides?.soiling >= 30);

    const anomalyActive =
      this.scenarioId !== "normal" ||
      transientBlip ||
      isExtremeTemp ||
      isCloudyOrRain ||
      isShadingOrSoiling;

    return { transientBlip, anomalyActive };
  }

  getHealth() {
    return deriveHealthScore(this.getCurve());
  }

  getDailyKWh() {
    return deriveDailyKWh(this.getCurve());
  }

  getMonthly() {
    return deriveMonthlyImpact({ dailyKWh: this.getDailyKWh() });
  }

  getBaselineSystem() {
    return { capacityKW: BASELINE_SYSTEM.capacityKW, dailyKWh: this.getDailyKWh() };
  }

  // Full status payload for GET /api/simulator/status and the
  // 'scenario' socket event — everything a client needs to render the
  // whole app off one call, same shape SimulationContext exposed locally.
  getStatus() {
    const curve = this.getCurve();
    return {
      scenarioId: this.scenarioId,
      scenario: this.getScenarioDef(),
      scenarios: SCENARIO_LIST,
      overrides: this.overrides,
      offline: this.offline,
      live: this.getLiveSnapshot(),
      curve,
      dailyKWh: deriveDailyKWh(curve),
      healthScore: deriveHealthScore(curve),
      monthly: deriveMonthlyImpact({ dailyKWh: deriveDailyKWh(curve) }),
      baselineSystem: { capacityKW: BASELINE_SYSTEM.capacityKW, dailyKWh: deriveDailyKWh(curve) },
      ...this.getAnomalyState(),
    };
  }
}

// One shared instance for the whole process — this is what makes it the
// single source of truth instead of per-request state.
export const twin = new DigitalTwin();
