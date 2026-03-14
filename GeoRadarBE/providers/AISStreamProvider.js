import WebSocket from 'ws';

/* ═══════════════════════════════════════════════════════
   AISStream Real-Time Marine Traffic Provider
   
   Connects to AISStream WebSocket for live AIS vessel data.
   Falls back to realistic simulated shipping-lane data
   if no API key is configured.
   ═══════════════════════════════════════════════════════ */

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const DEDUP_INTERVAL_MS = 10_000;    // 10 seconds per MMSI
const TTL_MS = 5 * 60 * 1000;       // 5-minute vessel TTL
const CLEANUP_INTERVAL = 30_000;     // 30s cleanup sweep
const MAX_VESSELS = 15_000;          // Hard cap in memory
const RECONNECT_BASE_MS = 5_000;     // Initial reconnect delay
const RECONNECT_MAX_MS = 60_000;     // Max reconnect delay
const SIM_VESSEL_COUNT = 450;        // Simulated vessels when no API key
const SIM_UPDATE_INTERVAL = 15_000;  // 15s simulation updates

/* ═══ AIS Ship Type Classification ═══ */
function classifyShipType(typeCode) {
    if (typeCode >= 70 && typeCode <= 79) return 'cargo';
    if (typeCode >= 80 && typeCode <= 89) return 'tanker';
    if (typeCode === 35) return 'military';
    return null; // Not tracked
}

/* ═══ Chokepoint Definitions ═══ */
const CHOKEPOINTS = [
    { name: 'Strait of Hormuz',   lat: 26.56, lng: 56.25, radius: 80 },
    { name: 'Suez Canal',         lat: 30.46, lng: 32.35, radius: 50 },
    { name: 'Strait of Malacca',  lat: 2.50,  lng: 101.40, radius: 100 },
    { name: 'Panama Canal',       lat: 9.10,  lng: -79.68, radius: 50 },
    { name: 'Bab el-Mandeb',      lat: 12.58, lng: 43.33, radius: 60 },
];

/* ═══ Major Shipping Lanes for Simulation ═══ */
const SHIPPING_LANES = [
    // Mediterranean - Suez - Asia
    { waypoints: [[-5.6,36],[3,37],[15,36],[26,35],[30,31.5],[32.5,30],[33,28],[36,24],[43,13],[48,12],[55,20],[60,22],[72,15],[80,7],[95,2],[104,1.3],[110,2],[115,10],[120,25],[122,30]], types: ['cargo','tanker'], weight: 3 },
    // Persian Gulf Oil Route
    { waypoints: [[50,26.5],[54,25.5],[56.3,26.6],[60,22],[65,18],[72,13],[80,7],[90,1],[100,-5],[105,-8],[115,-15],[125,-25],[135,-33],[140,-37]], types: ['tanker'], weight: 2 },
    // North Atlantic
    { waypoints: [[-5,50],[-12,52],[-20,52],[-30,48],[-40,44],[-50,42],[-60,41],[-70,40.5],[-74,40.7]], types: ['cargo','cargo','cargo','tanker'], weight: 2 },
    // Transatlantic Southern
    { waypoints: [[-5,48],[-15,43],[-25,35],[-35,28],[-45,18],[-50,5],[-43,-3],[-40,-10],[-38,-20]], types: ['cargo'], weight: 1 },
    // Transpacific North
    { waypoints: [[130,35],[140,38],[150,42],[160,45],[170,48],[-170,50],[-160,50],[-150,48],[-140,46],[-130,43],[-124,38]], types: ['cargo','cargo','tanker'], weight: 2 },
    // SE Asian Waters
    { waypoints: [[104,1.3],[106,2],[108,5],[110,10],[113,15],[114,20],[117,23],[121,25],[122,30],[127,35],[130,33],[132,34]], types: ['cargo','cargo','tanker'], weight: 3 },
    // West Africa Oil
    { waypoints: [[3,6],[2,3],[-1,-2],[-5,-10],[0,-15],[5,-25],[12,-30],[15,-33.5],[18,-34],[25,-33],[30,-30]], types: ['tanker','tanker','cargo'], weight: 1 },
    // Indian Ocean
    { waypoints: [[73,18],[72,13],[65,10],[55,12],[48,12],[43.3,12.5],[50,5],[55,-5],[60,-10],[70,-15],[80,-10],[85,5],[88,15],[90,20]], types: ['cargo','tanker'], weight: 1 },
    // North Sea / Baltic
    { waypoints: [[-3,55],[2,54],[5,55],[8,56],[10,57],[12,56],[14,55],[18,57],[20,59],[22,60],[25,60]], types: ['cargo','tanker'], weight: 1 },
    // East African Coast
    { waypoints: [[40,12],[42,8],[44,2],[45,-3],[43,-8],[40,-12],[38,-16],[36,-20],[33,-25],[31,-30],[29,-33]], types: ['cargo'], weight: 1 },
    // South China Sea to Japan
    { waypoints: [[106,10],[110,15],[114,20],[117,23],[120,25],[121,28],[122,31],[125,34],[130,35],[132,34],[135,35],[140,35]], types: ['cargo','cargo','tanker','military'], weight: 2 },
    // US Gulf Coast
    { waypoints: [[-97,27],[-94,28],[-90,29],[-88,29.5],[-85,28],[-82,26],[-80,25.5],[-78,30],[-75,35],[-72,40]], types: ['tanker','cargo'], weight: 1 },
];

