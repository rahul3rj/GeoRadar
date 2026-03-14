export class ZoneEngine {
    constructor() {
        this.cache = new Map();
        this.ttl = 60 * 1000; // 1 minute cache per location
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    analyze(lat, lon, osintEvents, flights) {
        const cacheKey = `${lat.toFixed(1)},${lon.toFixed(1)}`;
        const now = Date.now();

        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (now - cached.timestamp < this.ttl) {
                return cached.data;
            }
        }

        let riskScore = 0;
        let tensionLevel = 'Normal';
        let weatherStatus = 'Clear';

        // Check proximity to OSINT events
        for (const evt of osintEvents) {
            if (evt.coordinates && evt.coordinates.length >= 2) {
                // GeoJSON coordinates are usually [lon, lat]
                const evtLon = evt.coordinates[0];
                const evtLat = evt.coordinates[1];
                const dist = this.calculateDistance(lat, lon, evtLat, evtLon);

                if (dist < 500) { // within 500km
                    if (evt.type === 'earthquake' || evt.type === 'earthquake_raw') riskScore += evt.magnitude * 2;
                }
            }
            if (evt.type === 'weather' && evt.severity === 'critical') {
                weatherStatus = 'Severe';
                riskScore += 10;
            }
            if (evt.type === 'news' && evt.severity === 'critical') {
                tensionLevel = 'Elevated';
                riskScore += 5;
            }
        }

        // Check local flights
        let localFlights = 0;
        for (const f of flights) {
            const dist = this.calculateDistance(lat, lon, f.lat, f.lon);
            if (dist < 200) localFlights++;
        }

        let airTraffic = 'Low';
        if (localFlights > 20) airTraffic = 'High';
        else if (localFlights > 5) airTraffic = 'Medium';

        let level = 'Green';
        if (riskScore > 30) level = 'Red';
        else if (riskScore > 10) level = 'Yellow';

        const result = {
            region: `LOC-${cacheKey}`,
            level,
            zoneScore: riskScore,
            militaryRank: 'N/A',
            airTraffic,
            weather: weatherStatus,
            tension: tensionLevel
        };

        this.cache.set(cacheKey, { data: result, timestamp: now });
        return result;
    }
}
