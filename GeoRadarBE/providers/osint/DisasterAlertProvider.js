import fetch from 'node-fetch';

export class DisasterAlertProvider {
    constructor() {
        this.cachedData = [];
        this.lastFetchTimestamp = 0;
        this.interval = 300000; // 5 minutes
        this.ttl = 300000;
        this.timer = null;
        this.isFetching = false;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        if (this.isFetching) return this.cachedData;

        const now = Date.now();
        if (now - this.lastFetchTimestamp < this.ttl && this.cachedData.length > 0) {
            return this.cachedData;
        }

        this.isFetching = true;

        try {
            // Using NOAA API for severe public alerts
            const url = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert';
            const res = await fetch(url, { headers: { 'User-Agent': 'GeoRadar/1.0 (georadar@example.com)' } });

            if (!res.ok) {
                if (res.status === 429) {
                    console.warn('DisasterAlertProvider rate limit reached – using cached data');
                    return this.cachedData;
                }
                throw new Error(`NOAA API HTTP ${res.status}`);
            }

            const data = await res.json();
            if (!data.features) return this.cachedData;

            let alerts = [];

            data.features.slice(0, 15).forEach(f => {
                const props = f.properties;
                if (!props) return;

                let severity = 'warning';
                if (props.severity === 'Extreme' || props.severity === 'Severe') severity = 'critical';

                let lat = 0; let lon = 0;
                if (f.geometry && f.geometry.coordinates && f.geometry.type === 'Polygon') {
                    lon = f.geometry.coordinates[0][0][0];
                    lat = f.geometry.coordinates[0][0][1];
                }

                alerts.push({
                    id: props.id || `disaster-${Math.random()}`,
                    type: 'disaster',
                    severity,
                    title: props.event || 'Disaster Alert',
                    message: `[Gov Alert] ${props.headline || props.event}`,
                    location: props.areaDesc || 'Unknown Area',
                    latitude: lat,
                    longitude: lon,
                    source: 'NOAA / FEMA',
                    timestamp: Date.now()
                });
            });

            this.cachedData = alerts.map(a => {
                const existing = this.cachedData.find(c => c.id === a.id);
                if (existing) a.timestamp = existing.timestamp;
                return a;
            });
            this.lastFetchTimestamp = Date.now();
            return this.cachedData;

        } catch (err) {
            console.error('[DisasterAlertProvider] Fetch failed:', err.message);
            return this.cachedData;
        } finally {
            this.isFetching = false;
        }
    }

    async getEvents() {
        return this.cachedData;
    }
}
