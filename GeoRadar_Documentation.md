# GeoRadar — Full Project Documentation

> **Last updated:** 2026-03-14  
> **Version:** 1.0  
> **Status:** ✅ v1 Release

---

## 1. Introduction

GeoRadar is a real-time **global intelligence command center** that monitors, aggregates, and visualizes worldwide data — from live aviation traffic to open-source intelligence (OSINT) events like earthquakes, severe weather, wildfires, armed conflicts, and breaking news.

The UI follows a strict **military/tactical HUD** aesthetic: dark backgrounds, neon accent borders, monospace technical typography (`'Share Tech Mono'`, `'Orbitron'`), corner brackets on every panel, and pulsing indicator dots.

---

## 2. High-Level Architecture

```
GeoRadar/
├── GeoRadarBE/          # Node.js/Express backend (data aggregation + WebSocket server + MongoDB)
├── GeoRadarFE/          # React + Vite frontend (3D globe + dashboard panels)
├── GeoRadar_Documentation.md
└── context.md
```

**Communication flow:**

```
External APIs ──► GeoRadarBE (cache layer + MongoDB) ──► REST + WebSocket ──► GeoRadarFE (browser)
ACLED CSV ──► ACLEDIngestor ──► MongoDB ──► /api/conflicts ──► ConflictLayer.jsx
```

- The **backend** fetches from multiple external APIs, caches results to prevent rate-limit bans, runs intelligence analysis engines, stores conflict data in MongoDB, and broadcasts merged signals via WebSocket.
- The **frontend** never contacts external OSINT/aviation APIs directly. All data flows through `GeoRadarBE`.

---

## 3. Backend — `GeoRadarBE`

| Item             | Detail                                                              |
| ---------------- | ------------------------------------------------------------------- |
| Runtime          | Node.js (ES Modules — `"type": "module"`)                           |
| Framework        | Express 5                                                           |
| Entry point      | `server.js`                                                         |
| Default port     | `4000` (configurable via `.env`)                                    |
| Database         | MongoDB (optional — gracefully falls back to file-based storage)    |
| Real-time        | WebSocket server via `ws` library, attached to the same HTTP server |
| Scheduler        | `node-cron` for weekly ACLED CSV ingestion (Mondays 6 AM IST)       |
| Start command    | `npm start` or `npm run dev` (uses `node --watch`)                  |

### 3.1. Environment Variables (`.env`)

| Variable               | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `PORT`                  | HTTP/WS port (default `4000`)              |
| `OPENSKY_CLIENT_ID`     | OpenSky Network OAuth2 client ID           |
| `OPENSKY_CLIENT_SECRET` | OpenSky Network OAuth2 client secret       |
| `ADSBEXCHANGE_API_KEY`  | ADS-B Exchange API key                     |
| `ACLED_EMAIL`           | ACLED conflict data login email            |
| `ACLED_PASSWORD`        | ACLED conflict data login password         |
| `AISSTREAM_API_KEY`     | AISStream API key (optional — simulation mode if missing) |
| `MONGODB_URI`           | MongoDB connection string (default `mongodb://localhost:27017`) |
| `MONGODB_DB`            | MongoDB database name (default `georadar`) |

### 3.2. Dependencies

| Package      | Purpose                                        |
| ------------ | ---------------------------------------------- |
| `express`    | HTTP server & REST API routing                 |
| `cors`       | Cross-origin resource sharing                  |
| `ws`         | WebSocket server for real-time signal feed     |
| `dotenv`     | Environment variable loading                   |
| `node-fetch` | HTTP client for external API calls             |
| `mongodb`    | MongoDB native driver for conflict data storage|
| `node-cron`  | Scheduled tasks (weekly ACLED CSV ingestion)   |

---

### 3.3. Aviation Data Providers (`providers/`)

Flight data is gathered using a **waterfall/fallback strategy**. The first provider that succeeds is used; if it fails (rate-limit, auth error, timeout), the next is attempted.

| Provider                  | File                       | Source                         | Polling  | Notes                                                                                                          |
| ------------------------- | -------------------------- | ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| **ADSBLolProvider**       | `ADSBLolProvider.js`       | `api.adsb.lol/v2`             | On-demand| Free, no auth. Queries `/mil`, `/ladd`, + 8 regional `/point/` endpoints. Returns ADSBx-format JSON.           |
| **OpenSkyProvider**       | `OpenSkyProvider.js`       | `opensky-network.org/api`      | On-demand| OAuth2 (`client_credentials`). Queries 8 bounding-box regions. Auto-refreshes tokens. Returns state vectors.    |
| **ADSBExchangeProvider** | `ADSBExchangeProvider.js`  | `api.adsbexchange.com/v2`      | On-demand| API key auth (`api-auth` header). Queries `/mil`, `/ladd`, + 4 city-radius endpoints.                          |
| **SimulatedProvider**     | `SimulatedProvider.js`     | Local `data/airports.dat` + `data/routes.dat` | On-demand| Generates ≤ 300 simulated passenger flights using real OpenFlights airport/route data with interpolated positions.|

**Waterfall order:** `ADSBLolProvider` → `OpenSkyProvider` → `SimulatedProvider`

**Cooldown logic:** On HTTP 429 / 401 / 403 / 500 / 503, the failed provider is cooled down for **10 minutes** (`COOLDOWN_DURATION`). During cooldown it is skipped.

**Minimum flight padding:** If the successful live provider returns fewer than **150 passenger flights**, the `SimulatedProvider` is queried to pad up to the minimum, ensuring the globe never appears empty.

#### Shared Utilities

| File                  | Purpose                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `utils.js`            | `classify(callsign, categoryInt, squawk)` — classifies flights as passenger/cargo/military/private/emergency/unknown based on callsign prefixes, squawk codes, and ADSB category integers. |
| `ADSBxFormatParser.js`| `parseADSBxFormat(ac)` — normalizes ADSBx-format aircraft arrays into the unified flight object schema. |

#### Unified Flight Object Schema

```javascript
{
  icao: string,        // ICAO 24-bit hex address
  callsign: string,    // e.g. "UAL1234"
  lat: number,         // Latitude
  lon: number,         // Longitude
  altitude: number,    // Feet (ft)
  velocity: number,    // Knots (kts)
  heading: number,     // Degrees (0-360)
  verticalRate: number,// ft/min
  country: string,     // Origin country
  category: string     // "passenger" | "cargo" | "military" | "private" | "emergency" | "unknown"
}
```

#### Flight Filtering (`filterFlights`)

1. Drops flights with null/zero lat/lon, altitude < 10,000 ft, velocity < 200 kts, or unknown category with empty callsign.
2. Sorts by priority: military → passenger → cargo → emergency → private → unknown.
3. Caps: **unlimited** military, **250** passenger, **100** others.

---

### 3.4. OSINT Data Providers

Each OSINT provider runs on its own independent polling interval with internal caching. They all expose a standard `start()` / `getEvents()` interface.

#### Core OSINT Providers (`providers/`)