/* ═══ Haversine distance (km) ═══ */
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ═══ Calculate bearing between two points ═══ */
function bearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

export class AISStreamProvider {
    constructor() {
        this.vessels = new Map();       // mmsi → { mmsi, name, type, lat, lng, speed, heading, timestamp }
        this.shipTypes = new Map();     // mmsi → 'cargo' | 'tanker' | 'military'
        this.lastUpdate = new Map();    // mmsi → timestamp of last accepted update
        this.ws = null;
        this.reconnectTimer = null;
        this.cleanupTimer = null;
        this.simTimer = null;
        this.connected = false;
        this.simMode = false;
        this.reconnectDelay = RECONNECT_BASE_MS;
        this.stats = { total: 0, updatesReceived: 0, updatesAccepted: 0, filtered: 0 };
    }

    /* ── Public API ── */

    start() {
        const apiKey = process.env.AISSTREAM_API_KEY;
        if (!apiKey || apiKey === 'your-aisstream-api-key') {
            console.log('[AISStream] No API key configured — starting simulation mode');
            this.startSimulation();
        } else {
            this.connect(apiKey);
        }
        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    }

    stop() {
        if (this.ws) { try { this.ws.close(); } catch {} }
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        if (this.simTimer) clearInterval(this.simTimer);
    }

    /**
     * Get vessels filtered by viewport and zoom.
     * @param {Object} opts - { bbox: [west, south, east, north], zoom, limit }
     */
    getVessels(opts = {}) {
        const { bbox, zoom = 2, limit = 5000 } = opts;
        let result = [];

        for (const v of this.vessels.values()) {
            // Viewport filter
            if (bbox) {
                const [west, south, east, north] = bbox;
                if (west <= east) {
                    if (v.lng < west || v.lng > east || v.lat < south || v.lat > north) continue;
                } else {
                    // Wraps around antimeridian
                    if ((v.lng < west && v.lng > east) || v.lat < south || v.lat > north) continue;
                }
            }
            result.push(v);
            if (result.length >= limit) break;
        }

        return result;
    }

    getStats() {
        let cargo = 0, tanker = 0, military = 0;
        for (const v of this.vessels.values()) {
            if (v.type === 'cargo') cargo++;
            else if (v.type === 'tanker') tanker++;
            else if (v.type === 'military') military++;
        }
        return {
            total: this.vessels.size,
            cargo, tanker, military,
            connected: this.connected,
            simulated: this.simMode,
            ...this.stats,
        };
    }

