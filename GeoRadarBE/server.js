import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';

import { ADSBExchangeProvider } from './providers/ADSBExchangeProvider.js';
import { ADSBLolProvider } from './providers/ADSBLolProvider.js';
import { OpenSkyProvider } from './providers/OpenSkyProvider.js';
import { SimulatedProvider } from './providers/SimulatedProvider.js';

import { EarthquakeProvider } from './providers/EarthquakeProvider.js';
import { WeatherProvider } from './providers/WeatherProvider.js';
import { WildfireProvider } from './providers/WildfireProvider.js';

import { RSSNewsProvider } from './providers/osint/RSSNewsProvider.js';
import { DisasterAlertProvider } from './providers/osint/DisasterAlertProvider.js';
import { InternetOutageProvider } from './providers/osint/InternetOutageProvider.js';
import { AISProvider } from './providers/osint/AISProvider.js';
import { ConflictProvider } from './providers/osint/ConflictProvider.js';
import { ACLEDProvider } from './providers/osint/ACLEDProvider.js';
import { CategoryNewsProvider } from './providers/osint/CategoryNewsProvider.js';
import { NitterOSINTProvider } from './providers/osint/NitterOSINTProvider.js';
import { AISStreamProvider } from './providers/AISStreamProvider.js';

import { connectMongo, getDb } from './db/mongo.js';
import { ConflictScheduler } from './services/ConflictScheduler.js';

import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 4000;

/* ═══════════════════════════════════════════════════════
   Configuration
   ═══════════════════════════════════════════════════════ */
const CACHE_INTERVAL = 120_000; // 2 minutes
const MIN_ALT_FT = 10000;
const MIN_VEL_KTS = 200;

const providers = [
    new ADSBLolProvider(),
    new OpenSkyProvider(),
    new SimulatedProvider()
];

const osintProviders = [
    new EarthquakeProvider(),
    new WeatherProvider(),
    new WildfireProvider(),
    new RSSNewsProvider(),
    new DisasterAlertProvider(),
    new InternetOutageProvider(),
    new AISProvider()
];

// ACLED provider is initialized after MongoDB connects (see server startup below)
let acledProvider = new ACLEDProvider(null);
osintProviders.push(acledProvider);
let conflictScheduler = null;

const conflictProvider = new ConflictProvider(osintProviders);
osintProviders.push(conflictProvider);

// Standalone providers (not in osintProviders — they don't feed into broadcastSignals)
const categoryNewsProvider = new CategoryNewsProvider();
const nitterOSINTProvider = new NitterOSINTProvider();

const providerCooldowns = {};
const COOLDOWN_DURATION = 10 * 60 * 1000; // 10 minutes

/* ═══════════════════════════════════════════════════════
   Logging helpers
   ═══════════════════════════════════════════════════════ */
function ts() { return new Date().toISOString().slice(11, 19); }
function logInfo(tag, msg) { console.log(`[${ts()}] [${tag}] ${msg}`); }
function logWarn(tag, msg) { console.warn(`[${ts()}] ⚠ [${tag}] ${msg}`); }
function logError(tag, msg) { console.error(`[${ts()}] ❌ [${tag}] ${msg}`); }

/* ═══════════════════════════════════════════════════════
   Backend Cache Layer
   ═══════════════════════════════════════════════════════ */
let cache = {
    timestamp: 0,
    flights: [],
    stats: { total: 0, passenger: 0, cargo: 0, military: 0, private: 0, emergency: 0, unknown: 0 },
    meta: {
        provider: 'None',
        raw_count: 0,
        last_fetch: null
    }
};

let fetchInProgress = false;

/* ═══════════════════════════════════════════════════════
   Filtering & Processing
   ═══════════════════════════════════════════════════════ */