| Provider              | File                   | External Source                          | Poll Interval | Event Type        | Details                                                          |
| --------------------- | ---------------------- | ---------------------------------------- | ------------- | ----------------- | ---------------------------------------------------------------- |
| **EarthquakeProvider** | `EarthquakeProvider.js`| USGS GeoJSON Feed                        | 60s           | `earthquake_raw`  | All earthquakes in the past hour. Severity based on magnitude.   |
| **WeatherProvider**   | `WeatherProvider.js`   | Open-Meteo Forecast API                  | 5 min         | `weather`         | Monitors 5 cities (Tokyo, NYC, London, Sydney, Mumbai). Alerts on wind > 40 km/h or weather code ≥ 95. |
| **WildfireProvider**  | `WildfireProvider.js`  | NASA FIRMS MODIS CSV                     | 10 min        | `wildfire`        | Global 24h fire data. Filters for high confidence (>90%) and brightness > 330. Caps at 15 events. |
| **GDELTProvider**     | `GDELTProvider.js`     | GDELT Project v2 API (ArtList mode)      | 15 min        | `news`            | **Legacy — no longer imported in server.js.** Superseded by CategoryNewsProvider. Falls back to `datasets/gdelt_mock.json` on 429. |

#### Extended OSINT Providers (`providers/osint/`)

| Provider                  | File                       | External Source                     | Poll Interval | Event Type          | Details                                                                        |
| ------------------------- | -------------------------- | ----------------------------------- | ------------- | ------------------- | ------------------------------------------------------------------------------ |
| **ACLEDProvider**         | `ACLEDProvider.js`         | ACLED API / CSV / MongoDB           | 12 hours      | `acled_event`       | Waterfall: MongoDB → API → CSV → cache → mock. Stores all conflict events.     |
| **RSSNewsProvider**       | `RSSNewsProvider.js`       | BBC World, Al Jazeera, NYT RSS feeds| 5 min         | `news`/`conflict`/`protest`/`disaster` | Regex-parses RSS XML. Classifies severity by keyword matching.     |
| **DisasterAlertProvider** | `DisasterAlertProvider.js` | NOAA Weather Alerts API             | 5 min         | `disaster`          | Active severe weather alerts from U.S. government (NOAA/FEMA).                 |
| **InternetOutageProvider**| `InternetOutageProvider.js`| Simulated                           | 10 min        | `networkOutage`     | Random internet shutdown events in known conflict zones (simulation).           |
| **AISProvider**           | `AISProvider.js`           | Simulated                           | 10 min        | `shipping_anomaly`  | Random maritime congestion at 5 global chokepoints (Suez, Hormuz, Malacca, Panama, Bab el-Mandeb). |
| **ConflictProvider**      | `ConflictProvider.js`      | Aggregates RSS + Disaster providers | 5 min         | `conflict_event`    | Filters upstream events for war/conflict keywords and assigns severity.         |

#### Standalone Providers (not in broadcastSignals pipeline)

These providers serve data via REST endpoints only — they do **not** participate in the WebSocket `broadcastSignals` pipeline.

| Provider                  | File                       | External Source                     | Poll Interval | Details                                                                        |
| ------------------------- | -------------------------- | ----------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| **CategoryNewsProvider**  | `CategoryNewsProvider.js`  | Multi-source RSS (BBC, TechCrunch, CNBC, NASA, etc.) + Google News | 5 min | Aggregates news into 5 categories (global, tech, market, space, climate) + local news per country code via Google News RSS. Max 10 items per category, sorted by publication date. |
| **NitterOSINTProvider**   | `NitterOSINTProvider.js`   | xcancel.com (Nitter frontend) — scraping | 5 min | Scrapes posts from 6 OSINT X/Twitter accounts: `@sentdefender`, `@WarMonitor3`, `@OSINTtechnical`, `@AuroraIntel`, `@IntelCrab`, `@CalibreObscura`. Extracts text (max 500 chars), images, videos, links, engagement stats. Stores in MongoDB `osint_posts` collection with FIFO cap (max 30 posts). Falls back to in-memory if no MongoDB. |

---

### 3.5. ACLED Conflict Data Pipeline (Added in v0.3)

Since ACLED did not grant API access, the system uses their **weekly downloadable CSV dataset**. A complete ingestion pipeline was built:

#### Pipeline Architecture

```
ACLED Weekly CSV ──► ACLEDIngestor (parse + deduplicate) ──► MongoDB (conflict_events)
                                                           └──► JSON cache backup
ConflictScheduler (node-cron) ──► triggers ACLEDIngestor every Monday 6 AM IST
```

#### Components

| Component | File | Purpose |
|-----------|------|---------|
| **MongoDB Connection** | `db/mongo.js` | Singleton connection with auto-indexing (`event_id`, `event_date`, `country`, `lat/lng`, `event_type`) |
| **ACLEDIngestor** | `services/ACLEDIngestor.js` | CSV parser → severity classification → MongoDB bulk upsert (dedup by `event_id`) → JSON cache backup |
| **ConflictScheduler** | `services/ConflictScheduler.js` | Weekly cron via `node-cron`: Mon 6 AM IST. Auto-ingests on startup if data is stale (>7 days) or empty. |

#### ACLEDProvider Waterfall Strategy

```
1. MongoDB (if connected and has recent data)
2. ACLED API (if OAuth credentials work)
3. CSV file (datasets/acled_latest.csv)
4. JSON cache (datasets/acled_cache.json)
5. Mock data (datasets/acled_mock.json)
```

#### Severity Classification (Color System)

| Color | Severity | Event Types |
|-------|----------|-------------|
| 🟢 `#22c55e` | `low` | Protests, Strategic developments |
| 🟡 `#eab308` | `medium` | Riots |
| 🟠 `#f97316` | `high` | Battles, Armed clashes |
| 🔴 `#ef4444` | `critical` | Explosions/Remote violence, Violence against civilians |

#### Conflict Intensity Score

Used by `/api/conflict-summary`. Per-country formula:

```
score = (events_last_7_days × 0.6) + (fatalities × 0.4)
```

---

### 3.6. Analysis Engines (`analysis/`)

These modules consume **strictly cached data** — they never make new API calls.

#### ZoneEngine (`ZoneEngine.js`)

- **Purpose:** Calculate risk for a specific geographic coordinate.
- **Input:** `lat`, `lon`, cached OSINT events, cached flights.
- **Logic:**
  - Scans OSINT events within **500 km** (Haversine distance) of the user.
  - Adds risk score based on earthquake magnitude, severe weather, critical news.
  - Counts local flights within **200 km** → `Low` / `Medium` / `High` air traffic.
  - Assigns zone level: `Green` (score ≤ 10), `Yellow` (11–30), `Red` (> 30).
- **Caching:** 1-minute TTL per rounded lat/lon key.

#### StabilityEngine (`StabilityEngine.js`)

- **Purpose:** Compute a **Global Stability Score** (0–100).
- **Input:** All cached OSINT events + flights.
- **Logic:** Starts at 100 and subtracts penalties: conflicts (×3), natural disasters (×2), emergency squawks (×5).
- **Caching:** 60-second TTL.

#### AnomalyDetector (`AnomalyDetector.js`)

- **Purpose:** Detect rare, high-priority patterns across the data.
- **Detects:**
  1. **Airspace Disruption** — 3+ simultaneous emergency squawks.
  2. **Seismic Unrest** — 5+ M4.0+ earthquakes in the last hour.
  3. **Wildfire Outbreak** — 10+ active high-confidence fires.
  4. **Civil Unrest Spike** — 3+ protest events across sources.

#### ConflictEngine (`ConflictEngine.js`) — Updated v1.0

