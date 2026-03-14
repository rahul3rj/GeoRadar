export class StabilityEngine {
    constructor() {
        this.cache = null;
        this.lastCompute = 0;
        this.ttl = 60 * 1000; // 60 seconds
    }

    compute(osintEvents, flights) {
        const now = Date.now();
        if (now - this.lastCompute < this.ttl && this.cache !== null) {
            return this.cache;
        }

        let score = 100;

        let conflictCount = 0;
        let naturalDisasters = 0;
        let airspaceIssues = 0;

        for (const evt of osintEvents) {
            if (evt.type === 'news' && evt.severity === 'critical') conflictCount++;
            if (evt.type === 'earthquake_raw' || evt.type === 'seismic_event' || evt.type === 'earthquake') {
                if (evt.magnitude >= 5.0) naturalDisasters += 2;
                else naturalDisasters += 0.5;
            }
            if (evt.type === 'wildfire') naturalDisasters++;
            if (evt.type === 'weather' && evt.severity === 'critical') naturalDisasters++;
        }

        const emergencies = flights.filter(f => f.category === 'emergency').length;
        airspaceIssues += emergencies * 5;

        // Apply penalties
        score -= (conflictCount * 3);
        score -= (naturalDisasters * 2);
        score -= airspaceIssues;

        // Clamp between 0 and 100
        score = Math.max(0, Math.min(100, Math.round(score)));

        this.cache = {
            score,
            metrics: { conflicts: conflictCount, disasters: naturalDisasters, airspace: airspaceIssues },
            timestamp: now
        };
        this.lastCompute = now;

        return this.cache;
    }
}
