import mongoose from "mongoose";

const SolarSystemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    capacity: { type: Number, required: true }, // kW installed
    panelCount: { type: Number },
    batteryCapacity: { type: Number }, // kWh
    installationDate: { type: Date },
    inverter: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.SolarSystem || mongoose.model("SolarSystem", SolarSystemSchema);
