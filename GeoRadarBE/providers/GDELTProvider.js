/**
 * @deprecated This provider is no longer imported in server.js as of v0.6.
 * Superseded by CategoryNewsProvider (multi-category RSS) + NitterOSINTProvider (social media OSINT).
 * Kept for reference only — safe to delete.
 */
import fs from 'fs';
import path from 'path';

export class GDELTProvider {
    constructor() {
        this.cachedData = [];
        this.lastFetchTimestamp = 0;
        this.interval = 900000; // 15 minutes
        this.ttl = 900000; // 15 minutes
        this.timer = null;
        this.isFetching = false;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        if (this.isFetching) {
            return this.cachedData;
        }

        const now = Date.now();
        if (now - this.lastFetchTimestamp < this.interval) {
            return this.cachedData;
        }

        this.isFetching = true;

        try {
            let text = '';
            let fetchUsedMock = false;

            const query = encodeURIComponent('theme:ARMEDCONFLICT OR theme:TERROR OR theme:PROTEST OR theme:MILITARY');
            const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=50&timespan=1d&format=json`;

            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            if (!res.ok) {
                if (res.status === 429) {
                    console.warn('GDELT rate limit reached (HTTP 429) – loading fallback payload');
                    if (this.cachedData.length === 0) {
                        try {
                            const mockPath = path.join(process.cwd(), 'datasets', 'gdelt_mock.json');
                            if (fs.existsSync(mockPath)) {
                                text = fs.readFileSync(mockPath, 'utf8');
                                fetchUsedMock = true;
                            }
                        } catch (e) { }
                    }
                    if (!fetchUsedMock) return this.cachedData;
                } else {
                    throw new Error(`GDELT API HTTP ${res.status}`);
                }
            }

            if (!fetchUsedMock) {
                text = await res.text();
            }
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                // Often a rate limit response arrives as HTML instead of JSON
                console.warn('GDELT rate limit reached – returning cached data / loading fallback');
                if (this.cachedData.length === 0) {
                    try {
                        const mockPath = path.join(process.cwd(), 'datasets', 'gdelt_mock.json');
                        if (fs.existsSync(mockPath)) {
                            const mockText = fs.readFileSync(mockPath, 'utf8');
                            data = JSON.parse(mockText);
                        }
                    } catch (err) { }
                }
                if (!data || !data.articles) return this.cachedData;
            }

            if (!data.articles) {
                return this.cachedData;
            }

            // Sanitize and extract only necessary fields
            const events = data.articles.map(art => ({
                id: art.url || `gdelt-${Math.random()}`,
                type: 'news',
                severity: 'info',
                message: art.title || 'Global event detected',
                title: art.title,
                location: art.domain || 'Global',
                source: art.seendate || 'Unknown',
                url: art.url || '',
                timestamp: Date.now(),
                sourcecountry: art.sourcecountry || art.domain || 'Unknown',
                seendate: art.seendate || Date.now()
            }));

            // Keep stable timestamps for existing ones to prevent rebroadcast spam
            this.cachedData = events.map(a => {
                const existing = this.cachedData.find(c => c.id === a.id);
                if (existing) a.timestamp = existing.timestamp;
                return a;
            });
            this.lastFetchTimestamp = Date.now();
            return this.cachedData;
        } catch (err) {
            console.error('[GDELTProvider] Fetch failed:', err.message);
            return this.cachedData;
        } finally {
            this.isFetching = false;
        }
    }

    async getEvents() {
        return this.cachedData;
    }
}
