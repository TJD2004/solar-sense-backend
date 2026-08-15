import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

const mlClient = axios.create({
  baseURL: ML_SERVICE_URL,
  timeout: 5000,
});

/**
 * Get real-time ML-based solar generation prediction.
 * @param {object} features - weather + system features
 * @returns {Promise<{predicted_solar_kw, confidence_min, confidence_max, model_name, r2_score, mae, available}>}
 */
export async function getPrediction(features) {
  try {
    const { data } = await mlClient.post("/predict", {
      hour: features.hour ?? new Date().getHours(),
      month: features.month ?? new Date().getMonth() + 1,
      temp: features.temp ?? 28,
      irradiance: features.irradiance ?? 800,
      cloudCoverage: features.cloudCoverage ?? 15,
      humidity: features.humidity ?? 45,
      windSpeed: features.windSpeed ?? 12,
      capacityKW: features.capacityKW ?? 5,
    });
    return { ...data, available: true };
  } catch (err) {
    console.warn(`[mlService] ML microservice unavailable: ${err.message}`);
    return { available: false, predicted_solar_kw: null };
  }
}

/**
 * Get model evaluation metrics (for Hackathon Judges Showcase).
 * @returns {Promise<object>}
 */
export async function getModelMetrics() {
  try {
    const { data } = await mlClient.get("/metrics");
    return { ...data, available: true };
  } catch (err) {
    console.warn(`[mlService] ML metrics unavailable: ${err.message}`);
    return { available: false };
  }
}

/**
 * Health check for ML microservice.
 */
export async function checkMLHealth() {
  try {
    const { data } = await mlClient.get("/health");
    return data.status === "ok";
  } catch {
    return false;
  }
}