- **Purpose:** Comprehensive conflict analysis with actor normalization.
- **Input:** All OSINT events (especially ACLED + GDELT + RSS) + active siren count.
- **Features:**
  - Loads `datasets/conflictRegistry.json` for known conflict zones.
  - Normalizes actor names (e.g., "Russian Federation" → "Russia").
  - Tracks escalations vs. de-escalations over time (historical comparison).
  - **Global Stability Index (GSI)** — 5-component weighted composite scoring:
    1. **Conflict Severity** (max 40 pts) — diminishing returns formula: `rawSum × (1 - rawSum/120)`. Per-region: extreme=10, high=6, medium=3, low=1.
    2. **Active Sirens** (max 15 pts) — `sirenCount × 1.5`. Sourced from NOAA critical disasters, critical weather alerts, high-severity conflicts, and emergency flights.
    3. **Fatality Weight** (max 20 pts) — logarithmic: `log₁₀(totalFatalities) × 5`. 10 fatalities = 5pts, 100 = 10pts, 1000 = 15pts.
    4. **Geographic Spread** (max 10 pts) — `uniqueConflictCountries × 1.0`.
    5. **Escalation Momentum** (max 15 pts) — `escalatingRegions × 3`.
  - Outputs: `conflictCount`, `escalations`, `deEscalations`, `conflictList`, `globalStability`, `activeSirens`, `trend`, `alertLevel`, `activeRegions`, `growthRate`.
  - Alert level mapping: ≥80 STABLE, ≥60 ELEVATED, ≥40 UNSTABLE, ≥20 HIGH RISK, <20 CRITICAL.
- **Caching:** Time-based deduplication to prevent rebroadcast spam.

---

### 3.7. REST API Endpoints

| Method | Path                          | Description                                              | Returns                                              |
| ------ | ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/flights`                | Latest cached flight data                                | `{ timestamp, flights[], stats, meta }`              |
| GET    | `/api/zone-status?lat=&lon=`  | Personal zone risk analysis for given coordinates        | ZoneEngine result (level, weather, airTraffic, etc.) |
| GET    | `/api/global-stability`       | Global stability score                                   | StabilityEngine result (score, metrics)              |
| GET    | `/api/conflict-status`        | Active conflict analysis                                 | ConflictEngine result (counts, lists, trends)        |
| GET    | `/api/debug-conflict-engine`  | Debug data from ConflictEngine                           | Raw debug object                                     |
| GET    | `/api/human-impact`           | Casualty, siren & alert metrics                          | `{ conflictCasualties, disasterCasualties, activeSirens, humanitarianAlerts }` |
| GET    | `/api/conflicts`              | Conflict events for map markers (last 30 days, `?days=N`)| `{ success, count, data[] }` with lat/lng/type/severity |
| GET    | `/api/conflict-summary`       | Per-country conflict intensity scores                    | `{ "Ukraine": 122, "Sudan": 24, ... }` |
| POST   | `/api/conflicts/ingest`       | Manual trigger for ACLED CSV ingestion                   | `{ success, totalParsed, mongoInserted, ... }` |
| GET    | `/api/conflicts/scheduler-status`| Scheduler health check                                | `{ scheduled, schedule, lastRun, lastResult }` |
| GET    | `/api/news/:category`         | Category news feed (global, tech, market, space, climate) | `{ category, items[] }` with title, url, source, pubDate |
| GET    | `/api/news/local?countryCode=XX` | Local news by ISO 3166-1 alpha-2 country code         | `{ category: 'local', countryCode, items[] }` |
| GET    | `/api/osint-feed`             | Nitter/X OSINT posts from 6 monitored accounts          | `{ posts[] }` with account, text, images, videos, links, created_at |
| GET    | `/api/datasets/:name`         | Serve any JSON file from `datasets/` folder              | Raw JSON content                                     |
| GET    | `/api/health`                 | Backend health check                                     | `{ status, cached_flights, mongodb, conflict_scheduler, ... }` |

### 3.8. WebSocket Feed

- **Port:** Same as HTTP (default `4000`).
- **Broadcast interval:** Every **5 seconds**.
- **Payload event:** `globalSignals`.
- **Pipeline:**
  1. Gathers all cached OSINT events.
  2. Runs `AnomalyDetector` and appends anomalies.
  3. **Event Merging** — correlates earthquake + news, multi-source protests, disaster + weather.
  4. **Explosion Detection** — shallow (< 10 km depth), high magnitude (≥ 5.0), clustered earthquakes → `possibleExplosion`.
  5. **Priority sorting** — explosions > anomalies/conflicts > disasters > base severity.
  6. **Clamps** to top 10 events.
  7. **Deduplication** — only broadcasts if the payload hash changed.

---

### 3.9. Server Boot Sequence

The server uses an async IIFE boot pattern:

```
1. Connect MongoDB (graceful — server works without it)
2. Wire MongoDB reference into ACLEDProvider
3. Start ConflictScheduler (weekly cron + startup check)
4. Start Express server
5. Start AISStreamProvider (marine WebSocket or simulation)
6. Start all OSINT providers on their intervals
7. Start CategoryNewsProvider (5-min RSS polling)
8. Start NitterOSINTProvider (5-min Nitter scraping)
9. Begin WebSocket signal broadcasting (every 5s)
```

---

### 3.10. Static Datasets (`datasets/`)

| File                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `personal_zone_data.json`| Country-level data: disputed borders, military ranks, emergency numbers, population. |
| `conflictRegistry.json` | Known conflict zones with actors, regions, and metadata.   |
| `acled_mock.json`       | Fallback ACLED conflict data.                              |
| `gdelt_mock.json`       | Fallback GDELT news data.                                  |
| `airports.json`         | Curated airport list for strategic infrastructure display.  |
| `global-ports.json`     | Major global shipping ports.                                |
| `military-bases.json`   | Known military installations worldwide.                     |
| `submarine-cables.json` | Undersea telecommunications cable endpoints.                |
| `oil-pipelines.json`    | Critical energy infrastructure pipeline routes.             |

### 3.11. Raw Data Files (`data/`)

| File           | Source        | Purpose                                               |
| -------------- | ------------- | ----------------------------------------------------- |
| `airports.dat` | OpenFlights   | 7,000+ airports with IATA codes and coordinates.      |
| `routes.dat`   | OpenFlights   | 67,000+ airline routes for the SimulatedProvider.      |

---

## 4. Frontend — `GeoRadarFE`

| Item             | Detail                                                        |
| ---------------- | ------------------------------------------------------------- |
| Framework        | React 19 + Vite 7                                             |
| Styling          | Tailwind CSS 4 + inline `<style>` blocks for HUD components  |
| 3D Map           | MapLibre GL JS (globe projection, switchable Dark/Satellite/Night styles) |
| Entry point      | `src/main.jsx` → `App.jsx`                                    |
| Start command    | `npm run dev`                                                 |
| Build command    | `npm run build` (Vite production build)                       |

### 4.1. Dependencies

| Package                 | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `react` + `react-dom`   | UI framework                                      |
| `react-router-dom`      | Client-side routing (6 pages)                     |
| `cesium`                | CesiumJS 3D engine (installed but currently Globe uses MapLibre) |
| `maplibre-gl`           | MapLibre GL JS for 3D globe rendering             |
| `tailwindcss`           | Utility-first CSS framework                       |
| `@tailwindcss/vite`     | Vite plugin for Tailwind                          |
| `vite-plugin-cesium-build` | Vite plugin for Cesium asset handling          |

### 4.2. Vite Configuration

```javascript
plugins: [react(), tailwindcss(), cesium()]
```

### 4.3. Design System & Theme

- **Background:** Pure black `#000` / dark grey `#111` / `rgba(0,0,0,0.72)` panels.
- **Fonts:** `'Orbitron'` (titles/headings), `'Share Tech Mono'` (body/data).
- **Color palette:**
  - Cyan `#00c8ff` — info, stable indicators
  - Red `#ff3232` — critical, conflicts, explosions
  - Orange `#e67e22` — warnings, borders, logo accent
  - Green `#00ff88` / `#22c55e` — safe, de-escalations, protests
  - Yellow/Amber `#ffaa00` / `#eab308` — elevated warnings, riots
  - Purple `#a050ff` — special panels (Live Intel, Human Impact, private flights)
