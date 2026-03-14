import fs from 'fs';
import path from 'path';

export class ConflictEngine {
    constructor() {
        this.registry = [];
        this.loadRegistry();

        this.lastUpdateTime = 0;
        this.currentRiskScore = 100;
        this.lastPayload = null;
        this.lastDebugData = {
            totalEvents: 0,
            filteredEvents: 0,
            matchedSignals: 0,
            clusteredRegions: 0,
            finalConflicts: 0
        };

        this.history = {};
    }

    loadRegistry() {
        try {
            const dataPath = path.join(process.cwd(), 'datasets', 'conflictRegistry.json');
            if (fs.existsSync(dataPath)) {
                this.registry = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
            } else {
                console.warn("[ConflictEngine] Missing conflictRegistry.json");
            }
        } catch (e) {
            console.error("[ConflictEngine] Error loading registry:", e.message);
        }
    }

    getDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    analyze(osintEvents, sirenCount = 0) {
        const now = Date.now();

        // Run every 60 seconds
        if (now - this.lastUpdateTime < 60000 && this.lastPayload) {
            return this.lastPayload;
        }

        // 2. SIGNAL SOURCES
        // Ignore natural disaster sources/types
        const ignoredTypes = ['earthquake', 'earthquake_raw', 'weather', 'wildfire', 'disaster'];
        const validEvents = osintEvents.filter(e => !ignoredTypes.includes(e.type));

        // 3. SIGNAL CLASSIFICATION
        const keywords = [
            "war", "battle", "troops", "military", "airstrike", "missile", "bomb",
            "explosion", "terror", "terrorist", "attack", "killed", "clash",
            "fighting", "insurgent", "militia", "border violence", "drone strike"
        ];

        const conflictSignals = [];

        for (const e of validEvents) {
            let isConflict = false;

            if (e.title) {
                const titleLow = e.title.toLowerCase();
                isConflict = keywords.some(kw => titleLow.includes(kw));
            }

            // Include explicitly ACLED conflict events 
            if (e.type === 'acled_event') {
                const acledValid = ['Battles', 'Violence against civilians', 'Explosions / Remote violence', 'Riots', 'Violent protests'];
                if (acledValid.includes(e.event_type)) {
                    isConflict = true;
                }
            }

            // Fallback for previous ConflictProvider formats if they exist
            if (e.type === 'conflict_event') {
                isConflict = true;
            }

            if (isConflict) {
                const country = e.sourcecountry || e.country || e.location || 'Unknown';
                let parsedTimestamp = e.timestamp;
                if (e.seendate && typeof e.seendate === 'string') {
                    const parsed = new Date(e.seendate.replace(/^(\d{4})(\d{2})(\d{2}T\d{2})(\d{2})(\d{2}Z)$/, "$1-$2-$3:$4:$5")).getTime();
                    if (!isNaN(parsed)) parsedTimestamp = parsed;
                }

                conflictSignals.push({
                    type: "conflict",
                    title: e.title || e.message || 'Unknown Event',
                    country: country,
                    url: e.url || '',
                    timestamp: parsedTimestamp || now,
                    severity: e.severity || "medium",
                    textContext: ((e.title || '') + ' ' + (e.message || '') + ' ' + (e.event_type || '')).toLowerCase(),
                    lat: e.coordinates ? e.coordinates[1] : (e.latitude || null),
                    lon: e.coordinates ? e.coordinates[0] : (e.longitude || null),
                    originalType: e.type,
                    fatalities: e.fatalities || 0,
                    sourcecountry: e.sourcecountry,
                    seendate: e.seendate,
                    actor1: e.actor1 || '',
                    actor2: e.actor2 || ''
                });
            }
        }

        // 4. CONFLICT-BASED EVENT CLUSTERING
        const conflictMap = {};

        for (const sig of conflictSignals) {
            const country = sig.country;
            if (!country || country === 'Unknown' || country === 'Global') continue;

            const normalizeActor = (name) => {
                if (!name) return '';
                return name
                    .replace(/^Military Forces of /i, '')
                    .replace(/ Armed Forces$/i, '')
                    .replace(/ Militants$/i, '')
                    .replace(/ Fighters$/i, '')
                    .replace(/ Junta$/i, '')
                    .replace(/ Resistance$/i, '')
                    .trim();
            };

            let a1 = sig.actor1 || '';
            let a2 = sig.actor2 || '';

            let n1 = normalizeActor(a1);
            let n2 = normalizeActor(a2);

            const getCountry = (rawName, normName, defaultCountry) => {
                if (!normName) return defaultCountry;
                const states = ["Russia", "Ukraine", "Israel", "Iran", "Pakistan", "Afghanistan", "USA", "Syria", "Turkey", "Sudan", "Myanmar", "Nigeria"];
                for (let s of states) {
                    if (normName.toLowerCase() === s.toLowerCase() || rawName.toLowerCase().includes(s.toLowerCase())) {
                        return s;
                    }
                }
                // Check if it's the state actor
                if (rawName.toLowerCase().includes('military') || rawName.toLowerCase().includes('forces')) {
                    return defaultCountry;
                }
                return defaultCountry;
            };

            let c1 = getCountry(a1, n1, country);
            let c2 = getCountry(a2, n2, country);

            let type = "civil";
            let conflictName = `${country} Civil War`;

            if (n1 && n2) {
                if (c1 !== c2 && c1 !== n2 && c2 !== n1) {
                    type = "international";
                    conflictName = `${n1} vs ${n2}`;
                } else if (c1 === c2 || c1 === country || c2 === country) {
                    // Check if second actor is likely a group
                    let isGroup = false;
                    if (a2.toLowerCase().includes('militant') || a2.toLowerCase().includes('fighter') || a2.toLowerCase().includes('rebel')) {
                        isGroup = true;
                    } else if (n2.toLowerCase() !== country.toLowerCase() && !a2.toLowerCase().includes('forces') && !a2.toLowerCase().includes('military')) {
                        isGroup = true;
                    }

                    if (isGroup) {
                        type = "insurgency";
                        conflictName = `${country} vs ${n2}`;
                    } else {
                        type = "civil";
                        conflictName = `${country} Civil War`;
                    }
                }
            } else if (n1 && !n2) {
                conflictName = `${country} vs ${n1}`;
                type = "insurgency";
            } else {
                conflictName = `${country} Civil War`;
                type = "civil";
            }

            if (!conflictMap[conflictName]) {
                conflictMap[conflictName] = {
                    name: conflictName,
                    conflictName: conflictName,
                    type: type,
                    country: country,
                    countries: [country],
                    events: 0,
                    signalCount: 0,
                    fatalities: 0,
                    severityScore: 0,
                    latestSignalTimestamp: 0,
                    signals: [],
                    lat: sig.lat || 0,
                    lon: sig.lon || 0,
                    radius: 40000
                };
            }

            conflictMap[conflictName].signals.push(sig);
            conflictMap[conflictName].events++;
            conflictMap[conflictName].signalCount++; // Backward compatibility
            conflictMap[conflictName].fatalities += Number(sig.fatalities) || 0;

            if (sig.timestamp > conflictMap[conflictName].latestSignalTimestamp) {
                conflictMap[conflictName].latestSignalTimestamp = sig.timestamp;
            }
        }

        const activeRegions = Object.values(conflictMap);

        /* ═══════════════════════════════════════════════════
           5. WEIGHTED COMPOSITE STABILITY CALCULATION
           5 components, each with a capped max penalty:
             - Conflict Severity    → max 40 pts (diminishing returns)
             - Active Sirens        → max 15 pts (NOAA/weather/emergency)
             - Fatality Weight      → max 20 pts (logarithmic)
             - Geographic Spread    → max 10 pts (unique countries)
             - Escalation Momentum  → max 15 pts (per escalating region)
           ═══════════════════════════════════════════════════ */

        // ── Component 1: Conflict Severity (max 40 pts, diminishing returns) ──
        let rawSeveritySum = 0;
        let totalFatalities = 0;

        for (const region of activeRegions) {
            let severityScore = (region.events * 2) + ((region.fatalities || 0) * 0.05);
            let severity = 'low';
            if (severityScore >= 20) severity = 'extreme';
            else if (severityScore >= 10) severity = 'high';
            else if (severityScore >= 5) severity = 'medium';
            else severity = 'low';

            region.severity = severity;
            region.averageSeverity = severity; // Backward compatibility

            totalFatalities += region.fatalities || 0;

            // Per-region severity penalty
            if (severity === 'extreme') rawSeveritySum += 10;
            else if (severity === 'high') rawSeveritySum += 6;
            else if (severity === 'medium') rawSeveritySum += 3;
            else rawSeveritySum += 1;
        }

        // Diminishing returns: first conflicts matter most, later ones have reduced impact
        const conflictPenalty = Math.min(40, rawSeveritySum > 0 ? rawSeveritySum * (1 - rawSeveritySum / 120) : 0);

        // ── Component 2: Active Sirens Penalty (max 15 pts) ──
        const sirenPenalty = Math.min(15, (sirenCount || 0) * 1.5);

        // ── Component 3: Fatality Weight (max 20 pts, logarithmic) ──
        const fatalityPenalty = totalFatalities > 0
            ? Math.min(20, Math.log10(Math.max(totalFatalities, 1)) * 5)
            : 0;

        // ── Component 4: Geographic Spread (max 10 pts) ──
        const uniqueCountries = new Set();
        for (const region of activeRegions) {
            if (region.country && region.country !== 'Unknown') {
                uniqueCountries.add(region.country.toLowerCase());
            }
        }
        const spreadPenalty = Math.min(10, uniqueCountries.size * 1.0);

        // 6 & 7. ESCALATION & DE-ESCALATION DETECTION
        let escalationsCount = 0;
        let deEscalationsCount = 0;
        let conflictList = [];

        for (const region of activeRegions) {
            const hist = this.history[region.conflictName] || { lastCount: 0, status: 'inactive' };

            let status = 'inactive';

            // Use 30-day recency window to match ACLED weekly data refresh cycle.
            // 72h was too strict — weekly CSV data would be stale within 3 days.
            const RECENCY_WINDOW = 30 * 24 * 3600 * 1000; // 30 days
            if (region.events > 0 && (now - region.latestSignalTimestamp <= RECENCY_WINDOW)) {
                const eventsLast24h = region.signals.filter(s => now - s.timestamp <= 24 * 3600 * 1000).length;
                const eventsPrevious24h = region.signals.filter(s => (now - s.timestamp > 24 * 3600 * 1000) && (now - s.timestamp <= 48 * 3600 * 1000)).length;

                let meetsThreshold = region.events >= 2; // Lowered from 3 to ensure conflicts with 2+ events show
                let isEscalating = false;

                if (eventsPrevious24h > 0 && eventsLast24h >= eventsPrevious24h * 1.3) {
                    meetsThreshold = true;
                    isEscalating = true;
                } else if (region.severity === 'extreme') {
                    meetsThreshold = true;
                    isEscalating = true;
                } else if (hist.lastCount > 0 && region.events > hist.lastCount) {
                    // Fallback to simple increment check if within threshold
                    meetsThreshold = true;
                    isEscalating = true;
                } else if (hist.status === 'escalating') {
                    isEscalating = true;
                } else if (hist.lastCount === 0 && region.events > 0) {
                    // First run: any region with events should be considered active
                    meetsThreshold = true;
                }

                if (meetsThreshold) {
                    status = isEscalating ? 'escalating' : 'active';
                    if (status === 'escalating') {
                        escalationsCount++;
                    }
                } else {
                    if (hist.status !== 'inactive') deEscalationsCount++;
                }
            } else if (region.events > 0) {
                // Events exist but are outside the recency window — still mark as active
                // This handles edge cases where timestamps are older but data is still valid
                status = 'active';
            } else {
                if (hist.status !== 'inactive' && hist.lastCount > 0) {
                    deEscalationsCount++;
                }
            }

            this.history[region.conflictName] = {
                lastCount: region.events,
                status: status
            };

            // 8. ACTIVE CONFLICT LIST
            if (status === 'active' || status === 'escalating') {
                conflictList.push({
                    conflict: region.conflictName,
                    type: region.type,
                    events: region.events,
                    fatalities: region.fatalities,
                    severity: region.severity,
                    // Keeping old fields for UI backward compatibility safely
                    region: region.conflictName,
                    country: region.country,
                    signalCount: region.events,
                    latestTimestamp: region.latestSignalTimestamp,
                    status: status,
                    averageSeverity: region.severity,
                    lat: region.lat,
                    lon: region.lon,
                    radius: region.radius
                });
            }
        }

        conflictList.sort((a, b) => {
            const sevVals = { 'extreme': 4, 'high': 3, 'medium': 2, 'low': 1 };
            if (sevVals[b.averageSeverity] !== sevVals[a.averageSeverity]) {
                return (sevVals[b.averageSeverity] || 0) - (sevVals[a.averageSeverity] || 0);
            }
            return b.signalCount - a.signalCount;
        });

        const topConflicts = conflictList.slice(0, 5);
        const activeCount = conflictList.length;

        // ── Component 5: Escalation Momentum (max 15 pts) ──
        const escalationPenalty = Math.min(15, escalationsCount * 3);

        // 9. FINAL GLOBAL STABILITY (weighted composite)
        let globalStability = 100 - (conflictPenalty + sirenPenalty + fatalityPenalty + spreadPenalty + escalationPenalty);

        globalStability = Math.round(globalStability);
        if (globalStability < 10) globalStability = 10;
        if (globalStability > 95) globalStability = 95;

        // Active Regions
        const activeCountries = new Set();
        for (const c of conflictList) {
            if (c.country) activeCountries.add(c.country);
        }
        const activeRegionsCount = activeCountries.size;

        // Growth Rate
        let previousTotalSeverity = this.lastPayload && this.lastPayload.totalSeverity !== undefined ? this.lastPayload.totalSeverity : 0;
        let previousGrowthRateNum = this.lastPayload && this.lastPayload.rawGrowthRateNum !== undefined ? this.lastPayload.rawGrowthRateNum : 0;
        let currentGrowthRate = 0;

        if (previousTotalSeverity === 0) {
            currentGrowthRate = 0;
        } else {
            currentGrowthRate = ((rawSeveritySum - previousTotalSeverity) / previousTotalSeverity) * 100;
        }

        // Smooth the result
        let smoothedGrowthRate = (previousGrowthRateNum * 0.6) + (currentGrowthRate * 0.4);

        // Clamp values
        if (smoothedGrowthRate > 100) smoothedGrowthRate = 100;
        if (smoothedGrowthRate < -100) smoothedGrowthRate = -100;

        let growthRateNum = Math.round(smoothedGrowthRate);
        let growthRate = `${growthRateNum > 0 ? '+' : ''}${growthRateNum}%`;

        // Trend
        let trend = 'stable';
        if (this.lastPayload) {
            if (globalStability > this.currentRiskScore + 2) trend = 'improving';
            else if (globalStability < this.currentRiskScore - 2) trend = 'worsening';
        }

        let alertLevel = 'stable';
        if (globalStability >= 80) alertLevel = 'stable';
        else if (globalStability >= 60) alertLevel = 'elevated';
        else if (globalStability >= 40) alertLevel = 'unstable';
        else if (globalStability >= 20) alertLevel = 'high risk';
        else alertLevel = 'critical';

        this.currentRiskScore = globalStability;
        this.lastUpdateTime = now;

        this.lastPayload = {
            conflictCount: activeCount,
            escalations: escalationsCount,
            deEscalations: deEscalationsCount,
            globalStability: globalStability,
            growthRate: growthRate,
            rawGrowthRateNum: smoothedGrowthRate,
            totalSeverity: rawSeveritySum,
            trend: trend,
            alertLevel: alertLevel,
            activeRegions: activeRegionsCount,
            activeSirens: sirenCount || 0,
            conflictList: topConflicts
        };

        this.lastDebugData = {
            totalEvents: osintEvents.length,
            filteredEvents: validEvents.length,
            matchedSignals: conflictSignals.length,
            clusteredRegions: activeRegions.filter(r => r.signalCount > 0).length,
            finalConflicts: conflictList.length,
            regions: activeRegions.filter(r => r.signalCount > 0)
        };

        return this.lastPayload;
    }

    getDebugData() {
        return this.lastDebugData;
    }
}
