import fetch from 'node-fetch';

export class WeatherProvider {
    constructor() {
        this.cache = [];
        this.interval = 5 * 60 * 1000; // 5 minutes
        this.timer = null;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        const cities = [
            { name: 'Tokyo', lat: 35.6895, lon: 139.6917 },
            { name: 'New York', lat: 40.7128, lon: -74.0060 },
            { name: 'London', lat: 51.5074, lon: -0.1278 },
            { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
            { name: 'Mumbai', lat: 19.0760, lon: 72.8777 }
        ];

        let alerts = [];

        try {
            for (const city of cities) {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current_weather=true`;
                const res = await fetch(url);
                if (!res.ok) continue;

                const data = await res.json();
                const cw = data.current_weather;

                if (cw) {
                    if (cw.weathercode >= 95 || cw.windspeed > 40) {
                        alerts.push({
                            id: `weather-${city.name.replace(/\s/g, '')}`,
                            type: 'weather',
                            severity: cw.windspeed > 60 ? 'critical' : 'warning',
                            message: `Storm Alert: Severe conditions detected in ${city.name} (Wind: ${cw.windspeed} km/h)`,
                            location: city.name,
                            timestamp: Date.now()
                        });
                    }
                }
            }

            // Keep stable timestamps for existing ones to prevent rebroadcast spam
            this.cache = alerts.map(a => {
                const existing = this.cache.find(c => c.id === a.id);
                if (existing && existing.severity === a.severity) {
                    a.timestamp = existing.timestamp;
                }
                return a;
            });
        } catch (err) {
            console.error('[WeatherProvider] Fetch failed:', err.message);
        }
    }

    async getEvents() {
        return this.cache;
    }
}