- **Panel styling:** Every panel uses `.hud-panel` with corner bracket decorators (`.hud-corner.tl`, `.tr`, `.bl`, `.br`), `backdrop-filter: blur(4px)`, and monospace typography.

### 4.4. Routing & Pages

| Route       | Page Component | Description                                       |
| ----------- | -------------- | ------------------------------------------------- |
| `/`         | `Home.jsx`     | **Main command center** — Globe + all HUD panels  |
| `/trade`    | `Trade.jsx`    | Globe only (placeholder for trade features)       |
| `/markets`  | `Market.jsx`   | Globe only (placeholder for market features)      |
| `/tech`     | `Tech.jsx`     | Globe only (placeholder for tech features)        |
| `/space`    | `space.jsx`    | Globe + `SpaceLayer` (ISS tracker + orbit ring)   |
| `/climate`  | `Climate.jsx`  | Globe only (placeholder for climate features)     |

**Navigation:** The `Navbar.jsx` component renders a tactical HUD-style navigation bar with hover effects and a route indicator.

### 4.5. Core Visual Components (`src/components/`)

#### Globe (`Globe.jsx`)

- **Library:** MapLibre GL JS with globe projection.
- **Map styles:** MapTiler tiles (`api.maptiler.com`) — switchable between Dark Matter, Satellite, and Night. Style switching via `mapLayerChange` CustomEvent.
- **Features:**
  - Orange country borders and click-to-highlight (golden fill + border).
  - Conflict country highlighting — `conflict-country-fill` + `conflict-country-border` layers using feature state (`conflict: true/false`).
  - Auto-rotation (slow 180° spin over 120s on load, stops on mousedown/wheel/touchstart).
  - `MapContext` React context to share `{ instance, styleKey }` with child layer components.
  - Exports `useMap()` hook for child components.
  - Responds to `focusGlobe` custom events (from ExplosionPanel click-to-focus).
  - Responds to `flyToLocation` custom events (from ConflictPanel conflict-item click).
  - Responds to `mapLayerChange` events — saves camera → unmounts children → `setStyle()` → rebuilds base layers → restores camera → remounts children with new `styleKey`.
  - Responds to `mapTiltChange` events — pitches map to 60° (tilted) or 0° (flat) via `easeTo`.
  - Per-style fog configurations: Dark (black), Satellite (dark blue haze), Night (deep space blue with high star intensity).
  - HUD cyberpunk background drawn on canvas (concentric ring arcs, crosshair lines, tick marks, radial spokes, corner brackets, vignette gradient, animated dust particles).
  - Globe halo CSS radial gradient overlay (orange/blue/transparent).
  - rAF-throttled coordinate readout on mouse move.

#### AviationLayer (`AviationLayer.jsx`)

- **Consumes:** `useMap()` from Globe.
- **Data source:** Polls `GET /api/flights` every 20 seconds.
- **Rendering:**
  - Converts flights to GeoJSON and renders them as MapLibre symbol layers.
  - Custom canvas-drawn plane icons per category (color-coded: cyan/orange/red/purple/yellow/grey).
  - Mouse hover → plane icon scales up (1.5×).
  - Click → popup with flight details (callsign, ICAO, country, altitude, speed, heading, position) + connecting line from popup to aircraft.
  - Client-side position interpolation for smooth movement between API polls.
- **Aviation Monitor:** A collapsible floating HUD widget (bottom-center) showing real-time flight stats (total, per-category counts, live indicator).

#### ConflictLayer (`ConflictLayer.jsx`) — Added in v0.3, Updated v0.6

- **Consumes:** `useMap()` from Globe.
- **Data source:** Polls `GET /api/conflicts` and `GET /api/conflict-summary` every 60 seconds.
- **Rendering:**
  - GeoJSON source with **MapLibre clustering** (`cluster: true`, `clusterMaxZoom: 10`). Aggregates `maxSeverity` and `totalFatalities`.
  - Cluster circles colored by maximum severity within the cluster, sized by event count.
  - Click on cluster → zoom to expansion zoom + 1.
  - Individual markers with radius interpolated by fatality count (0→3px, 10→5px, 50→7px, 200→10px).
  - Severity color system: 🟢green → 🟡yellow → 🟠orange → 🔴red.
  - Click on event → detailed popup (type, country, date, actors, fatalities, region, notes) + SVG gradient connecting line.
  - Hover → glow effect on marker.
  - **Country highlighting:** Sets `conflict: true` feature-state on countries source → red fill + glow border. Uses `COUNTRY_NAME_MAP` for ACLED↔GeoJSON name matching. Re-applies on `idle`/`moveend` events (debounced 500ms) for newly loaded tiles.
- **Style:** Matches HUD design system (dark panel, corner brackets, monospace fonts, pulsing dots).
- **Lifecycle:** Conditionally mounted/unmounted by `Home.jsx` based on `panelVis.conflict`.
- **Map visibility:** Also controlled by `globeLayerToggle` event (toggles 6 layer IDs).

#### SpaceLayer (`SpaceLayer.jsx`)

- **Purpose:** ISS satellite tracker with 3D orbit visualization.
- **Data source:** `api.wheretheiss.at` (polls for ISS position).
- **Rendering:** Canvas overlay draws a 3D orbit ring around the globe; satellite icon follows the ISS position.

#### Navbar (`Navbar.jsx`) — Updated v0.6

- Tactical HUD-style navigation bar with 6 route links (Home, Trade, Markets, Tech, Space, Climate).
- Active route indicator with subtle glow effect and orange accent underline.
- **SYS.NAV Toggle:** Centered button with cycling code number (`SYS.NAV // XX`), green/red indicator dots. Click to show/hide nav links with smooth max-height animation.
- **Map Layers Dropdown:** Switches between 3 tile styles (Satellite, Dark Mode, Night SAT). Dispatches `mapLayerChange` CustomEvent → consumed by `Globe.jsx`. Active layer shown with radio-button UI.
- **3D Tilt Button:** Toggles globe pitch between 0° and 60°. Dispatches `mapTiltChange` CustomEvent → consumed by `Globe.jsx`. Active state uses orange accent.
- **Sound Toggle:** Animated sound wave icon (7 bars with staggered animation). Controls global click sound (`click.mp3`) for all interactive elements. Green glow when active.
- **Settings Button (⚙️):** Opens a full-screen modal with:
  - Panel Visibility section grouped into LEFT COLUMN, RIGHT COLUMN, CENTER.
  - HUD-style checkbox toggles with green glow and VISIBLE/HIDDEN status badges.
  - Persisted to `localStorage` via `georadar_panel_settings` key.
  - Dispatches `panelSettingsChange` CustomEvent consumed by `Home.jsx` for conditional panel rendering.
  - Footer shows version: `GEORADAR v0.5 — MORE SETTINGS COMING SOON`.
- **GitHub Button:** White octocat logo + `@rahul3rj` handle linking to GitHub profile.
- **Responsive:** `@media (max-width: 900px)` shrinks link padding/font. `@media (max-width: 640px)` hides brackets and constrains width.

