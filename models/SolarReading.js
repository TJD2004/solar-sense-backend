import mongoose from "mongoose";

const SolarReadingSchema = new mongoose.Schema(
  {
    solarSystemId: { type: mongoose.Schema.Types.ObjectId, ref: "SolarSystem" },
    timestamp: { type: Date, default: Date.now, index: true },
    solarPower: { type: Number, required: true }, // kW, live
    energyGenerated: { type: Number }, // kWh, cumulative for the day
    consumption: { type: Number },
    battery: { type: Number }, // % state of charge
    gridImport: { type: Number },
    gridExport: { type: Number },
    scenarioId: { type: String }, // which digital-twin scenario produced this reading
  },
  { timestamps: false }
);

SolarReadingSchema.index({ solarSystemId: 1, timestamp: -1 });

export default mongoose.models.SolarReading || mongoose.model("SolarReading", SolarReadingSchema);
