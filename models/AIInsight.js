import mongoose from "mongoose";

const AIInsightSchema = new mongoose.Schema(
  {
    solarSystemId: { type: mongoose.Schema.Types.ObjectId, ref: "SolarSystem" },
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ["performance", "anomaly", "schedule", "chat"], required: true },
    score: { type: Number }, // health score at time of insight, when applicable
    explanation: { type: String, required: true },
    recommendations: [{ type: String }],
    severity: { type: String, enum: ["ok", "info", "warn", "alert"], default: "info" },
    source: { type: String, enum: ["groq", "heuristic"], default: "heuristic" },
  },
  { timestamps: false }
);

export default mongoose.models.AIInsight || mongoose.model("AIInsight", AIInsightSchema);