function filterFlights(rawFlights) {
    const flights = rawFlights.filter(f => {
        if (f.lat == null || f.lon == null || f.lat === 0 || f.lon === 0) return false;
        if (f.altitude < MIN_ALT_FT) return false;
        if (f.velocity < MIN_VEL_KTS) return false;
        if (f.category === 'unknown' && f.callsign === '') return false;
        return true;
    });

    const pri = { military: 1, passenger: 2, cargo: 3, emergency: 4, private: 5, unknown: 6 };
    flights.sort((a, b) => (pri[a.category] ?? 6) - (pri[b.category] ?? 6));

    const filtered = [];
    let counts = { passenger: 0, others: 0 };

    for (const f of flights) {
        if (f.category === 'military') {
            filtered.push(f); // No limit for military
        } else if (f.category === 'passenger') {
            if (counts.passenger < 250) {
                filtered.push(f);
                counts.passenger++;
            }
        } else {
            // Other flights (cargo, emergency, private, unknown)
            if (counts.others < 100) {
                filtered.push(f);
                counts.others++;
            }
        }
    }

    return filtered;
}

function computeStats(flights) {
    const stats = { total: flights.length, passenger: 0, cargo: 0, military: 0, private: 0, emergency: 0, unknown: 0 };
    for (const f of flights) stats[f.category] = (stats[f.category] || 0) + 1;
    return stats;
}

/* ═══════════════════════════════════════════════════════
   Aggregation Strategy
   ═══════════════════════════════════════════════════════ */
async function fetchAndCache() {
    if (fetchInProgress) return;
    fetchInProgress = true;

    try {
        const now = Date.now();
        let primaryFlights = null;
        let successfulProvider = 'None';
        let rawCount = 0;

        for (const provider of providers) {
            // Check Cooldown
            if (providerCooldowns[provider.name] && now < providerCooldowns[provider.name]) {
                const remaining = Math.ceil((providerCooldowns[provider.name] - now) / 1000);
                continue;
            }

            if (provider.name === 'simulated') {
                logInfo('Provider', `Simulated traffic activated`);
            } else if (provider.name === 'adsb_lol') {
                logInfo('Provider', `ADSB.lol selected`);
            } else if (provider.name === 'opensky') {
                logInfo('Provider', `OpenSky selected`);
            } else {
                logInfo('Provider', `${provider.name} selected`);
            }

            try {
                primaryFlights = await provider.fetchFlights();
                successfulProvider = provider.name;
                rawCount = primaryFlights.length;
                break; // Stop at first successful provider
            } catch (err) {
                // Rate Limit Detection (HTTP 429) and others
                const status = err.status || (err.message.includes('429') ? 429 : err.message.includes('403') ? 403 : err.message.includes('503') ? 503 : 500);

                if (status === 429) {
                    logWarn('Provider', `${provider.name === 'adsb_lol' ? 'ADSB.lol' : provider.name === 'opensky' ? 'OpenSky' : provider.name} rate limited – cooldown 10m`);
                    providerCooldowns[provider.name] = now + COOLDOWN_DURATION;
                } else if ([401, 403, 500, 503].includes(status)) {
                    logWarn('Provider', `${provider.name === 'adsb_lol' ? 'ADSB.lol' : provider.name === 'opensky' ? 'OpenSky' : provider.name} failed – cooldown 10m`);
                    providerCooldowns[provider.name] = now + COOLDOWN_DURATION;
                } else {
                    logError('Provider', `${provider.name} failed with status: ${status}. Error details: ${err.message}`);
                }
            }
        }

        if (primaryFlights) {
            // Remove duplicates using ICAO address
            const uniqueFlightsList = [];
            const seenIcaos = new Set();
            for (const f of primaryFlights) {
                const icaoKey = f.icao && String(f.icao).trim() !== '' ? String(f.icao).trim().toLowerCase() : Math.random().toString();
                if (!seenIcaos.has(icaoKey)) {
                    seenIcaos.add(icaoKey);
                    uniqueFlightsList.push(f);
                }
            }

            let filteredFlights = filterFlights(uniqueFlightsList);

            // Dynamically pad with simulated routes if live passenger quota falls short of minimum 150
            let passCount = filteredFlights.filter(f => f.category === 'passenger').length;
            if (passCount < 150) {
                const simProvider = providers.find(p => p.name === 'simulated');
                if (simProvider && successfulProvider !== 'simulated') {
                    try {
                        const simData = await simProvider.fetchFlights();
                        const needed = 150 - passCount;
                        const simPass = simData.filter(f => f.category === 'passenger').slice(0, needed);
                        filteredFlights.push(...simPass);
                        logInfo('Simulation', `Appended ${simPass.length} simulated passenger flights to enforce minimum`);
                    } catch (e) {
                        // Ignore sim failure
                    }
                }
            }

            logInfo('Flights', `${rawCount} aircraft → ${filteredFlights.length} filtered`);

            cache = {
                timestamp: Math.floor(Date.now() / 1000),
                flights: filteredFlights,
                stats: computeStats(filteredFlights),
                meta: {
                    provider: successfulProvider,
                    raw_count: rawCount,
                    last_fetch: new Date().toISOString()
                }
            };
        } else {
            logWarn('Aggregation', 'All providers failed. Serving last cached dataset.');
        }
    } finally {
        fetchInProgress = false;
    }
}

