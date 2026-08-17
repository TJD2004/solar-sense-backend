import { forecastNextHours, forecastTomorrowKWh, forecastWeek } from "../simulator/math.js";
import { twin } from "../simulator/engine.js";

// GET /api/forecast/today
export function getForecastToday(req, res) {
  res.json({ points: forecastNextHours(new Date(), twin.overrides) });
}

// GET /api/forecast/tomorrow
export function getForecastTomorrow(req, res) {
  res.json({ expectedKWh: forecastTomorrowKWh(twin.overrides) });
}

// GET /api/forecast/week
export function getForecastWeek(req, res) {
  res.json({ points: forecastWeek(twin.getDailyKWh()) });
}