#### MarineLayer (`MarineLayer.jsx`) — Added in v0.4

- **Consumes:** `useMap()` from Globe.
- **Data source:** Polls `GET /api/marine?zoom=X&bbox=W,S,E,N` every 20 seconds. Also polls `GET /api/marine/alerts` for chokepoint congestion alerts.
- **Backend:** `AISStreamProvider.js` connects to AISStream WebSocket for live AIS data, or runs simulation with realistic shipping lanes if no API key is configured.
- **Rendering:**
  - Custom canvas-drawn ship hull icons per vessel type (cargo=cyan, tanker=red, military=purple).
  - Ships rotated to their heading using `icon-rotate` MapLibre property.
  - Click → detailed popup with vessel name, MMSI, type, heading, speed, position, and connecting line.
  - Visibility controlled by `globeLayerToggle` CustomEvent.
- **Marine Monitor Widget:** A collapsible fixed-width (210px) HUD panel at bottom-center-right showing:
  - Live indicator dot + tracked vessel count.
  - Per-type breakdown (cargo, tanker, military) with colored category dots.
  - Chokepoint alerts with severity indicators.
- **Zoom-adaptive API response:** `zoom < 3` → minimal lat/lng/type; `zoom 3-6` → + heading/speed; `zoom 6+` → full detail with MMSI/name.

#### InfrastructureLayers (`InfrastructureLayers.jsx`) — Added in v0.4

- **Consumes:** `useMap()` from Globe.
- **Purpose:** 8 static GeoJSON overlay layers with real-world data, rendered as MapLibre sources/layers.
- **Layer Types:**

| Layer ID      | Emoji | Render Type | Count | Description |
|---------------|-------|-------------|-------|-------------|
| `nuclear`     | ☢️    | Point (circle + emoji) | 15 | Nuclear reactor/enrichment sites worldwide |
| `military`    | 🪖    | Point (circle + emoji) | 15 | Military bases (US, Russian, Chinese, etc.) |
| `notams`      | 📡    | Point (circle + emoji) | 10 | NOTAM restriction zones |
| `chokepoints` | 🚧    | Point (circle + emoji) | 7  | Maritime chokepoints (Hormuz, Suez, Malacca, etc.) |
| `pipelines`   | 🛢️    | LineString  | 7  | Major oil/gas pipeline routes |
| `cables`      | 🌐    | LineString  | 7  | Submarine internet cable routes |
| `datacenters` | 🖥️    | Point (circle + emoji) | 10 | Major hyperscaler data centers (AWS, Google, Azure) |
| `launch`      | 🚀    | Point (circle + emoji) | 10 | Global rocket launch sites |

- **Interaction:** Click any marker → HUD-style popup with detailed info (name, country, status, type-specific fields).
- **Visibility:** Controlled by `globeLayerToggle` CustomEvent from `GlobeLayersPanel`.
- **Default active:** aviation, marine, conflict, military, nuclear, notams, chokepoints.

### 4.6. Dashboard Panels (`src/components/panels/`)

All panels follow the `.hud-panel` design system with corner decorators.

#### Left Column (Home page)

| Panel                    | File                      | Data Source                    | Poll Rate   | Description                                                                 |
| ------------------------ | ------------------------- | ------------------------------ | ----------- | --------------------------------------------------------------------------- |
| **Active Conflict Monitor** | `ConflictPanel.jsx`     | `GET /api/conflict-status`     | 60s         | Conflict count, escalations/de-escalations, clickable conflict region list (dispatches `flyToLocation` → globe flies to location), Global Stability Index animated spinner, trend, alert level. Sound effects on hover (`hover.ogg`) and click (`click.mp3`). Text truncation on long region names. |
| **Military Ranking**     | `MilitaryRankingPanel.jsx`| Static data (hardcoded)        | —           | Top 10 military powers (USA, Russia, China, etc.) with GFP scores. SVG sparkline chart + tabbed grid/chart views. |
| **Global Signal Feed**   | `SignalFeedPanel.jsx`     | WebSocket `ws://localhost:4000`| Real-time   | Direct WebSocket connection with auto-reconnect (exponential backoff 1s→30s). Displays top 20 merged intelligence signals with severity-colored bullets and timestamps. Dispatches `severeEarthquake` CustomEvent for M5.0+ quakes. |

#### Right Column (Home page)

| Panel                | File                      | Data Source                              | Poll Rate | Description                                                                                                      |
| -------------------- | ------------------------- | ---------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| **Personal Zone**    | `PersonalZonePanel.jsx`   | Browser Geolocation → `GET /api/zone-status` + `GET /api/datasets/personal_zone_data` + Open-Meteo | 60s | User-localized risk assessment. Uses browser geolocation, fetches zone level (Green/Yellow/Red), country-specific data (disputed borders, military rank, emergency numbers), live weather. |
| **Live Intel**       | `LiveIntelPanel.jsx`      | YouTube iframes                          | —         | 3 tabs: News (6 streams), World Cameras (5 streams), Disaster Feeds (3 streams). Dropdown source selector per tab. Muted autoplay. |
| **Human Impact**     | `HumanImpactPanel.jsx`    | `GET /api/human-impact`                  | 30s       | Conflict casualties (24H from ACLED), disaster casualties (GDACS RSS), active sirens (NOAA + weather + conflicts + emergency squawks), humanitarian alerts (GDACS RSS). Includes spinning 3D human anatomy video (`/Human3D.mp4`). |
| **Explosion Alert**  | `ExplosionPanel.jsx`      | `severeEarthquake` CustomEvent           | Event-driven| **Hidden by default.** Appears only when a severe seismic event (M5.0+) is detected. Click-to-focus globe on the epicenter coordinates. |

#### Globe Layer Controls

| Panel               | File                      | Description                                                            |
|----------------------|---------------------------|------------------------------------------------------------------------|
| **Globe Layers**     | `GlobeLayersPanel.jsx`    | Toggle panel for 14 globe layers: aviation, marine, conflict, military, nuclear, notams, chokepoints, pipelines, cables, datacenters, satellites, launch, weather, disasters. Scrollable list with HUD toggles. Dispatches `globeLayerToggle` CustomEvent. Default active: aviation, marine, conflict, military, nuclear, notams, chokepoints. |

#### Details Panel (Scroll-reveal) — Updated v0.6

| Panel               | File                      | Description                                                            |
|----------------------|---------------------------|------------------------------------------------------------------------|
| **Details Panel (Strategic Command Center)** | `DetailsPanel.jsx` | Full-screen details view that slides up when scrolling on side panels. Contains the Strategic Command Center with a 12-column grid layout: |

**Strategic Overview Tab (active):**
- **Row 1:** Global Threat Assessment (animated threat meter bar + conflict count/escalations/de-escalations/stability index) | Regional Breakdown (clickable conflict region list with severity dots)
- **Row 2:** Global News feed | Local News feed (auto-detects user country via Nominatim reverse geocoding) | OSINT X Feed (Nitter posts with `@account` handle, text, media badges)
- **Row 3:** Tech | Market | Space | Climate/Disaster news feeds

**Data Sources:**
- `/api/conflict-status` → threat assessment + regional breakdown (60s poll)
- `/api/news/:category` → 5 category news feeds (60s poll)
- `/api/news/local?countryCode=XX` → local news by geolocation (60s poll)
- `/api/osint-feed` → Nitter OSINT posts (60s poll)

**Future tabs (hidden/commented out):** CONFLICT ANALYSIS, FORCE DISPOSITION, INTELLIGENCE BRIEF

