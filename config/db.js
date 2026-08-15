import mongoose from "mongoose";

// The whole app (routes, AI endpoints, the digital twin) works without a
// database — MONGO_URI is optional. When it's unset or unreachable, we log
// once and continue in-memory: readings/insights just aren't persisted.
// isDbConnected() lets controllers decide whether to write.

let connected = false;

export function isDbConnected() {
  return connected;
}

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("[db] MONGO_URI not set — running in memory-only mode (no persistence).");
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    connected = true;
    console.log("[db] Connected to MongoDB.");
    mongoose.connection.on("disconnected", () => {
      connected = false;
      console.warn("[db] MongoDB disconnected.");
    });
    return true;
  } catch (err) {
    connected = false;
    console.warn(`[db] Could not connect to MongoDB (${err.message}) — continuing in memory-only mode.`);
    return false;
  }
}
