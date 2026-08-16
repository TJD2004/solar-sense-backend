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

const INSIGHT_TRANSLATIONS = {
  hi: {
    normal: {
      title: "एआई प्रदर्शन जासूस",
      body: "आज के मौसम और साल के इस समय के लिए उत्पादन अपेक्षित स्तरों के करीब चल रहा है। यदि उत्पादन पूर्वानुमान से नीचे गिरता है, तो यह पैनल केवल संख्या को दिखाने के बजाय संभावित कारणों को समझाता है।",
      tags: ["☁️ बादल छाना", "🌳 छायांकन", "🧹 गंदगी/धूल"]
    },
    cloudy: {
      title: "एआई प्रदर्शन जासूस",
      body: "दिन के मध्य में उत्पादन पूर्वानुमान बैंड से नीचे चल रहा है। गिरावट का पैटर्न आज के बादल छाने के पूर्वानुमान से मेल खाता है, जो सबसे संभावित कारण है।",
      tags: ["☁️ बादल छाना — संभावित कारण", "🌳 दोपहर का छायांकन — असंभावित", "🧹 पैनल पर गंदगी — असंभावित"]
    },
    rainy: {
      title: "एआई प्रदर्शन जासूस",
      body: "भारी बारिश से सौर उत्पादन गंभीर रूप से प्रभावित हुआ है। हालांकि उत्पादन कम है, लेकिन बारिश पैनलों के लिए एक प्राकृतिक सफाई प्रभाव प्रदान करती है।",
      tags: ["🌧️ भारी बारिश — प्राथमिक कारण", "⚡ कम सौर विकिरण"]
    },
    heatwave: {
      title: "एआई प्रदर्शन जासूस",
      body: "उच्च तापमान के कारण थर्मल दक्षता का नुकसान हो रहा है। 25°C से ऊपर प्रत्येक डिग्री के लिए सौर पैनल लगभग 0.4% दक्षता खो देते हैं।",
      tags: ["🔥 थर्मल गिरावट — संभावित", "☀️ साफ आसमान"]
    },
    shading: {
      title: "एआई प्रदर्शन जासूस",
      body: "सुबह का कर्व सामान्य रहने के बावजूद हर दोपहर एक ही समय पर उत्पादन तेजी से गिरता है। यह दोहरावदार, समय-लॉक पैटर्न मौसम के बजाय निश्चित छायांकन की ओर इशारा करता है।",
      tags: ["🌳 दोपहर का छायांकन — संभावित कारण", "☁️ बादल छाना — असंभावित", "🧹 पैनल पर गंदगी — असंभावित"]
    },
    soiling: {
      title: "एआई प्रदर्शन जासूस",
      body: "बिना किसी अचानक गिरावट के पूरे दिन उत्पादन अपेक्षित से थोड़ा कम है। इस तरह की धीमी, समान गिरावट धूल या मलबे के जमा होने के अनुरूप है। पैनलों की सफाई की जांच करें।",
      tags: ["🧹 पैनल पर गंदगी — संभावित कारण", "☁️ बादल छाना — असंभावित", "🌳 छायांकन — असंभावित"]
    },
    inverter: {
      title: "एआई प्रदर्शन जासूस",
      body: "उत्पादन एक ही अंतराल में तेजी से गिरा और ठीक नहीं हुआ है, जो मौसम या धूल के सामान्य धीमे पैटर्न के विपरीत है। यह अचानक, निरंतर गिरावट इन्वर्टर या कनेक्शन की खराबी के अनुरूप है। इन्वर्टर की जांच की सिफारिश की जाती है।",
      tags: ["⚠️ इन्वर्टर खराबी — संभावित, पुष्टि नहीं हुई", "☁️ बादल छाना — असंभावित", "🧹 गंदगी/धूल — असंभावित"]
    }
  },
  mr: {
    normal: {
      title: "एआय कार्यक्षमता शोधक",
      body: "आजचे हवामान आणि वर्षाच्या या वेळेसाठी सौर निर्मिती अपेक्षित पातळीच्या जवळ चालू आहे. जर निर्मिती अंदाजापेक्षा खाली गेली, तर हे पॅनेल केवळ संख्या दाखवण्याऐवजी संभाव्य कारणे स्पष्ट करते.",
      tags: ["☁️ ढगाळ हवामान", "🌳 छायांकन", "🧹 धूळ आणि घाण"]
    },
    cloudy: {
      title: "एआय कार्यक्षमता शोधक",
      body: "दिवसाच्या मध्यभागी सौर निर्मिती अंदाजापेक्षा कमी आहे. ही घट आजच्या ढगाळ हवामानाच्या अंदाजाशी जुळते, जे सर्वात संभाव्य कारण आहे.",
      tags: ["☁️ ढगाळ हवामान — संभाव्य कारण", "🌳 दुपारचे छायांकन — असंभव", "🧹 पॅनेलवरील धूळ — असंभव"]
    },
    rainy: {
      title: "एआय कार्यक्षमता शोधक",
      body: "मुसळधार पावसामुळे सौर निर्मितीवर गंभीर परिणाम झाला आहे. जरी निर्मिती कमी असली, तरी पावसामुळे पॅनेल नैसर्गिकरित्या स्वच्छ होतात.",
      tags: ["🌧️ मुसळधार पाऊस — मुख्य कारण", "⚡ कमी सूर्यप्रकाश"]
    },
    heatwave: {
      title: "एआय कार्यक्षमता शोधक",
      body: "उच्च तापमानामुळे थर्मल कार्यक्षमतेचे नुकसान होत आहे. 25°C पेक्षा जास्त प्रत्येक डिग्रीसाठी सौर पॅनेल सुमारे 0.4% कार्यक्षमता गमावतात.",
      tags: ["🔥 थर्मल कार्यक्षमता बिघाड — संभाव्य", "☀️ स्वच्छ आकाश"]
    },
    shading: {
      title: "एआय कार्यक्षमता शोधक",
      body: "सकाळचा कर्व सामान्य असतानाही दररोज दुपारी एकाच वेळी सौर निर्मिती वेगाने खाली येते. हा पुन्हा पुन्हा घडणारा वेळ-लॉक केलेला पॅटर्न हवामानाऐवजी स्थिर सावली दर्शवतो.",
      tags: ["🌳 दुपारचे छायांकन — संभाव्य कारण", "☁️ ढगाळ हवामान — असंभव", "🧹 पॅनेलवरील धूळ — असंभव"]
    },
    soiling: {
      title: "एआय कार्यक्षमता शोधक",
      body: "अचानक कोणताही मोठा बदल न होता संपूर्ण दिवसभर सौर निर्मिती अपेक्षेपेक्षा किंचित कमी आहे. अशी संथ, एकसमान घट धूळ साचण्याशी सुसंगत आहे. पॅनेल साफ करणे फायदेशीर ठरेल.",
      tags: ["🧹 पॅनेलवरील धूळ — संभाव्य कारण", "☁️ ढगाळ हवामान — असंभव", "🌳 छायांकन — असंभव"]
    },
    inverter: {
      title: "एआय कार्यक्षमता शोधक",
      body: "सौर निर्मिती एकाच अंतराळात वेगाने घसरली आणि पूर्ववत झाली नाही. हा अचानक झालेला बदल इन्व्हर्टर किंवा कनेक्शन बिघाडाशी सुसंगत आहे. इन्व्हर्टर तपासणीची शिफारस केली जाते.",
      tags: ["⚠️ इन्व्हर्टर बिघाड — संभाव्य, निश्चित नाही", "☁️ ढगाळ हवामान — असंभव", "🧹 धूळ आणि घाण — असंभव"]
    }
  }
};

