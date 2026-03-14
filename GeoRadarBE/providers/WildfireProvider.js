import fetch from 'node-fetch';

export class WildfireProvider {
    constructor() {
        this.cache = [];
        this.interval = 10 * 60 * 1000; // 10 minutes
        this.timer = null;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        try {
            const url = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`NASA FIRMS API HTTP ${res.status}`);

            const csv = await res.text();
            const lines = csv.split('\n').slice(1);
            let events = [];

            for (const line of lines) {
                if (!line || line.trim() === '') continue;
                const cols = line.split(',');
                if (cols.length < 10) continue;

                const lat = parseFloat(cols[0]);
                const lon = parseFloat(cols[1]);
                const brightness = parseFloat(cols[2]);
                const confidence = cols[9];
                const isHighConfidence = parseInt(confidence) > 90 || confidence === 'h';

                if (isHighConfidence && brightness > 330) {
                    events.push({
                        id: `fire-${lat.toFixed(1)}-${lon.toFixed(1)}`,
                        type: 'wildfire',
                        severity: 'warning',
                        message: `Wildfire detected at [${lat.toFixed(2)}, ${lon.toFixed(2)}]`,
                        location: `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`,
                        timestamp: Date.now()
                    });
                }
            }
            events = events.slice(0, 15);

            // Keep stable timestamps for existing ones to prevent rebroadcast spam
            this.cache = events.map(a => {
                const existing = this.cache.find(c => c.id === a.id);
                if (existing) a.timestamp = existing.timestamp;
                return a;
            });
        } catch (err) {
            console.error('[WildfireProvider] Fetch failed:', err.message);
        }
    }

    async getEvents() {
        return this.cache;
    }
}
