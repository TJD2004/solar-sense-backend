// Groq-backed AI for /api/ai/analyze, /api/ai/chat, /api/ai/schedule.
//
// Design: the math (curve, health score, recommendWindow, monthly impact)
// is ALWAYS computed by simulator/math.js first and passed to Groq as
// context — Groq is only ever asked to explain/phrase numbers that were
// already computed, never to invent them. If GROQ_API_KEY is unset or the
// call fails, every function below falls back to a deterministic heuristic
// so the demo never breaks (same pattern the frontend used for its stub
// Copilot before a backend existed).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SAFETY_RULE =
  "Never state that a physical fault (e.g. inverter failure) is definitely present without direct evidence — describe it as a possible or likely contributor at most, and say so explicitly when uncertain.";

async function callGroq(messages, { maxTokens = 300 } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      console.warn(`[groq] request failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn(`[groq] request error: ${err.message}`);
    return null;
  }
}

// --- /api/ai/analyze ---
// Explains why actual production deviates from expected, grounded in the
// active scenario's real computed shortfall — mirrors spec §5's
// "AI Solar Performance Detective".
export async function analyzePerformance({ scenario, healthScore, curve }) {
  const totalExpected = curve.reduce((s, p) => s + p.expected, 0);
  const totalActual = curve.reduce((s, p) => s + p.generation, 0);
  const shortfallPct = totalExpected > 0 ? Math.round((1 - totalActual / totalExpected) * 100) : 0;

  const heuristic = {
    title: scenario.insight.title,
    body: scenario.insight.body,
    tags: scenario.insight.tags,
    severity: scenario.insight.severity,
    shortfallPct,
    healthScore,
    source: "heuristic",
  };

  const prompt = [
    { role: "system", content: `You are SolarSense's AI Performance Detective. ${SAFETY_RULE} Keep the answer to 2-3 sentences, plain language, no markdown.` },
    {
      role: "user",
      content: `Today's production is ${shortfallPct}% ${shortfallPct >= 0 ? "below" : "above"} expected. Health score: ${healthScore}/100. Scenario ground truth (for your reasoning only, don't quote it verbatim): ${scenario.insight.body} Likely contributors ranked: ${scenario.insight.tags.join(", ")}. Explain this to the homeowner.`,
    },
  ];

  const text = await callGroq(prompt);
  if (!text) return heuristic;
  return { ...heuristic, body: text, source: "groq" };
}

// --- /api/ai/chat ---
// Context-aware copilot — ported logic from the frontend's getStubReply()
// as the fallback, with Groq as an optional upgrade for free-form phrasing.
export async function chatWithCopilot({ message, ctx, recommendWindow }) {
  const m = message.toLowerCase();
  const { curve, monthly, scenario, healthScore } = ctx;

  const heuristicReply = (() => {
    if (m.includes("month") && (m.includes("produce") || m.includes("generat"))) {
      return `You've generated ${monthly.monthGeneratedKWh} kWh this month so far.`;
    }
    if (m.includes("yesterday") || m.includes("bad") || m.includes("wrong") || m.includes("why")) {
      return scenario.id === "normal"
        ? "Yesterday tracked the expected curve closely — no notable dip."
        : scenario.insight.body;
    }
    if (m.includes("wash") || m.includes("run") || m.includes("now") || m.includes("should i")) {
      const rec = recommendWindow(curve, 1, 1.2);
      return `The best solar window today is ${rec.window} — running a ~1.2 kW appliance then would cut roughly ${rec.reductionKWh} kWh of grid draw.`;
    }
    if (m.includes("save") || m.includes("saving") || m.includes("money")) {
      return `You've saved ₹${monthly.savings.toLocaleString("en-IN")} so far this month, from ${monthly.monthGeneratedKWh} kWh generated.`;
    }
    if (m.includes("co2") || m.includes("carbon") || m.includes("environment")) {
      return `You've avoided about ${monthly.co2AvoidedKg} kg of CO₂ this month — roughly equivalent to ${monthly.treesPerYear} trees over a year.`;
    }
    if (m.includes("health") || m.includes("status") || m.includes("ok") || m.includes("fine")) {
      return scenario.id === "normal"
        ? "Your system is healthy — production is tracking close to the expected curve."
        : `${scenario.insight.title}: ${scenario.insight.body}`;
    }
    return "I can answer questions about your generation, savings, CO₂ impact, system health, or when to run appliances — try asking one of those.";
  })();

  const dataSummary = `Health score: ${healthScore}/100. Scenario: ${scenario.label}. Month generated: ${monthly.monthGeneratedKWh} kWh. Savings so far: ₹${monthly.savings}. CO2 avoided: ${monthly.co2AvoidedKg} kg (~${monthly.treesPerYear} trees/yr). Scenario insight: ${scenario.insight.body}`;

  const prompt = [
    {
      role: "system",
      content: `You are SolarSense's AI Copilot, a context-aware assistant for a homeowner's solar system. ${SAFETY_RULE} Answer ONLY using the data given to you below — never invent numbers. Keep replies to 1-3 sentences, plain language, no markdown. Data: ${dataSummary}`,
    },
    { role: "user", content: message },
  ];

  const text = await callGroq(prompt, { maxTokens: 200 });
  return { reply: text || heuristicReply, source: text ? "groq" : "heuristic" };
}

// --- /api/ai/schedule ---
// The best-window math is always computed by recommendWindow() (authoritative);
// Groq is only asked to phrase the explanation.
export async function explainSchedule({ appliance, rec }) {
  const heuristicReply = `Run your ${appliance.name} between ${rec.window} — expected solar output then is about ${rec.avgGen} kW, cutting roughly ${rec.reductionKWh} kWh of grid draw.`;

  const prompt = [
    { role: "system", content: `You are SolarSense's AI Smart Appliance Scheduler. ${SAFETY_RULE} Keep the answer to 1-2 sentences, plain language, no markdown. Do not change the numbers given to you.` },
    {
      role: "user",
      content: `Appliance: ${appliance.name}, ${appliance.powerKW} kW, ${appliance.durationHours}h. Recommended window: ${rec.window}. Avg expected solar during window: ${rec.avgGen} kW. Estimated grid-usage reduction: ${rec.reductionKWh} kWh. Write the recommendation for the homeowner.`,
    },
  ];

  const text = await callGroq(prompt, { maxTokens: 150 });
  return { explanation: text || heuristicReply, source: text ? "groq" : "heuristic" };
}
