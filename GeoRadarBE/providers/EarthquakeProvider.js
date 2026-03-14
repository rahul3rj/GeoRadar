import fetch from 'node-fetch';

export class EarthquakeProvider {
    constructor() {
        this.cache = [];
        this.interval = 60 * 1000; // 60 seconds
        this.timer = null;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        try {
            const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson');
            if (!res.ok) throw new Error(`USGS EQ API HTTP ${res.status}`);
            const data = await res.json();

            const events = data.features.map(f => {
                const mag = f.properties.mag || 0;
                let severity = 'info';
                if (mag >= 5.0) severity = 'critical';
                else if (mag >= 3.0) severity = 'warning';

                return {
                    id: f.id,
                    type: 'earthquake_raw', // Mapped to explosion or seismic_event later
                    severity,
                    message: `Earthquake: M${mag.toFixed(1)} - ${f.properties.place}`,
                    magnitude: mag,
                    location: f.properties.place || 'Unknown',
                    coordinates: f.geometry.coordinates, // [lon, lat, depth]
                    url: f.properties.url,
                    timestamp: f.properties.time,
                    confidence: f.properties.status === 'reviewed' ? '(Reviewed)' : '(Automatic)'
                };
            });

            this.cache = events;
        } catch (err) {
            console.error('[EarthquakeProvider] Fetch failed:', err.message);
        }
    }

    async getEvents() {
        return this.cache;
    }
}