    getChokeAlerts() {
        const alerts = [];
        for (const cp of CHOKEPOINTS) {
            let count = 0, tankers = 0, cargo = 0, military = 0;
            for (const v of this.vessels.values()) {
                const dist = haversine(v.lat, v.lng, cp.lat, cp.lng);
                if (dist <= cp.radius) {
                    count++;
                    if (v.type === 'tanker') tankers++;
                    else if (v.type === 'cargo') cargo++;
                    else if (v.type === 'military') military++;
                }
            }
            if (count >= 5) {
                let type = 'Ship Accumulation';
                if (tankers >= count * 0.5) type = 'Tanker Congestion';
                else if (military >= 3) type = 'Military Presence';

                alerts.push({
                    location: cp.name,
                    lat: cp.lat,
                    lng: cp.lng,
                    type,
                    count,
                    breakdown: { tankers, cargo, military },
                    severity: count >= 20 ? 'high' : count >= 10 ? 'medium' : 'low',
                });
            }
        }
        return alerts;
    }

    /* ── AISStream WebSocket Connection ── */

    connect(apiKey) {
        try {
            this.ws = new WebSocket(AISSTREAM_URL);
        } catch (err) {
            console.error('[AISStream] WebSocket creation failed:', err.message);
            this.scheduleReconnect(apiKey);
            return;
        }

        this.ws.on('open', () => {
            console.log('[AISStream] ✅ Connected to AISStream');
            this.connected = true;
            this.reconnectDelay = RECONNECT_BASE_MS;

            // Subscribe to global position reports
            const subscription = JSON.stringify({
                APIKey: apiKey,
                BoundingBoxes: [[[-90, -180], [90, 180]]],
                FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
            });
            this.ws.send(subscription);
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            } catch {}
        });

        this.ws.on('close', () => {
            console.warn('[AISStream] Connection closed');
            this.connected = false;
            this.scheduleReconnect(apiKey);
        });