// --- /api/ai/analyze ---
export async function analyzePerformance({ scenario, healthScore, curve, lang }) {
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

  if ((lang === "hi" || lang === "mr") && INSIGHT_TRANSLATIONS[lang]?.[scenario.id]) {
    const trans = INSIGHT_TRANSLATIONS[lang][scenario.id];
    heuristic.title = trans.title;
    heuristic.body = trans.body;
    heuristic.tags = trans.tags;
  }

  const langPrompt = lang === "hi"
    ? "Respond ONLY in Hindi (हिंदी). Translate all descriptions and recommendations naturally into Hindi."
    : lang === "mr"
    ? "Respond ONLY in Marathi (मराठी). Translate all descriptions and recommendations naturally into Marathi."
    : "Respond ONLY in English.";

  const prompt = [
    { role: "system", content: `You are SolarSense's AI Performance Detective. ${SAFETY_RULE} ${langPrompt} Keep the answer to 2-3 sentences, plain language, no markdown.` },
    {
      role: "user",
      content: `Today's production is ${shortfallPct}% ${shortfallPct >= 0 ? "below" : "above"} expected. Health score: ${healthScore}/100. Scenario ground truth: ${heuristic.body}. Likely contributors ranked: ${heuristic.tags.join(", ")}. Explain this to the homeowner in that language.`,
    },
  ];

  const text = await callGroq(prompt);
  if (!text) return heuristic;
  return { ...heuristic, body: text, source: "groq" };
}

