import fetch from 'node-fetch';

export class RSSNewsProvider {
    constructor() {
        this.cachedData = [];
        this.lastFetchTimestamp = 0;
        this.interval = 300000; // 5 minutes
        this.ttl = 300000;
        this.timer = null;
        this.isFetching = false;

        this.feeds = [
            { source: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
            { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
            { source: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' }
        ];
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
        let allEvents = [];

        try {
            for (const feed of this.feeds) {
                try {
                    const res = await fetch(feed.url);
                    if (!res.ok) {
                        if (res.status === 429) console.warn(`RSS rate limit on ${feed.source}`);
                        continue;
                    }

                    const xml = await res.text();
                    // Regex strategy for RSS <item> extraction
                    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

                    for (let i = 0; i < Math.min(items.length, 5); i++) {
                        const item = items[i];
                        const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
                        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);

                        let title = 'Unknown News';
                        if (titleMatch) title = titleMatch[1] || titleMatch[2] || title;
                        const url = linkMatch ? linkMatch[1] : '';

                        const titleLow = title.toLowerCase();
                        let severity = 'info';
                        let type = 'news';

                        if (titleLow.includes('explosion') || titleLow.includes('bomb') || titleLow.includes('attack')) {
                            severity = 'critical'; type = 'conflict';
                        } else if (titleLow.includes('conflict') || titleLow.includes('military') || titleLow.includes('war')) {
                            severity = 'high'; type = 'conflict';
                        } else if (titleLow.includes('protest') || titleLow.includes('riot')) {
                            severity = 'warning'; type = 'protest';
                        } else if (titleLow.includes('earthquake') || titleLow.includes('tsunami') || titleLow.includes('disaster')) {
                            severity = 'critical'; type = 'disaster';
                        }

                        // Filter out non-actionable news if we want, but keeping it broad here
                        if (severity !== 'info') {
                            allEvents.push({
                                id: `rss-${Buffer.from(url).toString('base64').substring(0, 10)}`,
                                type,
                                title: title,
                                severity,
                                message: `[${feed.source}] ${title}`,
                                source: feed.source,
                                url,
                                location: 'Global', // RSS doesn't give lat/lon easily
                                timestamp: Date.now()
                            });
                        }
                    }
                } catch (e) {
                    console.error(`[RSSNewsProvider] Frame fetch failed for ${feed.source}:`, e.message);
                }
            }

            // Sync past timestamps to stop WebSockets
            this.cachedData = allEvents.map(a => {
                const existing = this.cachedData.find(c => c.id === a.id);
                if (existing) a.timestamp = existing.timestamp;
                return a;
            });
            this.lastFetchTimestamp = Date.now();
            return this.cachedData;

        } catch (err) {
            console.error('[RSSNewsProvider] Global fetch failed:', err.message);
            return this.cachedData;
        } finally {
            this.isFetching = false;
        }
    }

    async getEvents() {
        return this.cachedData;
    }
}