        this.ws.on('error', (err) => {
            console.error('[AISStream] WebSocket error:', err.message);
            this.connected = false;
        });
    }

    scheduleReconnect(apiKey) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        console.log(`[AISStream] Reconnecting in ${this.reconnectDelay / 1000}s...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, RECONNECT_MAX_MS);
            this.connect(apiKey);
        }, this.reconnectDelay);
    }

    handleMessage(msg) {
        this.stats.updatesReceived++;

        if (msg.MessageType === 'ShipStaticData') {
            const sd = msg.Message?.ShipStaticData;
            const mmsi = msg.MetaData?.MMSI;
            if (sd && mmsi) {
                const type = classifyShipType(sd.Type);
                if (type) this.shipTypes.set(mmsi, type);
            }
            return;
        }

        if (msg.MessageType !== 'PositionReport') return;

        const pr = msg.Message?.PositionReport;
        const meta = msg.MetaData;
        if (!pr || !meta?.MMSI) return;

        const mmsi = meta.MMSI;

        // Ship type filter — check cache, or allow unknown (will be classified later)
        let type = this.shipTypes.get(mmsi);
        if (!type) {
            // Infer from name heuristics if no static data yet
            const name = (meta.ShipName || '').toUpperCase();
            if (name.includes('TANKER') || name.includes('OIL') || name.includes('CRUDE') || name.includes('LNG') || name.includes('LPG')) {
                type = 'tanker';
            } else if (name.includes('NAVY') || name.includes('MILITARY') || name.includes('WARSHIP') || name.includes('COAST GUARD')) {
                type = 'military';
            } else {
                type = 'cargo'; // Default assumption
            }
            this.shipTypes.set(mmsi, type);
        }

        // 10-second dedup per MMSI
        const now = Date.now();
        const lastUp = this.lastUpdate.get(mmsi);
        if (lastUp && (now - lastUp) < DEDUP_INTERVAL_MS) {
            this.stats.filtered++;
            return;
        }

        // Validate coordinates
        const lat = pr.Latitude;
        const lng = pr.Longitude;
        if (!lat || !lng || lat === 0 || lng === 0 || lat > 90 || lat < -90 || lng > 180 || lng < -180) return;

        // Cap total vessels
        if (!this.vessels.has(mmsi) && this.vessels.size >= MAX_VESSELS) return;

        // Update vessel
        this.vessels.set(mmsi, {
            mmsi,
            name: (meta.ShipName || '').trim(),
            type,
            lat,
            lng,
            speed: pr.Sog || 0,
            heading: pr.TrueHeading === 511 ? (pr.Cog || 0) : (pr.TrueHeading || 0),
            course: pr.Cog || 0,
            timestamp: now,
        });
        this.lastUpdate.set(mmsi, now);
        this.stats.updatesAccepted++;
        this.stats.total = this.vessels.size;
    }

    /* ── Cleanup stale vessels (>5 min) ── */
    cleanup() {
        const cutoff = Date.now() - TTL_MS;
        for (const [mmsi, vessel] of this.vessels) {
            if (vessel.timestamp < cutoff) {
                this.vessels.delete(mmsi);
                this.lastUpdate.delete(mmsi);
            }
        }
        this.stats.total = this.vessels.size;
    }

    /* ═══════════════════════════════════════════════════════
       Simulation Fallback — Realistic Shipping Lane Data
       ═══════════════════════════════════════════════════════ */

    startSimulation() {
        this.simMode = true;
        this.generateSimulatedVessels();

        // Periodically update positions (simulate movement)
        this.simTimer = setInterval(() => {
            this.updateSimulatedPositions();
        }, SIM_UPDATE_INTERVAL);
    }

    generateSimulatedVessels() {
        let mmsiCounter = 200000000;

        const shipNames = {
            cargo: ['EVER GIVEN','MAERSK SEOUL','MSC OSCAR','COSCO FORTUNE','CMA CGM MARCO POLO','OOCL HONG KONG','YANG MING WISH','PIL CELEBES','HAPAG LLOYD TOKYO','ZIM ANTWERP','EVERGREEN STAR','HYUNDAI GRACE','MOL TRIUMPH','ONE HARMONY','PACIFIC TRADER','ATLAS NAVIGATOR','GLOBAL CARRIER','ORIENT EXPLORER'],
            tanker: ['FRONT ALTA','EURONAV GRACE','DHT HAWK','HAFNIA PHOENIX','NORDIC UNITY','STENA CLEAR SKY','TANKER PACIFIC','ARABIAN STAR','CRUDE CARRIER XI','PERSIAN GULF','BW RHINE','TORM ROSETTA','SCORPIO LEO','NAVIG8 PRIDE','ARDMORE ENDEAVOUR','OKEANIS ECO'],
            military: ['USS EISENHOWER','HMS QUEEN ELIZABETH','CHARLES DE GAULLE','INS VIKRANT','LIAONING','ADMIRAL KUZNETSOV','JS IZUMO','HMAS CANBERRA','TCG ANADOLU','GIUSEPPE GARIBALDI'],
        };

        for (const lane of SHIPPING_LANES) {
            const vesselCount = Math.round((SIM_VESSEL_COUNT / SHIPPING_LANES.length) * lane.weight);
            const wps = lane.waypoints;

            for (let i = 0; i < vesselCount; i++) {
                // Pick random position along lane
                const segIdx = Math.floor(Math.random() * (wps.length - 1));
                const t = Math.random();
                const lng = wps[segIdx][0] + t * (wps[segIdx + 1][0] - wps[segIdx][0]);
                const lat = wps[segIdx][1] + t * (wps[segIdx + 1][1] - wps[segIdx][1]);

                // Add jitter (ships don't follow exact lines)
                const jitterLng = (Math.random() - 0.5) * 2;
                const jitterLat = (Math.random() - 0.5) * 1.5;

                const type = lane.types[Math.floor(Math.random() * lane.types.length)];
                const namePool = shipNames[type] || shipNames.cargo;
                const name = namePool[Math.floor(Math.random() * namePool.length)];
                const mmsi = mmsiCounter++;

                // Heading towards next waypoint
                const headingVal = bearing(lat, lng,
                    wps[Math.min(segIdx + 1, wps.length - 1)][1],
                    wps[Math.min(segIdx + 1, wps.length - 1)][0]);

                // Speed: tankers 10-14 kts, cargo 12-18 kts, military 15-25 kts
                const speedRanges = { cargo: [12, 18], tanker: [10, 14], military: [15, 25] };
                const [sMin, sMax] = speedRanges[type] || [10, 15];
                const speed = sMin + Math.random() * (sMax - sMin);

                this.vessels.set(mmsi, {
                    mmsi,
                    name: `${name} ${String(mmsi).slice(-3)}`,
                    type,
                    lat: lat + jitterLat,
                    lng: lng + jitterLng,
                    speed: Math.round(speed * 10) / 10,
                    heading: Math.round(headingVal),
                    course: Math.round(headingVal),
                    timestamp: Date.now(),
                    _simSegIdx: segIdx,
                    _simLane: SHIPPING_LANES.indexOf(lane),
                    _simDirection: Math.random() > 0.3 ? 1 : -1, // Some ships go reverse
                });
                this.lastUpdate.set(mmsi, Date.now());
            }
        }

        // Add concentrated vessels around chokepoints for alerts
        for (const cp of CHOKEPOINTS) {
            const cpCount = 8 + Math.floor(Math.random() * 8); // 8-15 ships per chokepoint
            for (let i = 0; i < cpCount; i++) {
                const mmsi = mmsiCounter++;
                const type = cp.name.includes('Hormuz') || cp.name.includes('Mandeb')
                    ? (Math.random() > 0.3 ? 'tanker' : 'cargo')
                    : (Math.random() > 0.5 ? 'cargo' : 'tanker');
                const namePool = shipNames[type];
                const name = namePool[Math.floor(Math.random() * namePool.length)];
                const jLat = (Math.random() - 0.5) * (cp.radius / 111) * 0.8;
                const jLng = (Math.random() - 0.5) * (cp.radius / 111) * 0.8;
                const [sMin, sMax] = type === 'tanker' ? [5, 10] : [8, 14]; // Slower near chokepoints
                this.vessels.set(mmsi, {
                    mmsi,
                    name: `${name} ${String(mmsi).slice(-3)}`,
                    type,
                    lat: cp.lat + jLat,
                    lng: cp.lng + jLng,
                    speed: Math.round((sMin + Math.random() * (sMax - sMin)) * 10) / 10,
                    heading: Math.round(Math.random() * 360),
                    course: Math.round(Math.random() * 360),
                    timestamp: Date.now(),
                });
                this.lastUpdate.set(mmsi, Date.now());
            }
        }

        this.stats.total = this.vessels.size;
        console.log(`[AISStream] Simulation: ${this.vessels.size} vessels generated on ${SHIPPING_LANES.length} shipping lanes + ${CHOKEPOINTS.length} chokepoints`);
    }

    updateSimulatedPositions() {
        const now = Date.now();
        for (const [mmsi, v] of this.vessels) {
            // Move vessel along heading at its speed
            // speed is in knots, 1 knot = 0.0003 degrees/sec approximately
            const dt = SIM_UPDATE_INTERVAL / 1000;
            const headingRad = v.heading * Math.PI / 180;
            const distDeg = (v.speed * 0.0003 * dt);

            v.lng += Math.sin(headingRad) * distDeg;
            v.lat += Math.cos(headingRad) * distDeg;

            // Small heading variation
            v.heading = (v.heading + (Math.random() - 0.5) * 3 + 360) % 360;
            v.course = v.heading;

            // Wrap longitude
            if (v.lng > 180) v.lng -= 360;
            if (v.lng < -180) v.lng += 360;

            // Keep in valid range
            v.lat = Math.max(-85, Math.min(85, v.lat));

            v.timestamp = now;
            this.lastUpdate.set(mmsi, now);
        }
    }
}
