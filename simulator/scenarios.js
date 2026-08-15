// Scenario definitions for the Digital Twin (spec §15).
//
// Ported 1:1 from client/src/services/scenarios.js. This is now the single
// source of truth — the frontend's copy stays as its offline/standalone
// fallback (see client/src/services/api.js's callOrFallback), but whenever
// VITE_USE_BACKEND=true every page gets these definitions via
// GET /api/simulator/status instead.

export const SCENARIOS = {
  normal: {
    id: "normal",
    label: "Normal Day",
    emoji: "☀️",
    description: "Clear-sky production tracking the expected curve.",
    dailyMultiplier: 1,
    insight: {
      title: "AI Performance Detective",
      body: "Production is running close to expected levels for today's weather and time of year. If output drops below the forecast band, this panel explains likely contributors instead of just flagging the number.",
      tags: ["☁️ Cloud cover", "🌳 Shading", "🧹 Soiling"],
      severity: "ok",
    },
  },
  cloudy: {
    id: "cloudy",
    label: "Cloudy Day",
    emoji: "☁️",
    description: "Passing cloud cover cuts output through the middle of the day.",
    dailyMultiplier: 0.72,
    affectedHours: [10, 15],
    dropRange: [0.3, 0.5],
    insight: {
      title: "AI Performance Detective",
      body: "Production is running below the forecast band through the middle of the day. The drop pattern tracks closely with today's cloud cover forecast, which is the most likely contributor.",
      tags: ["☁️ Cloud cover — likely contributor", "🌳 Afternoon shading — unlikely", "🧹 Panel soiling — unlikely"],
      severity: "warn",
    },
  },
  shading: {
    id: "shading",
    label: "Afternoon Shading",
    emoji: "🌳",
    description: "A tree or structure shades part of the array in the afternoon.",
    dailyMultiplier: 0.85,
    affectedHours: [14, 17],
    dropRange: [0.35, 0.5],
    insight: {
      title: "AI Performance Detective",
      body: "Output drops sharply every afternoon in the same window while the morning curve stays normal. That repeating, time-locked pattern points to fixed shading rather than weather, which would affect the whole day.",
      tags: ["🌳 Afternoon shading — likely contributor", "☁️ Cloud cover — unlikely", "🧹 Panel soiling — unlikely"],
      severity: "warn",
    },
  },
  soiling: {
    id: "soiling",
    label: "Panel Soiling",
    emoji: "🧹",
    description: "Dust/debris build-up gradually reduces panel efficiency.",
    dailyMultiplier: 0.9,
    gradual: true,
    dropRange: [0.08, 0.22],
    insight: {
      title: "AI Performance Detective",
      body: "Output is slightly below expected across the entire day, with no sudden cliffs or single bad window. A slow, uniform decline like this is consistent with dust or debris build-up rather than weather or shading — a panel clean is worth checking.",
      tags: ["🧹 Panel soiling — possible contributor", "☁️ Cloud cover — unlikely", "🌳 Shading — unlikely"],
      severity: "info",
    },
  },
  inverter: {
    id: "inverter",
    label: "Inverter Issue",
    emoji: "⚠️",
    description: "A sudden, sustained cliff-drop in output — the anomaly-detection trigger case from the spec.",
    dailyMultiplier: 0.55,
    affectedHours: [12, 19],
    dropRange: [0.55, 0.75],
    cliff: true,
    insight: {
      title: "AI Performance Detective",
      body: "Output fell sharply within a single interval and hasn't recovered, unlike the gradual patterns typical of weather or soiling. This sudden, sustained cliff is consistent with an inverter or connection fault, though this can't be confirmed remotely — an inverter check is recommended.",
      tags: ["⚠️ Inverter fault — possible, not confirmed", "☁️ Cloud cover — unlikely", "🧹 Soiling — unlikely"],
      severity: "alert",
    },
  },
};

export const SCENARIO_LIST = Object.values(SCENARIOS);

export function getScenario(id) {
  return SCENARIOS[id] || SCENARIOS.normal;
}