import { ZoneEngine } from './analysis/ZoneEngine.js';
import { StabilityEngine } from './analysis/StabilityEngine.js';
import { AnomalyDetector } from './analysis/AnomalyDetector.js';
import { ConflictEngine } from './analysis/ConflictEngine.js';

const zoneEngine = new ZoneEngine();
const stabilityEngine = new StabilityEngine();
const anomalyDetector = new AnomalyDetector();
const conflictEngine = new ConflictEngine();

/* ═══════════════════════════════════════════════════════
   CORS + API Routes
   ═══════════════════════════════════════════════════════ */
app.use(cors({
    origin: process.env.FRONTEND_URL
        ? [process.env.FRONTEND_URL, process.env.FRONTEND_URL.replace('https://', 'https://www.')]
        : '*'
}));
app.use(express.json());

// Main flights endpoint
app.get('/api/flights', (req, res) => {
    res.json({
        timestamp: cache.timestamp,
        flights: cache.flights,
        stats: cache.stats,
        meta: cache.meta
    });
});

// Static Datasets Core
app.get('/api/datasets/:name', (req, res) => {
    const filePath = path.join(process.cwd(), 'datasets', `${req.params.name}.json`);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.status(404).json({ error: 'System Dataset not found' });
    }
});

// Zone Engine
app.get('/api/zone-status', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    let osintEvents = [];
    for (const p of osintProviders) {
        try {
            const evts = await p.getEvents();
            if (evts && evts.length > 0) osintEvents.push(...evts);
        } catch (e) { }
    }

    const result = zoneEngine.analyze(parseFloat(lat), parseFloat(lon), osintEvents, cache.flights);
    res.json(result);
});

// Stability Engine
app.get('/api/global-stability', async (req, res) => {
    let osintEvents = [];
    for (const p of osintProviders) {
        try {
            const evts = await p.getEvents();
            if (evts && evts.length > 0) osintEvents.push(...evts);
        } catch (e) { }
    }

    const result = stabilityEngine.compute(osintEvents, cache.flights);
    res.json(result);
});

// Shared siren count aggregator — used by both /api/conflict-status and /api/human-impact
async function getActiveSirenCount() {
    let sirenCount = 0;
    try {
        // Critical NOAA disaster alerts
        const disasterProvider = osintProviders.find(p => p.constructor && p.constructor.name === 'DisasterAlertProvider');
        if (disasterProvider) {
            const disasters = await disasterProvider.getEvents();
            if (disasters && disasters.length > 0) {
                sirenCount += disasters.filter(d => d.severity === 'critical').length;
            }
        }
        // Critical weather alerts
        const weatherProvider = osintProviders.find(p => p.constructor && p.constructor.name === 'WeatherProvider');
        if (weatherProvider) {
            const weatherAlerts = await weatherProvider.getEvents();
            if (weatherAlerts && weatherAlerts.length > 0) {
                sirenCount += weatherAlerts.filter(w => w.severity === 'critical').length;
            }
        }
        // High-severity conflict events
        const conflictProv = osintProviders.find(p => p.constructor && p.constructor.name === 'ConflictProvider');
        if (conflictProv) {
            const conflicts = await conflictProv.getEvents();
            if (conflicts && conflicts.length > 0) {
                sirenCount += conflicts.filter(c => c.severity === 'high').length;
            }
        }
        // Emergency flights as airspace sirens
        if (cache.flights && cache.flights.length > 0) {
            sirenCount += cache.flights.filter(f => f.category === 'emergency').length;
        }
    } catch (e) {
        console.error('[SirenCount] aggregation error:', e.message);
    }
    return sirenCount;
}

