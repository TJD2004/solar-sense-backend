// Real-time push (spec's "Socket.IO for real-time push" remaining-work
// item). Every twin tick and every scenario/offline change is broadcast so
// clients that opt in no longer need to poll GET /api/solar/live —
// polling still works as a fallback for clients that don't use sockets.
//
// Events emitted:
//   'solar:live'      -> live reading snapshot, every ~2.6s (matches TICK_MS)
//   'solar:scenario'   -> full status payload, whenever scenario/offline changes

import { Server } from "socket.io";
import { twin } from "../simulator/engine.js";
import { isDbConnected } from "../config/db.js";
import SolarReading from "../models/SolarReading.js";

export function attachSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    // send current state immediately on connect so a new client doesn't
    // wait for the next tick to render something
    socket.emit("solar:status", twin.getStatus());

    socket.on("disconnect", () => {});
  });

  twin.on("tick", (snapshot) => {
    io.emit("solar:live", snapshot);

    // Best-effort persistence — fire and forget, never blocks the socket
    // push. Downsampled implicitly since it only runs on real twin ticks.
    if (isDbConnected()) {
      SolarReading.create({
        timestamp: new Date(),
        solarPower: snapshot.solar,
        consumption: snapshot.home,
        battery: snapshot.battery,
        gridExport: snapshot.grid,
        scenarioId: snapshot.scenarioId,
      }).catch((err) => console.warn(`[sockets] failed to persist reading: ${err.message}`));
    }
  });

  twin.on("scenario", () => {
    io.emit("solar:status", twin.getStatus());
  });

  return io;
}