**OSINT X Feed card features:** Red left-border accent, `@account` handle in red Orbitron font, post text (3-line clamp), `[N IMG]`/`[N VID]` media badges with cyan border, time-ago stamps (NOW, Xm, Xh, Xd).

#### Floating Components

| Component           | Location                    | Description                                                             |
| ------------------- | --------------------------- | ----------------------------------------------------------------------- |
| **Aviation Monitor**| Bottom-center-left (inside `AviationLayer.jsx`) | Flight statistics widget: total count, per-category breakdown, live indicator. Collapsible. Fixed 210px width. |
| **Marine Monitor**  | Bottom-center-right (inside `MarineLayer.jsx`) | Vessel statistics widget: tracked vessel count, cargo/tanker/military breakdown, chokepoint alerts. Collapsible. Fixed 210px width. |

### 4.7. Home Page Scroll/Layer Architecture

The Home page uses a **three-layer z-index system** for scroll interactions:

```
Layer 1 (z-1)  — Globe (full-screen, receives mouse/wheel events in center)
                  Contains: AviationLayer, ConflictLayer, MarineLayer, InfrastructureLayers
Layer 2 (z-5)  — Side Panels (left/right columns, scroll-to-reveal details)
                  Left: ConflictPanel, MilitaryRankingPanel, SignalFeedPanel
                  Right: PersonalZonePanel, LiveIntelPanel, HumanImpactPanel, GlobeLayersPanel
                  Center-bottom: ExplosionPanel
Layer 3 (z-30) — Details Panel (slides up from bottom on panel scroll)
```

**Panel vs Layer visibility:** Aviation and Marine components always render (never unmounted). Settings toggles control only the monitor panel UI via `showPanel` prop. Globe Layers panel toggles control the map layer visibility separately via `globeLayerToggle` events. Aviation Monitor and Marine Monitor panels are **hidden by default** for first-time users. **Exception:** ConflictLayer is conditionally mounted/unmounted by `panelVis.conflict` — toggling Conflict panel in Settings removes both the panel and map layer.

- Scrolling on **panels** triggers a smooth lerp animation that slides panels up and reveals the Details Panel.
- Scrolling on the **globe center** passes through to MapLibre for zoom/rotate.
- Smooth progress-based transforms control panel opacity, scale, and position.

### 4.8. Application Shell (`App.jsx`) — Updated v1.0

- **MobileBlocker:** Full-screen blocker overlay for mobile devices (≤768px width + touch). Blurred backdrop, red warning icon with pulsing ring, "ACCESS RESTRICTED" header, device specs table. Users cannot dismiss — must switch to desktop. Z-index 99999.
- **HudLogo:** Fixed top-left logo with `GEORADAR` + `TACTICAL SYS` branding, corner brackets, and orange glow effects. Links to `/`.
- **Router:** `BrowserRouter` with 6 routes.

### 4.9. Global CSS (`index.css`)

```css
@import "tailwindcss";        /* Tailwind CSS base import */
* { margin:0; padding:0; box-sizing:border-box; }
html, body { background-color: #000; overflow: hidden; }
```

**HUD CSS classes** (defined in `Home.jsx` `<style>` block):
- `.hud-panel` — Base panel styling (dark bg, border, blur, monospace font)
- `.hud-corner` + `.tl/.tr/.bl/.br` — Tactical corner decorators
- `.hud-header` / `.hud-dot` / `.hud-title` — Panel header with pulsing dot
- `.hud-divider` — Thin horizontal separator
- `.hud-row` / `.hud-label` / `.hud-val` — Key/value data rows
- `.hud-feed-container` / `.hud-feed-item` / `.hud-feed-bullet` / `.hud-feed-text` — Signal feed items
- `.hud-tabs` / `.hud-tab` — Tab switcher with active state
- Custom scrollbar styling (dark track, subtle thumb)

### 4.10. Public Assets (`public/`)

| File            | Purpose                                |
| --------------- | -------------------------------------- |
| `Logo.png`      | GeoRadar logo (used as favicon)        |
| `Logo_wide.png` | Wide logo for the HUD branding element |
| `Human3D.mp4`   | 3D human anatomy loop video            |
| `hover.ogg`     | HUD hover sound effect (ConflictPanel) |
| `click.mp3`     | HUD click sound effect (global, toggleable via Navbar Sound toggle) |

---

## 5. Data Flow Diagrams

### Aviation Data Pipeline

```
ADSBLolProvider ─┐
OpenSkyProvider ──┤  (Waterfall)  ──► filterFlights() ──► cache ──► GET /api/flights ──► AviationLayer.jsx
SimulatedProvider ┘                    └── padding ──────────┘
```

### OSINT Signal Pipeline

```
EarthquakeProvider ──┐
WeatherProvider ─────┤
WildfireProvider ────┤
ACLEDProvider ───────┤  getEvents() ──► broadcastSignals() ──► Merge ──► Anomaly ──► Priority Sort
RSSNewsProvider ─────┤                                          └── Explosion Detection ──┘
DisasterAlertProvider┤                                                          │
InternetOutageProvider┤                                                     Top 10 events
AISProvider ─────────┤                                                          │
ConflictProvider ────┘                                                  WebSocket broadcast
                                                                               │
                                                                       SignalFeedPanel.jsx
```

**Note:** `GDELTProvider` is legacy and no longer imported. `CategoryNewsProvider` and `NitterOSINTProvider` are standalone — they do NOT participate in the `broadcastSignals` pipeline.

### Category News + OSINT Feed Pipeline (Added in v0.6)

```
BBC/NYT/TechCrunch/CNBC/NASA/etc. RSS ──► CategoryNewsProvider ──► /api/news/:category
Google News RSS (per country)         ──┘                      └──► /api/news/local

xcancel.com (6 OSINT accounts) ──► NitterOSINTProvider ──► MongoDB (osint_posts) ──► /api/osint-feed
                                                                                         │
                                                                                  DetailsPanel.jsx
                                                                                  (Strategic Command Center)
```

### Conflict Data Pipeline (Added in v0.3)

```
ACLED CSV Export ──► ACLEDIngestor ──► MongoDB (conflict_events)
                          │                   │
                   ConflictScheduler    ┌─────┴──────┐
                   (Mon 6AM cron)       │            │
                                  /api/conflicts  /api/conflict-summary
                                        │            │
                                  ConflictLayer.jsx  (Country scores)
                                  (Map markers)
```

### Marine Traffic Pipeline (Added in v0.4)

```
AISStream WebSocket (wss://stream.aisstream.io)  ──► AISStreamProvider ──► vessel cache
  OR Simulation (if no API key)                            │             │
                                                    /api/marine    /api/marine/alerts
                                                         │              │
                                                   MarineLayer.jsx  (Chokepoint alerts)
                                                   (Ship markers)
```

### Custom Event Bus (Inter-Component Communication)

```
Navbar Settings ──(panelSettingsChange)──► Home.jsx (conditional panel rendering)
Navbar Map Layers ──(mapLayerChange)──► Globe.jsx (style switching)
Navbar 3D Toggle ──(mapTiltChange)──► Globe.jsx (pitch 0°/60°)
GlobeLayersPanel ──(globeLayerToggle)──► AviationLayer, MarineLayer, ConflictLayer, InfrastructureLayers
SignalFeedPanel ──(severeEarthquake)──► ExplosionPanel
ExplosionPanel ──(focusGlobe)──► Globe.jsx (camera fly-to)
ConflictPanel ──(flyToLocation)──► Globe.jsx (camera fly-to conflict location)
```