// Conflict Engine
app.get('/api/conflict-status', async (req, res) => {
    let allEvents = [];
    for (const p of osintProviders) {
        try {
            const evts = await p.getEvents();
            if (evts && evts.length > 0) {
                allEvents.push(...evts);
            }
        } catch (e) { }
    }

    const sirenCount = await getActiveSirenCount();
    const result = conflictEngine.analyze(allEvents, sirenCount);
    res.json(result);
});

// Conflict Engine Debug
app.get('/api/debug-conflict-engine', (req, res) => {
    res.json(conflictEngine.getDebugData() || {});
});

// Human Impact Backend Aggregator (ACLED + GDACS + NOAA OSINT)
let humanImpactCache = {
    conflictCasualties: '-',
    disasterCasualties: '-',
    activeSirens: '-',
    humanitarianAlerts: '-'
};
let lastHumanImpactFetch = 0;

app.get('/api/human-impact', async (req, res) => {
    const now = Date.now();
    // 5-minute cache to strictly protect against rate limit issues
    if (now - lastHumanImpactFetch < 300000 && humanImpactCache.conflictCasualties !== '-') {
        return res.json(humanImpactCache);
    }

    try {
        let conflictCasualties = '-';
        let disasterCasualties = '-';
        let activeSirens = '-';
        let humanitarianAlerts = '-';

        // 1. Conflict Casualties (24H) from ACLED OSINT Engine
        try {
            const acledProvider = osintProviders.find(p => p.constructor && p.constructor.name === 'ACLEDProvider');
            if (acledProvider) {
                const events = await acledProvider.getEvents();
                if (events && events.length > 0) {
                    const fatalities = events.reduce((sum, e) => sum + (Number(e.fatalities) || 0), 0);
                    conflictCasualties = fatalities.toLocaleString();
                }
            }
        } catch (e) {
            console.error('[HumanImpactAPI] ACLED parsing error:', e.message);
        }

        // 2. Disaster Casualties & Alerts from actual GDACS RSS OSINT Feed
        try {
            const fetch = (await import('node-fetch')).default;
            // 5 second timeout safeguard
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const rssRes = await fetch('https://www.gdacs.org/xml/rss.xml', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (rssRes.ok) {
                const text = await rssRes.text();
                // Parse number of items
                const itemsCount = (text.match(/<item>/g) || []).length;
                humanitarianAlerts = itemsCount > 0 ? `${itemsCount} Active` : '-';

                // Regex search for fatalities inside description CDATA
                let deaths = 0;
                const deadRegex = /dead:\s*(\d+)|fatalities:\s*(\d+)/gi;
                let match;
                let foundMatch = false;
                while ((match = deadRegex.exec(text)) !== null) {
                    foundMatch = true;
                    deaths += parseInt(match[1] || match[2] || 0);
                }
                if (foundMatch) {
                    disasterCasualties = deaths.toLocaleString();
                } else if (itemsCount > 0) {
                    disasterCasualties = '0'; // Disasters exist but 0 confirmed casualties reported in RSS
                }
            }
        } catch (e) {
            console.error('[HumanImpactAPI] GDACS API error or rate limit:', e.message);
        }

        // 3. Active Sirens — reuse shared helper
        try {
            const sirenCount = await getActiveSirenCount();
            activeSirens = sirenCount > 0 ? `${sirenCount} Active` : '0';
        } catch (e) {
            console.error('[HumanImpactAPI] Active Sirens aggregation error:', e.message);
        }

        humanImpactCache = {
            conflictCasualties,
            disasterCasualties,
            activeSirens,
            humanitarianAlerts
        };
        lastHumanImpactFetch = now;
        res.json(humanImpactCache);

    } catch (err) {
        console.error('[HumanImpactAPI] Global error:', err.message);
        res.json(humanImpactCache); // Return best-effort cached or default missing (-) payload
    }
});

/* ═══════════════════════════════════════════════════════
   Conflict Data API (/api/conflicts)
   ═══════════════════════════════════════════════════════ */

// GET /api/conflicts — Returns conflict events for map markers (last 30 days)
app.get('/api/conflicts', async (req, res) => {
    try {
        const db = getDb();
        const daysBack = parseInt(req.query.days) || 30;
        const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let events = [];

        // Try MongoDB first (wrapped in its own try/catch so failures fall through)
        if (db) {
            try {
                const col = db.collection('conflict_events');
                events = await col.find(
                    { event_date: { $gte: cutoff } },
                    { projection: { _id: 0, latitude: 1, longitude: 1, event_type: 1, sub_event_type: 1, country: 1, fatalities: 1, actor1: 1, actor2: 1, event_date: 1, notes: 1, region: 1, admin1: 1, severity: 1 } }
                ).sort({ event_date: -1 }).limit(2000).toArray();
            } catch (mongoErr) {
                console.warn('[ConflictsAPI] MongoDB query failed, falling back to cache:', mongoErr.message);
                events = [];
            }
        }

        // Fallback to ACLED provider cache / mock data
        if (events.length === 0) {
            const acled = osintProviders.find(p => p.constructor.name === 'ACLEDProvider');
            if (acled) {
                try {
                    const cached = await acled.getEvents();
                    events = cached.filter(e => !e.event_date || e.event_date >= cutoff);
                } catch (acledErr) {
                    console.warn('[ConflictsAPI] ACLED provider failed:', acledErr.message);
                    events = [];
                }
            }
        }

        // Map to frontend format
        const mapped = events.map(e => ({
            lat: e.latitude,
            lng: e.longitude,
            type: e.event_type || 'Unknown',
            subType: e.sub_event_type || '',
            country: e.country || 'Unknown',
            region: e.region || e.admin1 || '',
            fatalities: e.fatalities || 0,
            actor1: e.actor1 || '',
            actor2: e.actor2 || '',
            date: e.event_date || '',
            notes: e.notes ? e.notes.slice(0, 200) : '',
            severity: e.severity || classifyEventSeverity(e.event_type, e.fatalities)
        }));

        res.json({ success: true, count: mapped.length, data: mapped });
    } catch (e) {
        console.error('[ConflictsAPI] Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/conflict-summary — Returns per-country conflict intensity scores
app.get('/api/conflict-summary', async (req, res) => {
    try {
        const db = getDb();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let events = [];

        // Try MongoDB first (wrapped so failures fall through)
        if (db) {
            try {
                const col = db.collection('conflict_events');
                events = await col.find(
                    { event_date: { $gte: sevenDaysAgo } },
                    { projection: { _id: 0, country: 1, fatalities: 1 } }
                ).toArray();
            } catch (mongoErr) {
                console.warn('[ConflictSummaryAPI] MongoDB query failed, falling back:', mongoErr.message);
                events = [];
            }
        }

        // Fallback to ACLED provider cache
        if (events.length === 0) {
            const acled = osintProviders.find(p => p.constructor.name === 'ACLEDProvider');
            if (acled) {
                try {
                    const cached = await acled.getEvents();
                    events = cached.filter(e => !e.event_date || e.event_date >= sevenDaysAgo);
                } catch (acledErr) {
                    console.warn('[ConflictSummaryAPI] ACLED provider failed:', acledErr.message);
                    events = [];
                }
            }
        }

        // Calculate intensity scores per country
        // Formula: score = (events_last_7_days * 0.6) + (fatalities * 0.4)
        const countryStats = {};
        for (const e of events) {
            const c = e.country || 'Unknown';
            if (!countryStats[c]) countryStats[c] = { events: 0, fatalities: 0 };
            countryStats[c].events++;
            countryStats[c].fatalities += (e.fatalities || 0);
        }

        const scores = {};
        for (const [country, stats] of Object.entries(countryStats)) {
            scores[country] = Math.round((stats.events * 0.6) + (stats.fatalities * 0.4));
        }

        // Sort by score descending
        const sorted = Object.fromEntries(
            Object.entries(scores).sort((a, b) => b[1] - a[1])
        );

        res.json(sorted);
    } catch (e) {
        console.error('[ConflictSummaryAPI] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/conflicts/ingest — Manual trigger for CSV ingestion
app.post('/api/conflicts/ingest', async (req, res) => {
    if (!conflictScheduler) {
        return res.status(503).json({ error: 'Scheduler not initialized' });
    }
    const result = await conflictScheduler.runIngestion();
    res.json(result);
});

// GET /api/conflicts/scheduler-status
app.get('/api/conflicts/scheduler-status', (req, res) => {
    res.json(conflictScheduler ? conflictScheduler.getStatus() : { scheduled: false });
});

// Severity helper used in /api/conflicts
function classifyEventSeverity(eventType, fatalities) {
    const type = (eventType || '').toLowerCase();
    if (type.includes('explosion') || type.includes('remote violence') || type.includes('violence against civilians')) {
        return fatalities > 10 ? 'critical' : 'high';
    }
    if (type.includes('battle')) return fatalities > 5 ? 'high' : 'medium';
    if (type.includes('riot')) return 'medium';
    if (type.includes('protest') || type.includes('strategic')) return 'low';
    return fatalities > 0 ? 'medium' : 'low';
}

/* ═══════════════════════════════════════════════════════
   Category News & OSINT Feed API
   ═══════════════════════════════════════════════════════ */

// GET /api/news/local?countryCode=XX  (MUST be before :category route)
app.get('/api/news/local', async (req, res) => {
    try {
        const countryCode = (req.query.countryCode || '').toUpperCase();
        if (!countryCode || countryCode.length !== 2) {
            return res.status(400).json({ error: 'countryCode query param required (ISO 3166-1 alpha-2)' });
        }
        const news = await categoryNewsProvider.getLocalNews(countryCode);
        res.json({ category: 'local', countryCode, items: news });
    } catch (e) {
        console.error('[API] /api/news/local error:', e.message);
        res.status(500).json({ error: 'Failed to fetch local news' });
    }
});

// GET /api/news/:category  (global, tech, market, space, climate)
app.get('/api/news/:category', async (req, res) => {
    const validCategories = ['global', 'tech', 'market', 'space', 'climate'];
    const category = req.params.category.toLowerCase();
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Valid: ${validCategories.join(', ')}` });
    }
    try {
        const news = await categoryNewsProvider.getNews(category);
        res.json({ category, items: news });
    } catch (e) {
        console.error(`[API] /api/news/${category} error:`, e.message);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

// GET /api/osint-feed  (Nitter OSINT posts)
app.get('/api/osint-feed', async (req, res) => {
    try {
        const posts = await nitterOSINTProvider.getPosts();
        res.json({ posts });
    } catch (e) {
        console.error('[API] /api/osint-feed error:', e.message);
        res.status(500).json({ error: 'Failed to fetch OSINT feed' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: cache.flights.length > 0 ? 'ok' : 'degraded',
        cached_flights: cache.flights.length,
        current_provider: cache.meta.provider,
        uptime_s: Math.round(process.uptime()),
        cooldowns: providerCooldowns,
        mongodb: !!getDb(),
        conflict_scheduler: conflictScheduler ? conflictScheduler.getStatus() : null
    });
});

/* ═══════════════════════════════════════════════════════
   Marine Traffic API (/api/marine)
   ═══════════════════════════════════════════════════════ */
const aisStreamProvider = new AISStreamProvider();

// GET /api/marine — Returns vessel positions filtered by viewport
app.get('/api/marine', (req, res) => {
    try {
        const zoom = parseFloat(req.query.zoom) || 2;
        let bbox = null;
        if (req.query.bbox) {
            const parts = req.query.bbox.split(',').map(Number);
            if (parts.length === 4 && parts.every(n => !isNaN(n))) {
                bbox = parts; // [west, south, east, north]
            }
        }
        const limit = Math.min(parseInt(req.query.limit) || 5000, 5000);

        const vessels = aisStreamProvider.getVessels({ bbox, zoom, limit });
        const stats = aisStreamProvider.getStats();

        // Simplify response based on zoom level
        let data;
        if (zoom < 3) {
            // Low zoom: minimal data for heatmap
            data = vessels.map(v => ({
                lat: Math.round(v.lat * 100) / 100,
                lng: Math.round(v.lng * 100) / 100,
                type: v.type,
            }));
        } else if (zoom < 6) {
            // Medium zoom: basic data for clustering
            data = vessels.map(v => ({
                lat: Math.round(v.lat * 1000) / 1000,
                lng: Math.round(v.lng * 1000) / 1000,
                type: v.type,
                heading: v.heading,
                speed: v.speed,
            }));
        } else {
            // High zoom: full detail
            data = vessels.map(v => ({
                mmsi: v.mmsi,
                name: v.name,
                lat: v.lat,
                lng: v.lng,
                type: v.type,
                heading: v.heading,
                speed: v.speed,
                course: v.course,
            }));
        }

        res.json({
            success: true,
            count: data.length,
            zoom,
            stats: {
                total: stats.total,
                cargo: stats.cargo,
                tanker: stats.tanker,
                military: stats.military,
                connected: stats.connected,
                simulated: stats.simulated,
            },
            data,
        });
    } catch (err) {
        console.error('[MarineAPI] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/marine/alerts — Chokepoint alerts
app.get('/api/marine/alerts', (req, res) => {
    try {
        const alerts = aisStreamProvider.getChokeAlerts();
        res.json({ success: true, alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ═══════════════════════════════════════════════════════
   Start Server & WebSockets
   ═══════════════════════════════════════════════════════ */
// Boot sequence: connect MongoDB first, then start Express
(async () => {
    // 1. Connect MongoDB (graceful — server works without it)
    const db = await connectMongo();

    // 2. Wire MongoDB into ACLEDProvider for direct reads
    if (db) {
        acledProvider.db = db;
    }

    // 3. Start Conflict Scheduler (weekly ACLED CSV ingestion)
    conflictScheduler = new ConflictScheduler(db);
    conflictScheduler.start();

    // 4. Start Express
    const server = app.listen(PORT, () => {
        console.log(`\n🛩  GeoRadar Resilient Aviation Backend`);
        console.log(`   Port:           ${PORT}`);
        console.log(`   Cache Request:  ${CACHE_INTERVAL / 1000}s Threshold`);
        console.log(`   Providers:      ${providers.map(p => p.name).join(' -> ')}`);
        console.log(`   OSINT:          ${osintProviders.map(p => p.constructor.name).join(', ')}`);
        console.log(`   MongoDB:        ${db ? '✅ Connected' : '❌ File-based fallback'}`);
        console.log(`   Scheduler:      ✅ Every Monday 06:00 AM`);
        console.log(`   Marine:         ${aisStreamProvider.simMode ? '🔸 Simulated' : '✅ AISStream live'}`);
        console.log(`   Endpoints:      /api/flights, /api/conflicts, /api/marine\n`);

        // Fetch immediately, then on interval
        fetchAndCache();
        setInterval(fetchAndCache, CACHE_INTERVAL);

        // Start all OSINT providers individually on their own interval clocks
        osintProviders.forEach(p => {
            if (typeof p.start === 'function') {
                p.start();
            }
        });

        // Start Marine Traffic provider
        aisStreamProvider.start();

        // Start Category News and Nitter OSINT providers
        categoryNewsProvider.start();
        nitterOSINTProvider.start();
    });

/* ──── WebSockets & Global Signals ──── */
const wss = new WebSocketServer({ server });

let lastBroadcastHash = '';
let lastPayload = null;

wss.on('connection', (ws) => {
    logInfo('WS', 'New client connected for OSINT updates');
    if (lastPayload) {
        ws.send(lastPayload);
    }
});

const broadcastSignals = async () => {
    try {
        let allEvents = [];

        // 1. Gather from all independent OSINT caches
        for (const p of osintProviders) {
            try {
                const evts = await p.getEvents();
                if (evts && evts.length > 0) {
                    allEvents.push(...evts);
                }
            } catch (e) { }
        }

        // 2. Anomaly Detection Integration
        const anomalies = anomalyDetector.detect(allEvents, cache.flights);
        if (anomalies.length > 0) {
            allEvents.push(...anomalies);
        }

        // 3. Merging logic
        allEvents.sort((a, b) => b.timestamp - a.timestamp);
        let merged = [];

        for (const evt of allEvents) {
            let matched = false;

            // Correlation 1: Earthquake and RSS News matching
            if (evt.type === 'earthquake_raw' || evt.type === 'news' || evt.type === 'conflict') {
                for (const m of merged) {
                    if ((m.type === 'earthquake_raw' || m.type === 'news' || m.type === 'conflict') && m.type !== evt.type) {
                        const eq = evt.type === 'earthquake_raw' ? evt : m;
                        const news = (evt.type === 'news' || evt.type === 'conflict') ? evt : m;
                        const eqCountry = eq.location ? eq.location.toLowerCase().split(' ').pop() : '';

                        if (news.title && eqCountry && news.title.toLowerCase().includes(eqCountry)) {
                            if (m.type === 'news' || m.type === 'conflict') Object.assign(m, eq);
                            m.message = `${eq.message} | Related news detected`;
                            m.severity = 'critical';
                            matched = true;
                            break;
                        }
                    }
                }
            }

            // Correlation 2: Multiple RSS matching same protest
            if (!matched && evt.type === 'protest') {
                const m = merged.find(x => x.type === 'protest');
                if (m && m.id !== evt.id) {
                    m.severity = 'critical';
                    m.message = `[Multi-Source] ${m.title || m.message}`;
                    matched = true;
                }
            }

            // Correlation 3: Disaster and weather bounding
            if (!matched && (evt.type === 'disaster' || evt.type === 'weather')) {
                const m = merged.find(x => (x.type === 'disaster' || x.type === 'weather') && x.type !== evt.type);
                if (m) {
                    // Approximate region match
                    const mLoc = m.location ? m.location.toLowerCase() : '';
                    const eLoc = evt.location ? evt.location.toLowerCase() : '';
                    const common = eLoc.split(' ')[0] || '';
                    if (common.length > 3 && mLoc.includes(common)) {
                        m.severity = 'critical';
                        m.message = `[High Confidence] ${m.message}`;
                        matched = true;
                    }
                }
            }

            if (!matched) merged.push({ ...evt });
        }

        // 4. Explosion Detection Refinement
        const rawQuakes = merged.filter(e => e.type === 'earthquake_raw');

        for (let q of rawQuakes) {
            let isExplosion = false;

            if (q.magnitude >= 5 && q.coordinates && q.coordinates[2] < 10) {
                const region = q.location.split(' ').pop();
                const cluster = rawQuakes.filter(other => other.id !== q.id && other.location.includes(region));
                if (cluster.length > 0) {
                    isExplosion = true;
                }
            }

            if (isExplosion) {
                q.type = 'possibleExplosion';
                q.severity = 'critical';
                q.message = `[EXPLOSION DETECTED] Cluster matched M${q.magnitude.toFixed(1)} at depth ${q.coordinates[2]}km - ${q.location}`;
            } else {
                q.type = 'seismic_event';
            }
        }

        // 5. Final output limit sorting with Priority Ranking
        const prioritize = (e) => {
            if (e.type === 'possibleExplosion') return 5;
            if ((e.type === 'seismic_event' || e.type === 'earthquake_raw') && e.magnitude >= 6.0) return 4;
            if (e.type === 'anomaly') return 4;
            if (e.type === 'conflict' || (e.type === 'news' && e.severity === 'critical')) return 4;
            if (e.type === 'wildfire') return 3;
            if (e.type === 'weather' || e.type === 'disaster') return 3;
            if (e.type === 'networkOutage') return 3;

            // Base severity fallback
            if (e.severity === 'critical') return 4;
            if (e.severity === 'high') return 3;
            if (e.severity === 'warning') return 2;
            return 1;
        };

        merged.sort((a, b) => prioritize(b) - prioritize(a) || b.timestamp - a.timestamp);

        // 6. Clamp to top 10
        const topEvents = merged.slice(0, 10);

        const currentHash = JSON.stringify(topEvents.map(e => `${e.id}-${e.severity}-${e.message}`));
        if (currentHash === lastBroadcastHash) {
            return;
        }
        lastBroadcastHash = currentHash;

        const payload = JSON.stringify({
            event: 'globalSignals',
            data: topEvents
        });

        lastPayload = payload;

        wss.clients.forEach(c => {
            if (c.readyState === 1 /* OPEN */) {
                c.send(payload);
            }
        });
    } catch (e) {
        console.error('[broadcastSignals] Crash:', e);
    }
};

setInterval(broadcastSignals, 5000);
setTimeout(broadcastSignals, 5000);

})(); // End async boot sequence
