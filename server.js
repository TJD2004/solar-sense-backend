import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";

import { connectDB } from "./config/db.js";
import { twin } from "./simulator/engine.js";
import { attachSockets } from "./sockets/index.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

import solarRoutes from "./routes/solar.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import forecastRoutes from "./routes/forecast.routes.js";
import simulatorRoutes from "./routes/simulator.routes.js";

const PORT = process.env.PORT || 4000;
const rawCors = process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174";
const CORS_ORIGIN = Array.from(new Set([...rawCors.split(",").map((s) => s.trim()), "http://localhost:5173", "http://localhost:5174"]));

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, service: "solarsense-server", time: new Date().toISOString() }));

app.use("/api/solar", solarRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/simulator", simulatorRoutes);

app.use(notFound);
app.use(errorHandler);

const httpServer = createServer(app);
attachSockets(httpServer);

async function start() {
  await connectDB(); // optional — server runs in memory-only mode without it
  twin.start(); // begin ticking the shared digital twin
  httpServer.listen(PORT, () => {
    console.log(`[server] SolarSense API listening on http://localhost:${PORT}`);
    console.log(`[server] CORS allowed origins: ${CORS_ORIGIN.join(", ")}`);
  });
}

start();

process.on("SIGINT", () => {
  twin.stop();
  httpServer.close(() => process.exit(0));
});