// --- /api/ai/chat ---
export async function chatWithCopilot({ message, ctx, recommendWindow, lang }) {
  const m = message.toLowerCase();
  const { curve, monthly, scenario, healthScore } = ctx;
  const isHi = lang === "hi";
  const isMr = lang === "mr";

  const heuristicReply = (() => {
    if ((m.includes("month") || m.includes("महीना") || m.includes("महिना")) && (m.includes("produce") || m.includes("generat") || m.includes("उत्पादन") || m.includes("निर्मिती"))) {
      if (isHi) return `आपने इस महीने अब तक ${monthly.monthGeneratedKWh} kWh बिजली का उत्पादन किया है।`;
      if (isMr) return `तुम्ही या महिन्यात आतापर्यंत ${monthly.monthGeneratedKWh} kWh वीज निर्माण केली आहे.`;
      return `You've generated ${monthly.monthGeneratedKWh} kWh this month so far.`;
    }
    if (m.includes("yesterday") || m.includes("bad") || m.includes("wrong") || m.includes("why") || m.includes("कल") || m.includes("काल") || m.includes("खराब") || m.includes("का") || m.includes("क्यों")) {
      if (scenario.id === "normal") {
        if (isHi) return "कल उत्पादन अपेक्षित वक्र के करीब था — कोई गिरावट नहीं देखी गई।";
        if (isMr) return "काल निर्मिती अपेक्षित वक्राच्या जवळ होती — कोणतीही घट आढळली नाही।";
        return "Yesterday tracked the expected curve closely — no notable dip.";
      }
      if (isHi) return INSIGHT_TRANSLATIONS.hi[scenario.id]?.body || scenario.insight.body;
      if (isMr) return INSIGHT_TRANSLATIONS.mr[scenario.id]?.body || scenario.insight.body;
      return scenario.insight.body;
    }
    if (m.includes("wash") || m.includes("run") || m.includes("now") || m.includes("should i") || m.includes("कपड़े") || m.includes("चला") || m.includes("कपडे") || m.includes("चालू")) {
      const rec = recommendWindow(curve, 1, 1.2);
      if (isHi) return `आज सबसे अच्छा सौर समय ${rec.window} है — उस समय ~1.2 kW उपकरण चलाने से ग्रिड से लगभग ${rec.reductionKWh} kWh की खपत कम होगी।`;
      if (isMr) return `आजची सर्वोत्तम सौर वेळ ${rec.window} आहे — त्या वेळी ~1.2 kW उपकरणे चालवल्यास ग्रिडवरील वापर सुमारे ${rec.reductionKWh} kWh कमी होईल।`;
      return `The best solar window today is ${rec.window} — running a ~1.2 kW appliance then would cut roughly ${rec.reductionKWh} kWh of grid draw.`;
    }
    if (m.includes("save") || m.includes("saving") || m.includes("money") || m.includes("बचत") || m.includes("पैसे")) {
      if (isHi) return `आपने इस महीने अब तक ${monthly.monthGeneratedKWh} kWh के सौर उत्पादन से ₹${monthly.savings.toLocaleString("en-IN")} बचाए हैं।`;
      if (isMr) return `तुम्ही या महिन्यात आतापर्यंत ${monthly.monthGeneratedKWh} kWh च्या सौर निर्मितीमधून ₹${monthly.savings.toLocaleString("en-IN")} वाचवले आहेत।`;
      return `You've saved ₹${monthly.savings.toLocaleString("en-IN")} so far this month, from ${monthly.monthGeneratedKWh} kWh generated.`;
    }
    if (m.includes("co2") || m.includes("carbon") || m.includes("environment") || m.includes("पर्यावरण") || m.includes("पेड़") || m.includes("झाडे")) {
      if (isHi) return `आपने इस महीने लगभग ${monthly.co2AvoidedKg} किलो CO₂ बचाया है — जो प्रति वर्ष लगभग ${monthly.treesPerYear} पेड़ों के बराबर है।`;
      if (isMr) return `तुम्ही या महिन्यात सुमारे ${monthly.co2AvoidedKg} किलो CO₂ वाचवला आहे — जे प्रति वर्ष सुमारे ${monthly.treesPerYear} झाडांच्या बरोबरीचे आहे।`;
      return `You've avoided about ${monthly.co2AvoidedKg} kg of CO₂ this month — roughly equivalent to ${monthly.treesPerYear} trees over a year.`;
    }
    if (m.includes("health") || m.includes("status") || m.includes("ok") || m.includes("fine") || m.includes("आरोग्य") || m.includes("स्थिति") || m.includes("ठीक")) {
      if (scenario.id === "normal") {
        if (isHi) return "आपका सिस्टम स्वस्थ है — उत्पादन अपेक्षित वक्र के करीब चल रहा है।";
        if (isMr) return "तुमची प्रणाली निरोगी आहे — निर्मिती अपेक्षित वक्राच्या जवळ चालू आहे।";
        return "Your system is healthy — production is tracking close to the expected curve.";
      }
      const title = isHi ? INSIGHT_TRANSLATIONS.hi[scenario.id]?.title : isMr ? INSIGHT_TRANSLATIONS.mr[scenario.id]?.title : scenario.insight.title;
      const body = isHi ? INSIGHT_TRANSLATIONS.hi[scenario.id]?.body : isMr ? INSIGHT_TRANSLATIONS.mr[scenario.id]?.body : scenario.insight.body;
      return `${title}: ${body}`;
    }
    if (isHi) return "मैं आपके सौर उत्पादन, बचत, CO₂ प्रभाव, सिस्टम स्वास्थ्य या उपकरण चलाने के सही समय के बारे में प्रश्नों के उत्तर दे सकता हूँ।";
    if (isMr) return "मी तुमच्या सौर निर्मिती, बचत, CO₂ प्रभाव, प्रणालीचे आरोग्य किंवा उपकरणे चालवण्याच्या सर्वोत्तम वेळेबद्दलच्या प्रश्नांची उत्तरे देऊ शकतो।";
    return "I can answer questions about your generation, savings, CO₂ impact, system health, or when to run appliances — try asking one of those.";
  })();

  const dataSummary = `Health score: ${healthScore}/100. Scenario: ${scenario.label}. Month generated: ${monthly.monthGeneratedKWh} kWh. Savings so far: ₹${monthly.savings}. CO2 avoided: ${monthly.co2AvoidedKg} kg (~${monthly.treesPerYear} trees/yr). Scenario insight: ${scenario.insight.body}`;

  const langPrompt = isHi
    ? "Respond ONLY in Hindi (हिंदी). Translate all calculations and insights naturally into Hindi."
    : isMr
    ? "Respond ONLY in Marathi (मराठी). Translate all calculations and insights naturally into Marathi."
    : "Respond ONLY in English.";

  const prompt = [
    {
      role: "system",
      content: `You are SolarSense's AI Copilot, a context-aware assistant for a homeowner's solar system. ${SAFETY_RULE} ${langPrompt} Answer ONLY using the data given to you below — never invent numbers. Keep replies to 1-3 sentences, plain language, no markdown. Data: ${dataSummary}`,
    },
    { role: "user", content: message },
  ];

  const text = await callGroq(prompt, { maxTokens: 200 });
  return { reply: text || heuristicReply, source: text ? "groq" : "heuristic" };
}

