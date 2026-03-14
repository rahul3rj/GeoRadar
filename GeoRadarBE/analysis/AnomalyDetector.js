export class AnomalyDetector {
    detect(osintEvents, flights) {
        const anomalies = [];
        const now = Date.now();

        // 1. Sudden aircraft density spikes (Emergency clusters)
        const emergencies = flights.filter(f => f.category === 'emergency');
        if (emergencies.length >= 3) {
            anomalies.push({
                id: `anomaly-airspace`,
                type: 'anomaly',
                title: 'Airspace Disruption',
                severity: 'critical',
                message: `[ANOMALY] Severe airspace disruption: ${emergencies.length} active emergency squawks detected`,
                source: 'Flight Engine',
                timestamp: now
            });
        }

        // 2. Multiple earthquakes within a short time window (Global seismic unrest)
        const recentQuakes = osintEvents.filter(e =>
            (e.type === 'earthquake_raw' || e.type === 'earthquake')
            && (now - e.timestamp < 3600 * 1000)
            && e.magnitude >= 4.0
        );
        if (recentQuakes.length > 5) {
            anomalies.push({
                id: `anomaly-seismic`,
                type: 'anomaly',
                title: 'Seismic Unrest',
                severity: 'warning',
                message: `[ANOMALY] Heightened global seismic activity (${recentQuakes.length} moderate+ quakes in 1H)`,
                source: 'USGS',
                timestamp: now
            });
        }

        // 3. Substantial wildfire clusters
        const bigFires = osintEvents.filter(e => e.type === 'wildfire');
        if (bigFires.length >= 10) {
            anomalies.push({
                id: `anomaly-fire`,
                type: 'anomaly',
                title: 'Wildfire Outbreak',
                severity: 'warning',
                message: `[ANOMALY] Massive synchronized wildfire breakouts detected`,
                source: 'NASA FIRMS',
                timestamp: now
            });
        }

        // 4. Multiple Protests / Unrest clusters
        const protests = osintEvents.filter(e => e.type === 'protest' || (e.type === 'news' && e.title && e.title.toLowerCase().includes('protest')));
        if (protests.length >= 3) {
            anomalies.push({
                id: `anomaly-protest`,
                type: 'anomaly',
                title: 'Civil Unrest Spike',
                severity: 'high',
                message: `[ANOMALY] Coordinated global protests detecting across ${protests.length} sources`,
                source: 'OSINT Aggregation',
                timestamp: now
            });
        }

        return anomalies;
    }
}