### ACLEDProvider Waterfall

```
MongoDB ──► ACLED API ──► CSV File ──► JSON Cache ──► Mock Data
  (1st)       (2nd)        (3rd)         (4th)          (5th)
```

### Personal Zone Pipeline

```
Browser Geolocation ──► fetch('/api/zone-status?lat=X&lon=Y') ──► ZoneEngine ──► zone level
                   └──► fetch('/api/datasets/personal_zone_data') ──► country info
                   └──► fetch(Open-Meteo) ──► live weather ──► PersonalZonePanel.jsx
```

---

## 6. MongoDB Schema

### Collection: `conflict_events`

```javascript
{
  event_id: String,          // Unique (ACLED event_id_cnty or data_id)
  event_id_cnty: String,
  data_id: String,
  iso: Number,               // Country ISO code
  event_date: String,        // "YYYY-MM-DD"
  year: Number,
  time_precision: Number,
  disorder_type: String,
  event_type: String,        // "Battles", "Riots", "Protests", etc.
  sub_event_type: String,
  actor1: String,
  assoc_actor_1: String,
  inter1: Number,
  actor2: String,
  assoc_actor_2: String,
  inter2: Number,
  interaction: Number,
  civilian_targeting: String,
  country: String,
  region: String,
  admin1: String,
  admin2: String,
  admin3: String,
  location: String,
  latitude: Number,
  longitude: Number,
  geo_precision: Number,
  source: String,
  source_scale: String,
  notes: String,
  fatalities: Number,
  tags: String,
  timestamp: Number,         // Unix ms
  ingested_at: String,       // ISO datetime
  severity: String           // "low" | "medium" | "high" | "critical"
}
```

### Indexes (conflict_events)

| Index | Type |
|-------|------|
| `event_id` | Unique, sparse |
| `event_date` | Descending |
| `country` | Ascending |
| `latitude, longitude` | Compound |
| `event_type` | Ascending |

### Collection: `osint_posts` (Added in v0.6)

```javascript
{
  post_id: String,           // Unique (xcancel post identifier)
  account: String,           // e.g. "sentdefender", "WarMonitor3"
  text: String,              // Post content (max 500 chars)
  source_url: String,        // Original xcancel URL
  images: [String],          // Array of image URLs
  videos: [String],          // Array of video URLs
  external_links: [String],  // Array of linked URLs
  is_retweet: Boolean,       // Whether the post is a retweet
  engagement: {              // Engagement metrics
    replies: Number,
    retweets: Number,
    likes: Number
  },
  created_at: Date,          // Publication timestamp
  scraped_at: Date           // When the post was scraped
}
```

- **FIFO cap:** Max 30 posts per account. Old posts are purged on each scrape cycle.
- **Upsert strategy:** Uses `updateOne` with `$setOnInsert` keyed on `post_id` to avoid duplicates.
- **Fallback:** If no MongoDB connection, posts are stored in an in-memory array.

---

## 7. Security & Rate-Limit Protocols

1. **No direct client-to-API calls** for OSINT/aviation. All requests are proxied through the backend.
2. **Per-provider cooldown** — 10-minute cooldown on rate limit (HTTP 429) or server error.
3. **Internal caching** — every provider maintains `this.cachedData` / `this.cache` and a TTL-based refresh strategy.
4. **Mock/fallback data** — ACLED providers fall back to local JSON mock files if the API is unavailable.
5. **WebSocket deduplication** — The broadcast only sends if the payload hash changed, preventing duplicate signals.
6. **Human Impact endpoint** — 5-minute cache to protect ACLED + GDACS from excessive polling.
7. **MongoDB dedup** — Conflict events are upserted by `event_id`; OSINT posts by `post_id` to prevent duplicates.
8. **Performance limits** — `/api/conflicts` defaults to last 30 days with max 2000 events; map uses marker clustering.
9. **Nitter scraping** — Uses 15-second fetch timeout, User-Agent header; xcancel.com (Nitter frontend) is fragile and may return 429 or change HTML structure.

---

## 8. Running the Project

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **MongoDB** ≥ 6 (optional — system works without it using file-based fallback)

### Backend

```bash
cd GeoRadarBE
npm install
npm run dev          # Starts on port 4000 with --watch
```

### Frontend

```bash
cd GeoRadarFE
npm install
npm run dev          # Starts Vite dev server (usually port 5173)
```

### Loading ACLED Data

```bash
# 1. Download weekly CSV from ACLED Data Export Tool (https://acleddata.com/data-export-tool/)
# 2. Save as datasets/acled_latest.csv
# 3. Trigger ingestion:
curl -X POST http://localhost:4000/api/conflicts/ingest
# OR wait for Monday 6 AM auto-run
```

### Production Build (Frontend)

```bash
cd GeoRadarFE
npm run build        # Outputs to dist/
npm run preview      # Preview production build locally
```

---

## 9. Known Limitations & Future Work

-   **Trade, Markets, Tech, Climate pages** are currently **placeholder stubs** (Globe only, no panels).
-   **Space page** is partially built (ISS tracker + orbit ring visualization).
-   `AISProvider` and `InternetOutageProvider` use **simulated data** (no real API).
-   **`GDELTProvider`** is a legacy file — no longer imported in `server.js`. It has been superseded by `CategoryNewsProvider` + `NitterOSINTProvider`.
-   **ACLED API access** was not granted — system relies on manual CSV downloads or mock data.
-   **Cesium is installed** but the Globe currently uses **MapLibre GL** — Cesium is partially used for the build plugin only.
-   **Nitter/xcancel scraping** is fragile — rate limits (HTTP 429) and HTML structure changes can break the `NitterOSINTProvider` parser.
-   **DetailsPanel** has 3 tabs commented out (CONFLICT ANALYSIS, FORCE DISPOSITION, INTELLIGENCE BRIEF) — planned for future.

### Future OSINT Sources (Modular Architecture Ready)

The provider pattern makes it easy to add new data sources:

| Source | Purpose | Status |
|--------|---------|--------|
| CategoryNews (RSS) | Multi-category news aggregation | ✅ Active (v0.6) |
| Nitter OSINT | Social media intelligence | ✅ Active (v0.6) |
| NASA FIRMS | Real-time wildfire data | ✅ Active |
| ADS-B aircraft tracking | Live flight data | ✅ Active |
| Maritime AIS | Ship tracking | ✅ Active (live + simulation) |
| GDELT v2 | Global event database | ⚠️ Legacy (superseded) |
| Starlink/Satellite | Space awareness | 📋 Planned |

---

## 10. Changelog

### v1.0 (2026-03-14) — Current Release
- **NEW:** `MobileBlocker.jsx` — Full-screen blocker for mobile devices (≤768px + touch). Blurred backdrop, red warning icon, pulsing ring, device specs. Prevents mobile access entirely.
- **NEW:** Global Stability Index redesigned as **5-component weighted composite**: Conflict Severity (max 40, diminishing returns), Active Sirens (max 15, NEW), Fatality Weight (max 20, logarithmic), Geographic Spread (max 10), Escalation Momentum (max 15)
- **NEW:** `getActiveSirenCount()` shared helper in `server.js` — siren count passed to `ConflictEngine.analyze()` for integration into stability calculation
- **NEW:** `SignalFeedPanel.jsx` — WebSocket auto-reconnect with exponential backoff (1s→2s→4s, max 30s)
- **FIX:** "An image named X already exists" console errors in AviationLayer and MarineLayer — wrapped `addImage()` in try-catch for style-switch race conditions
- **FIX:** "Encountered two children with same key" in SignalFeedPanel — keys now use `${item.id}-${idx}` for uniqueness
- **FIX:** DetailsPanel — Added AbortController cleanup to fetch effects, cached geolocation in localStorage
- **FIX:** PersonalZonePanel — Cached Nominatim reverse geocoding in localStorage with 1-hour TTL
- **FIX:** ConflictPanel — Added AbortController for fetch requests
- **FIX:** ConflictLayer — Expanded COUNTRY_NAME_MAP from 26 to 56 entries for better GeoJSON matching
- **FIX:** NitterOSINTProvider — Added HTML structure validation, failure tracking, timeout logging
- **FIX:** CategoryNewsProvider — Added per-category feed health logging
- **UPDATED:** Documentation promoted to v1.0

