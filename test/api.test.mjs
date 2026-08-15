// Smoke/regression tests for the Express + Socket.IO backend.
//
// Boots the actual server.js as a child process (not an in-process import,
// since server.js starts listening as a side effect of module load) on a
// scratch port, hits every route with real HTTP requests, and tears it
// down after. This is deliberately black-box: it exercises exactly what a
// real client would, including the digital twin's shared state carrying
// over between requests.
//
// Run with: npm test  (from server/)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 4791; // unlikely to collide with a dev server on 4000
const BASE = `http://127.0.0.1:${PORT}`;

let child;

before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT), CORS_ORIGIN: "http://localhost:5173" },
    stdio: "pipe",
  });

  // Wait for the "listening" log line rather than a fixed sleep, so this
  // isn't flaky under load.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not start within 8s")), 8000);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("error", reject);
  });
});

after(() => {
  child?.kill();
});

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
}

async function postJSON(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

test("GET /api/health", async () => {
  const { status, body } = await getJSON("/api/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test("GET /api/simulator/status returns the twin's full state", async () => {
  const { status, body } = await getJSON("/api/simulator/status");
  assert.equal(status, 200);
  assert.equal(body.scenarioId, "normal");
  assert.ok(Array.isArray(body.curve) && body.curve.length > 0);
  assert.ok(Array.isArray(body.scenarios) && body.scenarios.length === 5);
});

test("POST /api/simulator/scenario updates shared state, rejects unknown ids", async () => {
  const ok = await postJSON("/api/simulator/scenario", { scenarioId: "cloudy" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.scenarioId, "cloudy");

  const status = await getJSON("/api/simulator/status");
  assert.equal(status.body.scenarioId, "cloudy", "scenario change should persist on the shared twin");

  const bad = await postJSON("/api/simulator/scenario", { scenarioId: "not-a-real-scenario" });
  assert.equal(bad.status, 400);

  // reset for subsequent tests
  await postJSON("/api/simulator/scenario", { scenarioId: "normal" });
});

test("GET /api/solar/live and /api/solar/today", async () => {
  const live = await getJSON("/api/solar/live");
  assert.equal(live.status, 200);
  assert.equal(typeof live.body.solar, "number");
  assert.equal(typeof live.body.battery, "number");

  const today = await getJSON("/api/solar/today");
  assert.equal(today.status, 200);
  assert.ok(Array.isArray(today.body.curve));
  assert.equal(typeof today.body.dailyKWh, "number");
});

test("GET /api/solar/history returns points for every supported range", async () => {
  for (const range of ["7d", "30d", "6m", "1y"]) {
    const { status, body } = await getJSON(`/api/solar/history?range=${range}`);
    assert.equal(status, 200);
    assert.equal(body.range, range);
    assert.ok(Array.isArray(body.points) && body.points.length > 0);
  }
});

test("GET /api/analytics/performance, /health, /savings", async () => {
  const perf = await getJSON("/api/analytics/performance");
  assert.equal(perf.status, 200);
  assert.equal(typeof perf.body.healthScore, "number");
  assert.equal(typeof perf.body.shortfallPct, "number");

  const health = await getJSON("/api/analytics/health");
  assert.equal(health.status, 200);
  assert.ok(health.body.healthScore >= 0 && health.body.healthScore <= 100);

  const savings = await getJSON("/api/analytics/savings");
  assert.equal(savings.status, 200);
  assert.equal(typeof savings.body.savings, "number");
});

test("GET /api/forecast/today, /tomorrow, /week", async () => {
  const today = await getJSON("/api/forecast/today");
  assert.equal(today.status, 200);
  assert.ok(Array.isArray(today.body.points));

  const tomorrow = await getJSON("/api/forecast/tomorrow");
  assert.equal(tomorrow.status, 200);
  assert.equal(typeof tomorrow.body.expectedKWh, "number");

  const week = await getJSON("/api/forecast/week");
  assert.equal(week.status, 200);
  assert.equal(week.body.points.length, 7);
});

test("POST /api/ai/analyze always returns a well-formed insight (heuristic fallback with no GROQ_API_KEY)", async () => {
  const { status, body } = await postJSON("/api/ai/analyze", {});
  assert.equal(status, 200);
  assert.equal(typeof body.title, "string");
  assert.equal(typeof body.body, "string");
  assert.ok(Array.isArray(body.tags));
  assert.equal(body.source, "heuristic", "no GROQ_API_KEY is set in the test env, so this must fall back");
});

test("POST /api/ai/chat requires a message and replies from real twin data", async () => {
  const missing = await postJSON("/api/ai/chat", {});
  assert.equal(missing.status, 400);

  const { status, body } = await postJSON("/api/ai/chat", { message: "How much have I saved this month?" });
  assert.equal(status, 200);
  assert.equal(typeof body.reply, "string");
  assert.ok(body.reply.length > 0);
  assert.equal(body.source, "heuristic");
});

test("POST /api/ai/schedule requires appliance fields and returns a recommended window", async () => {
  const missing = await postJSON("/api/ai/schedule", { name: "Washing Machine" });
  assert.equal(missing.status, 400);

  const { status, body } = await postJSON("/api/ai/schedule", {
    name: "Washing Machine",
    powerKW: 1.2,
    durationHours: 1,
  });
  assert.equal(status, 200);
  assert.equal(typeof body.window, "string");
  assert.equal(typeof body.reductionKWh, "number");
  assert.equal(typeof body.explanation, "string");
});

test("unknown route returns 404 via notFound middleware", async () => {
  const { status } = await getJSON("/api/does-not-exist");
  assert.equal(status, 404);
});
