// Ported 1:1 from client/src/services/simulator.js + client/src/services/derive.js.
// This is the authoritative copy now — kept byte-for-byte equivalent so a
// reading computed here and one computed by the frontend's offline fallback
// never disagree in a demo. If you change formulas, change both.

import { getScenario } from "./scenarios.js";

function seeded(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clearSkyValue(h) {
  const peak = 12.5;
  const spread = 3.4;
  const base = 5.1 * Math.exp(-Math.pow(h - peak, 2) / (2 * spread * spread));
  const noise = Math.sin(h * 3.1) * 0.15;
  return Math.max(0, base + noise);
}

function scenarioMultiplierAt(h, scenario) {
  if (!scenario.affectedHours && !scenario.gradual) {
    return 1 - seeded(h) * 0.04;
  }
  if (scenario.gradual) {
    const [minDrop, maxDrop] = scenario.dropRange;
    const progress = Math.min(1, Math.max(0, (h - 6) / 13));
    const drop = minDrop + (maxDrop - minDrop) * progress;
    return 1 - drop;
  }
  const [start, end] = scenario.affectedHours;
  if (h < start || h > end) return 1 - seeded(h) * 0.04;
  const [minDrop, maxDrop] = scenario.dropRange;
  if (scenario.cliff) {
    return h === start ? 1 - minDrop * 0.4 : 1 - maxDrop;
  }
  const wobble = seeded(h * 7.7);
  return 1 - (minDrop + (maxDrop - minDrop) * wobble);
}

export function buildTodayCurve(scenarioId = "normal", overrides = {}) {
  const scenario = getScenario(scenarioId);
  const points = [];

  let weatherMult = 1.0;
  if (overrides.weather === "cloudy") weatherMult = 0.40;
  if (overrides.weather === "rainy") weatherMult = 0.15;
  if (overrides.weather === "heatwave") weatherMult = 0.70;
  if (overrides.weather === "sunny") weatherMult = 1.0;

  const cloudMult = overrides.cloudCoverage !== undefined ? Math.max(0.05, 1 - (overrides.cloudCoverage / 100) * 0.90) : 1;
  const shadingMult = overrides.shading !== undefined ? Math.max(0.1, 1 - (overrides.shading / 100) * 0.85) : 1;
  const soilingMult = overrides.soiling !== undefined ? Math.max(0.3, 1 - (overrides.soiling / 100) * 0.65) : 1;
  const tempMult = overrides.temp !== undefined ? Math.max(0.35, 1 - Math.max(0, overrides.temp - 25) * 0.015) : 1;

  for (let h = 6; h <= 19; h++) {
    const expected = +clearSkyValue(h).toFixed(2);
    let multiplier = scenarioMultiplierAt(h, scenario);

    multiplier *= weatherMult * cloudMult * shadingMult * soilingMult * tempMult;

    if (overrides.irradiance !== undefined) {
      multiplier *= (overrides.irradiance / 1000);
    }

    const generation = +Math.max(0, expected * multiplier).toFixed(2);
    const consumption = overrides.homeLoad !== undefined 
      ? overrides.homeLoad 
      : +(1.6 + Math.sin((h - 6) / 2) * 0.5 + 0.4).toFixed(2);
    points.push({ hour: `${h}:00`, expected, generation, consumption });
  }
  return points;
}

export function nextLiveReading(prev, scenarioId = "normal", overrides = {}) {
  const now = new Date();
  const currentH = overrides.hour !== undefined ? overrides.hour : now.getHours();
  const currentM = overrides.hour !== undefined ? 0 : now.getMinutes();
  const currentS = overrides.hour !== undefined ? 0 : now.getSeconds();
  const hourFrac = currentH + currentM / 60 + currentS / 3600;

  // Time-aware baseline peak solar at midday (5.1 kW peak at 12:30 PM)
  const clearSkyNow = Math.max(0, clearSkyValue(hourFrac));

  let targetMult = 1.0;
  const h = Math.floor(hourFrac);

  // Apply active scenario cliff / drops
  switch (scenarioId) {
    case "cloudy":
      targetMult = 0.38;
      break;
    case "shading":
      targetMult = h >= 14 && h <= 17 ? 0.30 : 0.95;
      break;
    case "soiling": {
      const progress = Math.min(1, Math.max(0, (hourFrac - 6) / 13));
      targetMult = 1 - (0.12 + 0.28 * progress);
      break;
    }
    case "inverter":
      targetMult = h >= 12 ? 0.10 : 0.85;
      break;
    default:
      targetMult = 0.98;
  }

  // Weather factor
  let weatherFactor = 1.0;
  if (overrides.weather === "cloudy") weatherFactor = 0.40;
  if (overrides.weather === "rainy") weatherFactor = 0.15;
  if (overrides.weather === "heatwave") weatherFactor = 0.70;
  if (overrides.weather === "sunny") weatherFactor = 1.0;

  // Environmental Factors
  const cloudFactor = overrides.cloudCoverage !== undefined ? Math.max(0.05, 1 - (overrides.cloudCoverage / 100) * 0.90) : 1;
  const shadingFactor = overrides.shading !== undefined ? Math.max(0.1, 1 - (overrides.shading / 100) * 0.85) : 1;
  const soilingFactor = overrides.soiling !== undefined ? Math.max(0.3, 1 - (overrides.soiling / 100) * 0.65) : 1;
  const tempFactor = overrides.temp !== undefined ? Math.max(0.35, 1 - Math.max(0, overrides.temp - 25) * 0.015) : 1;

  // Dynamic Irradiance (W/m²): scales with clear sky sun angle, weather & clouds unless explicitly forced
  const baseIrradiance = Math.max(0, Math.round((clearSkyNow / 5.1) * 1000 * cloudFactor * weatherFactor * shadingFactor));
  const irradiance = overrides.irradiance !== undefined ? overrides.irradiance : baseIrradiance;

  // Irradiance factor for power output: 1000 W/m² = 100% STC
  const irrFactor = irradiance / 1000;

  // Target calculated solar power output (kW)
  const target = clearSkyNow * targetMult * weatherFactor * cloudFactor * shadingFactor * soilingFactor * tempFactor * irrFactor;
  const solar = Math.max(0, +(target + (Math.random() - 0.5) * 0.05).toFixed(2));

  // Home load (kW)
  const home = overrides.homeLoad !== undefined ? overrides.homeLoad : 2.1;

  // Battery Charge (%) & Battery Flow (kW)
  const surplus = solar - home;
  const battPower = +(Math.sign(surplus) * Math.min(2.5, Math.abs(surplus) * 0.75)).toFixed(2);
  const battery = overrides.batteryLevel !== undefined
    ? overrides.batteryLevel
    : +Math.min(100, Math.max(5, prev.battery + battPower * 0.15)).toFixed(0);

  // Grid Net Flow (kW): positive = exporting to grid, negative = importing from grid
  const gridNet = +(surplus - battPower).toFixed(2);
  const grid = Math.max(0, +gridNet.toFixed(2));

  // Inverter Telemetry Metrics
  const ambientTemp = overrides.temp !== undefined ? overrides.temp : 30;
  const panelTemp = +(ambientTemp + (irradiance / 1000) * 25 + (Math.random() - 0.5) * 1.0).toFixed(1);
  const acVoltage = +(230 + (solar > 0 ? solar * 1.2 : -2.0) + (Math.random() - 0.5) * 2.0).toFixed(1);
  const acFrequency = +(50.0 + (Math.random() - 0.5) * 0.04).toFixed(2);
  const dcVoltage = solar > 0.05 ? +(310 + solar * 12).toFixed(1) : 0;
  const dcCurrent = solar > 0.05 && dcVoltage > 0 ? +(solar * 1000 / dcVoltage).toFixed(2) : 0;
  const powerFactor = +(0.985 + (Math.random() - 0.5) * 0.008).toFixed(3);
  const efficiency = +(98.0 * tempFactor * soilingFactor).toFixed(1);

  return {
    solar, home, grid, gridNet,
    battery, battPower,
    irradiance, panelTemp, ambientTemp,
    acVoltage, acFrequency, dcVoltage, dcCurrent,
    powerFactor, efficiency,
  };
}

export const INITIAL_LIVE_READING = {
  solar: 4.72, home: 2.1, battery: 76, grid: 2.62, gridNet: 2.62, battPower: 1.18,
  irradiance: 820, panelTemp: 59.2, ambientTemp: 33.5,
  acVoltage: 231.4, acFrequency: 50.01, dcVoltage: 367.2, dcCurrent: 12.84,
  powerFactor: 0.971, efficiency: 96.8,
};

export function recommendWindow(curve, durationHours, powerKW) {
  const steps = Math.max(1, Math.round(durationHours));
  let best = null;
  for (let i = 0; i <= curve.length - steps; i++) {
    const slice = curve.slice(i, i + steps);
    const avgGen = slice.reduce((s, p) => s + p.generation, 0) / slice.length;
    const avgCon = slice.reduce((s, p) => s + p.consumption, 0) / slice.length;
    const surplus = avgGen - avgCon;
    if (!best || surplus > best.surplus) {
      best = { startHour: slice[0].hour, endIndex: i + steps, avgGen, surplus };
    }
  }
  const endHour = curve[Math.min(curve.length - 1, best.endIndex)]?.hour ?? best.startHour;
  const reductionKWh = Math.max(0, Math.min(powerKW, best.surplus)) * durationHours;
  return {
    window: `${best.startHour} – ${endHour}`,
    avgGen: +best.avgGen.toFixed(1),
    reductionKWh: +reductionKWh.toFixed(1),
  };
}

export const BASELINE_SYSTEM = { capacityKW: 5, dailyKWh: 20 };

export function deriveDailyKWh(curve) {
  return +curve.reduce((s, p) => s + p.generation, 0).toFixed(1);
}

export const WHAT_IF_TOGGLES = [
  { id: "panels", label: "Add 2 solar panels", capacityDelta: 2, dailyKWhDelta: 7 },
  { id: "battery", label: "Add a battery", capacityDelta: 0, dailyKWhDelta: 1.5 },
  { id: "ac", label: "Use AC for 6 hrs/day", capacityDelta: 0, dailyKWhDelta: -3.5 },
  { id: "ev", label: "Add an EV", capacityDelta: 0, dailyKWhDelta: -6 },
  { id: "consumption20", label: "Consumption +20%", capacityDelta: 0, dailyKWhDelta: -2.5 },
];

export function simulateWhatIf(activeIds, baseline) {
  const active = WHAT_IF_TOGGLES.filter((t) => activeIds.includes(t.id));
  const capacityKW = baseline.capacityKW + active.reduce((s, t) => s + t.capacityDelta, 0);
  const dailyKWh = Math.max(0, baseline.dailyKWh + active.reduce((s, t) => s + t.dailyKWhDelta, 0));
  return { capacityKW: +capacityKW.toFixed(1), dailyKWh: +dailyKWh.toFixed(1) };
}

// --- derive.js ---

export const RATE_PER_KWH = 8;
export const EXPORT_RATE_PER_KWH = 3.5;
export const SELF_CONSUMPTION_RATIO = 0.55;
export const CO2_FACTOR_KG_PER_KWH = 0.82;
export const KG_CO2_ABSORBED_PER_TREE_YEAR = 21;

export function daysElapsedInMonth(date = new Date()) {
  return date.getDate();
}

export function deriveMonthlyImpact({ dailyKWh, date = new Date() }) {
  const days = daysElapsedInMonth(date);
  const monthGeneratedKWh = +(dailyKWh * days).toFixed(1);
  const selfConsumedKWh = monthGeneratedKWh * SELF_CONSUMPTION_RATIO;
  const exportedKWh = monthGeneratedKWh - selfConsumedKWh;
  const savings = Math.round(selfConsumedKWh * RATE_PER_KWH + exportedKWh * EXPORT_RATE_PER_KWH);
  const co2AvoidedKg = Math.round(monthGeneratedKWh * CO2_FACTOR_KG_PER_KWH);
  const annualizedCo2Kg = co2AvoidedKg * (365 / days);
  const treesPerYear = Math.max(1, Math.round(annualizedCo2Kg / KG_CO2_ABSORBED_PER_TREE_YEAR));

  return {
    monthGeneratedKWh,
    selfConsumedKWh: +selfConsumedKWh.toFixed(1),
    exportedKWh: +exportedKWh.toFixed(1),
    savings,
    co2AvoidedKg,
    treesPerYear,
  };
}

export function deriveHealthScore(curve) {
  if (!curve?.length) return 100;
  const totalExpected = curve.reduce((s, p) => s + p.expected, 0);
  const totalActual = curve.reduce((s, p) => s + p.generation, 0);
  const shortfallRatio = totalExpected > 0 ? Math.max(0, 1 - totalActual / totalExpected) : 0;

  let maxSingleStepDrop = 0;
  for (let i = 1; i < curve.length; i++) {
    const prevRatio = curve[i - 1].expected > 0 ? curve[i - 1].generation / curve[i - 1].expected : 1;
    const currRatio = curve[i].expected > 0 ? curve[i].generation / curve[i].expected : 1;
    maxSingleStepDrop = Math.max(maxSingleStepDrop, prevRatio - currRatio);
  }

  const score = 100 - shortfallRatio * 60 - maxSingleStepDrop * 40;
  return Math.max(35, Math.min(100, Math.round(score)));
}

// --- forecast.js ---

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function forecastNextHours(now = new Date(), overrides = {}) {
  const curve = buildTodayCurve("normal", overrides);
  const currentHour = now.getHours();
  return curve.filter((p) => parseInt(p.hour, 10) >= currentHour).map((p) => ({ hour: p.hour, expected: p.expected }));
}

export function forecastTomorrowKWh(overrides = {}) {
  const curve = buildTodayCurve("normal", overrides);
  return +curve.reduce((s, p) => s + p.expected, 0).toFixed(1);
}

export function forecastWeek(baseDailyKWh, now = new Date()) {
  const points = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const wobble = seeded(i * 6.7) * 0.35 - 0.05;
    const expectedKWh = +Math.max(3, baseDailyKWh * (1 + wobble)).toFixed(1);
    points.push({ label: DAY_LABELS[d.getDay()], expectedKWh });
  }
  return points;
}