### v0.6 (2026-03-14)
- **NEW:** `CategoryNewsProvider` — Multi-category RSS news aggregation (global, tech, market, space, climate + local by country code via Google News)
- **NEW:** `NitterOSINTProvider` — xcancel.com OSINT social media scraping from 6 accounts (`@sentdefender`, `@WarMonitor3`, `@OSINTtechnical`, `@AuroraIntel`, `@IntelCrab`, `@CalibreObscura`) with MongoDB `osint_posts` collection
- **NEW:** `/api/news/:category` + `/api/news/local?countryCode=XX` + `/api/osint-feed` REST API endpoints
- **NEW:** `DetailsPanel.jsx` — Complete rewrite as Strategic Command Center with 12-column grid: threat assessment, regional breakdown, 5 category news feeds, local news (auto-detected country via Nominatim), OSINT X feed with media badges
- **NEW:** `Navbar.jsx` — Map Layers dropdown (Satellite/Dark/Night), 3D Tilt toggle, Sound wave toggle animation, SYS.NAV collapsible nav links
- **NEW:** `Globe.jsx` — Map style switching via `mapLayerChange` event (saves/restores camera, remounts children); tilt handler via `mapTiltChange` event; `flyToLocation` event handler; per-style fog configurations; auto-rotation (180° over 120s); globe halo CSS overlay
- **NEW:** `ConflictPanel.jsx` — Click-to-fly interaction dispatches `flyToLocation` to globe; sound effects (`hover.ogg` + `click.mp3`)
- **NEW:** `ConflictLayer.jsx` — Country highlighting via feature-state on countries GeoJSON source with ACLED↔GeoJSON name normalization; debounced reapplication on tile loads
- **NEW:** Sound effects system — Global click sound + hover sound, toggleable via Navbar Sound toggle
- **UPDATED:** MongoDB now has 2 collections: `conflict_events` + `osint_posts`
- **UPDATED:** `GDELTProvider` is legacy — no longer imported in `server.js`; functionality superseded by `CategoryNewsProvider`
- **UPDATED:** `context.md` and `GeoRadar_Documentation.md` comprehensively rewritten with all new features

### v0.5 (2026-03-13)
- **NEW:** Panel/Layer visibility separation — Aviation & Marine layers always render on globe; only monitor panel UIs toggled by Settings
- **NEW:** `AviationLayer.jsx` accepts `showPanel` prop and listens for `globeLayerToggle` events for map layer toggle
- **NEW:** `MarineLayer.jsx` accepts `showPanel` prop for independent panel UI control
- **NEW:** Aviation Monitor and Marine Monitor panels hidden by default for first-time users
- **NEW:** Responsive laptop layout — CSS media queries in `Home.jsx` for ≤1600px and ≤1366px breakpoints
- **NEW:** Conflict region text truncation with `text-overflow: ellipsis` in `ConflictPanel.jsx`
- **UPDATED:** All panels use `width: 100%` instead of hardcoded pixel widths for responsiveness
- **UPDATED:** MilitaryRankingPanel SVG uses `viewBox` + `width: 100%` for responsive scaling
- **UPDATED:** Left column width at laptop breakpoint: 360px (fits conflict names like "Israel vs Hezbollah" on one line)
- **UPDATED:** Nested scroll priority — panels scroll internally before triggering details page transition

### v0.4 (2026-03-12)
- **NEW:** `MarineLayer.jsx` — Real-time vessel tracking with canvas-drawn ship icons, heading rotation, Marine Monitor widget, vessel popups, chokepoint alerts
- **NEW:** `AISStreamProvider.js` — AISStream WebSocket provider for live AIS vessel data with simulation fallback on missing API key
- **NEW:** `InfrastructureLayers.jsx` — 8 static GeoJSON overlay layers (nuclear sites, military bases, NOTAMs, chokepoints, pipelines, submarine cables, data centers, launch sites) with real-world data and interactive popups
- **NEW:** `/api/marine` endpoint — zoom-adaptive vessel position data (minimal at low zoom, full detail at high zoom)
- **NEW:** `/api/marine/alerts` endpoint — maritime chokepoint congestion alerts
- **NEW:** Settings modal in `Navbar.jsx` — panel visibility toggles with localStorage persistence, dispatches `panelSettingsChange` CustomEvent
- **NEW:** GitHub button in Navbar — white octocat icon linking to repository
- **NEW:** Centered `SYS.NAV // XX` code display in Navbar
- **UPDATED:** `Navbar.jsx` — Full rewrite with Settings modal, GitHub link, responsive breakpoints (900px/640px)
- **UPDATED:** `GlobeLayersPanel.jsx` — Now controls 14 layers (aviation, marine, conflict + 8 infrastructure layers + 3 planned)
- **REMOVED:** Private planes from AviationLayer (filtered out of GeoJSON, stats, icon categories)

### v0.3 (2026-03-11)
- **NEW:** ACLED weekly CSV ingestion pipeline (ACLEDIngestor + ConflictScheduler)
- **NEW:** MongoDB integration (`db/mongo.js`) with `conflict_events` collection
- **NEW:** `/api/conflicts` endpoint — returns map markers with severity classification
- **NEW:** `/api/conflict-summary` endpoint — per-country intensity scores
- **NEW:** `/api/conflicts/ingest` endpoint — manual CSV ingestion trigger
- **NEW:** `/api/conflicts/scheduler-status` endpoint — scheduler health check
- **NEW:** `ConflictLayer.jsx` — MapLibre conflict markers with clustering, severity colors, popups
- **NEW:** `GlobeLayersPanel.jsx` — Globe infrastructure layer toggles
- **NEW:** `DetailsPanel.jsx` — Scroll-reveal full details view with tabs
- **UPDATED:** `ACLEDProvider.js` — Added MongoDB as primary data source in waterfall
- **UPDATED:** `server.js` — Async boot sequence with MongoDB + scheduler + 4 new API routes
- **UPDATED:** `Home.jsx` — Three-layer z-index scroll system, ConflictLayer integration
- **UPDATED:** `.env` — Added MONGODB_URI and MONGODB_DB
- **UPDATED:** `package.json` — Added `mongodb` and `node-cron` dependencies

### v0.2 (2026-03-10)
- Three-layer z-index scroll system for panels/globe/details
- DetailsPanel with Force Disposition, Timeline, Strategic Overview tabs
- GlobeLayersPanel for infrastructure toggles
- Personal Zone enhancements (geolocation, country data, weather)

### v0.1 (Initial)
- Core aviation monitoring (waterfall providers)
- OSINT signal pipeline (12+ providers)
- Globe visualization with AviationLayer
- HUD dashboard panels

---

## End of Document
