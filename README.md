# ⚙️ SolarSense Backend — Digital Twin Engine & AI Server

> **SolarSense Backend** is an Express.js & Socket.IO server powering the SolarSense platform. It hosts a shared **Server-Side Digital Twin Engine**, real-time IoT physical calculations, WebSocket event broadcasting, and Groq LLM integration.

### 🌐 Deployed API: [https://solar-sense-backend-8rsi.onrender.com](https://solar-sense-backend-8rsi.onrender.com/api/health)

---

## ✨ Features & Subsystems

### 1. ⚙️ Shared Digital Twin Engine (`simulator/`)
- **Single Source of Truth (`engine.js`)**: Holds global twin state (active scenario, environmental parameter overrides, live reading, and tick count).
- **2-Second Tick Loop**: Drives continuous real-time inverter data streams for all connected clients across tabs and devices.
- **Dynamic Override Controller**: Handles HTTP `POST /api/simulator/scenario` to adjust weather, temperature, cloud cover, shading, panel dust/soiling, time of day, home load, and battery level in real-time.

### 2. 🔬 Physics & Mathematics Engine (`simulator/math.js`)
- **Clear-Sky Curve**: $ClearSky(h) = 5.1 \times e^{-\frac{(h - 12.5)^2}{2 \times 3.4^2}}$
- **Irradiance & Obscurity**: Computes dynamic solar irradiance ($\text{W/m}^2$) reacting to sun angle, cloud cover, and weather presets.
- **Panel Thermal Model**: $PanelTemp = AmbientTemp + \left(\frac{Irradiance}{1000}\right) \times 25^\circ\text{C}$
- **Inverter Thermal Loss**: Derives panel efficiency with $-1.5\%$ efficiency loss per $1^\circ\text{C}$ above $25^\circ\text{C}$.
- **Net Grid & Battery Flow**: Auto-calculates battery charging/discharging and grid import/export based on solar surplus vs home consumption.

### 3. 🔌 Real-Time WebSocket Broadcaster (`sockets/index.js`)
- **`solar:live`**: Emits real-time 12-metric telemetry snapshots on every tick.
- **`solar:status`**: Emits full system state (scenario, curve, health score, daily kWh, monthly impact) on connection and override updates.

### 4. 🤖 LLM AI Services (`services/groqService.js`)
- **AI Performance Detective (`POST /api/ai/analyze`)**: Analyzes production curves and explains shortfalls caused by cloud cover, shading, panel soiling, or inverter faults.
- **Solar Copilot Chat (`POST /api/ai/chat`)**: Context-aware assistant responding to user queries about energy savings, carbon offset, and system health.
- **Smart Appliance Scheduler (`POST /api/ai/schedule`)**: Determines optimal daylight window with maximum solar surplus for appliances.

### 5. 🛡️ Resilience & Zero-Configuration Mode
- **No MongoDB?** Server automatically runs in **in-memory mode** — digital twin ticks and APIs work perfectly without DB requirements.
- **No Groq API Key / Rate Limit?** `/api/ai/*` routes automatically fall back to deterministic, scenario-grounded AI heuristics (`source: "heuristic"`).

---

## 📁 Repository Structure

```text
server/
├── config/
│   └── db.js                 # MongoDB Mongoose connection with memory fallback
├── controllers/
│   ├── aiController.js       # Groq AI Performance Detective & Copilot routes
│   ├── analyticsController.js# Performance & savings analytics
│   ├── forecastController.js # Solar generation forecast endpoints
│   ├── simulatorController.js# Digital twin scenario & override controller
│   └── solarController.js    # Live telemetry & historical readings
├── middleware/
│   └── errorHandler.js       # Error & not-found middleware
├── models/
│   ├── AIInsight.js          # Persisted AI insight schema
│   └── SolarReading.js       # Persisted IoT reading schema
├── routes/
│   ├── ai.routes.js          # /api/ai routes
│   ├── analytics.routes.js   # /api/analytics routes
│   ├── forecast.routes.js    # /api/forecast routes
│   ├── simulator.routes.js   # /api/simulator routes
│   └── solar.routes.js       # /api/solar routes
├── services/
│   └── groqService.js        # Groq SDK LLM client with heuristic safety nets
├── simulator/
│   ├── engine.js             # Shared DigitalTwin instance & emitter
│   ├── math.js               # Real-time solar physics & IoT metrics
│   └── scenarios.js          # Scenario definitions & anomaly rules
├── sockets/
│   └── index.js              # Socket.IO connection & event handling
├── server.js                 # Server entry point & CORS configuration
└── package.json
```

---

## 🛠️ API Reference

| Method | Route | Description |
| :--- | :--- | :--- |
| **GET** | `/api/health` | Health check endpoint |
| **GET** | `/api/solar/live` | Latest live 12-metric telemetry reading |
| **GET** | `/api/solar/today` | Today's hourly generation curve & health score |
| **GET** | `/api/solar/history` | Historical readings (`?range=7d\|30d\|6m\|1y`) |
| **POST** | `/api/simulator/scenario` | Update twin scenario ID or environmental parameter overrides |
| **GET** | `/api/simulator/status` | Full digital twin status snapshot |
| **POST** | `/api/ai/analyze` | AI Performance Detective anomaly breakdown |
| **POST** | `/api/ai/chat` | AI Copilot natural language assistant |
| **POST** | `/api/ai/schedule` | Smart appliance solar window recommendation |
| **GET** | `/api/forecast/today` | Hourly expected generation forecast |
| **GET** | `/api/forecast/week` | 7-day expected output forecast |

---

## 🔑 Environment Variables (`.env`)

Every variable is **optional** with a built-in safe fallback:

```env
PORT=4000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/solarsense
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

The Express server will start listening at **`http://localhost:4000`**.

---

## 📜 License

MIT License — Free for open-source & educational use.