// --- /api/ai/schedule ---
export async function explainSchedule({ appliance, rec, lang }) {
  const isHi = lang === "hi";
  const isMr = lang === "mr";

  const heuristicReply = isHi
    ? `अपने ${appliance.name} को ${rec.window} के बीच चलाएं — उस समय अपेक्षित सौर उत्पादन लगभग ${rec.avgGen} kW है, जिससे लगभग ${rec.reductionKWh} kWh ग्रिड बिजली की बचत होगी।`
    : isMr
    ? `आपले ${appliance.name} ${rec.window} दरम्यान चालवा — त्या वेळी अपेक्षित सौर निर्मिती सुमारे ${rec.avgGen} kW आहे, ज्यामुळे ग्रिडवरील वीज वापर सुमारे ${rec.reductionKWh} kWh कमी होईल।`
    : `Run your ${appliance.name} between ${rec.window} — expected solar output then is about ${rec.avgGen} kW, cutting roughly ${rec.reductionKWh} kWh of grid draw.`;

  const langPrompt = isHi
    ? "Respond ONLY in Hindi (हिंदी). Translate all recommendations naturally into Hindi."
    : isMr
    ? "Respond ONLY in Marathi (मराठी). Translate all recommendations naturally into Marathi."
    : "Respond ONLY in English.";

  const prompt = [
    { role: "system", content: `You are SolarSense's AI Smart Appliance Scheduler. ${SAFETY_RULE} ${langPrompt} Keep the answer to 1-2 sentences, plain language, no markdown. Do not change the numbers given to you.` },
    {
      role: "user",
      content: `Appliance: ${appliance.name}, ${appliance.powerKW} kW, ${appliance.durationHours}h. Recommended window: ${rec.window}. Avg expected solar during window: ${rec.avgGen} kW. Estimated grid-usage reduction: ${rec.reductionKWh} kWh. Write the recommendation for the homeowner in that language.`,
    },
  ];

  const text = await callGroq(prompt, { maxTokens: 150 });
  return { explanation: text || heuristicReply, source: text ? "groq" : "heuristic" };
}
