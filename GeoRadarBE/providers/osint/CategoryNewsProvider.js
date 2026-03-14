import fetch from 'node-fetch';

export class CategoryNewsProvider {
    constructor() {
        this.cache = {
            global: [],
            tech: [],
            market: [],
            space: [],
            climate: []
        };
        this.localCache = {}; // keyed by country code
        this.lastFetchTimestamp = 0;
        this.interval = 300000; // 5 minutes
        this.ttl = 300000;
        this.timer = null;
        this.isFetching = false;
        this.localFetching = new Set();

        this.MAX_PER_CATEGORY = 10;

        this.feeds = {
            global: [
                { source: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
                { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
                { source: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' }
            ],
            tech: [
                { source: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
                { source: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' }
            ],
            market: [
                { source: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
                { source: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' }
            ],
            space: [
                { source: 'NASA', url: 'https://www.nasa.gov/news-release/feed/' },
                { source: 'Space.com', url: 'https://www.space.com/feeds/all' }
            ],
            climate: [
                { source: 'ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml' },
                { source: 'GDACS', url: 'https://www.gdacs.org/xml/rss.xml' }
            ]
        };
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        if (this.isFetching) return;

        const now = Date.now();
        if (now - this.lastFetchTimestamp < this.ttl && this.cache.global.length > 0) {
            return;
        }

        this.isFetching = true;

        try {
            for (const [category, feeds] of Object.entries(this.feeds)) {
                const items = [];

                for (const feed of feeds) {
                    try {
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 10000);
                        const res = await fetch(feed.url, { signal: controller.signal });
                        clearTimeout(timer);
                        if (!res.ok) {
                            if (res.status === 429) console.warn(`[CategoryNews] Rate limit on ${feed.source}`);
                            continue;
                        }

                        const xml = await res.text();
                        const parsed = this.parseRSSItems(xml, feed.source, category);
                        items.push(...parsed);
                    } catch (e) {
                        console.error(`[CategoryNews] Fetch failed for ${feed.source}:`, e.message);
                    }
                }

                // Sort by pubDate descending, cap at MAX_PER_CATEGORY
                items.sort((a, b) => (b.pubDateMs || 0) - (a.pubDateMs || 0));
                this.cache[category] = items.slice(0, this.MAX_PER_CATEGORY);
            }

            this.lastFetchTimestamp = Date.now();

            // Feed health summary
            const summary = Object.entries(this.cache).map(([cat, items]) => `${cat}:${items.length}`).join(', ');
            console.log(`[CategoryNews] Fetch complete — ${summary}`);
            for (const [cat, items] of Object.entries(this.cache)) {
                if (items.length === 0) {
                    console.warn(`[CategoryNews] ⚠️ 0 items for category "${cat}" — feeds may be offline or blocked`);
                }
            }
        } catch (err) {
            console.error('[CategoryNews] Global fetch error:', err.message);
        } finally {
            this.isFetching = false;
        }
    }

    async fetchLocalNews(countryCode) {
        const code = (countryCode || '').toUpperCase();
        if (!code || code.length !== 2) return [];

        if (this.localFetching.has(code)) return this.localCache[code] || [];
        this.localFetching.add(code);

        try {
            const url = `https://news.google.com/rss?hl=en&gl=${code}&ceid=${code}:en`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) {
                console.warn(`[CategoryNews] Local news fetch failed for ${code}: ${res.status}`);
                return this.localCache[code] || [];
            }

            const xml = await res.text();
            const items = this.parseRSSItems(xml, `Local (${code})`, 'local');

            items.sort((a, b) => (b.pubDateMs || 0) - (a.pubDateMs || 0));
            this.localCache[code] = items.slice(0, this.MAX_PER_CATEGORY);
            return this.localCache[code];
        } catch (e) {
            console.error(`[CategoryNews] Local news error for ${code}:`, e.message);
            return this.localCache[code] || [];
        } finally {
            this.localFetching.delete(code);
        }
    }

    parseRSSItems(xml, source, category) {
        const items = [];

        // Try RSS <item> format first
        let itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

        // Fallback to Atom <entry> format
        if (itemBlocks.length === 0) {
            itemBlocks = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
        }

        for (let i = 0; i < Math.min(itemBlocks.length, 10); i++) {
            const block = itemBlocks[i];

            // Extract title (handles CDATA and plain)
            const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
            let title = 'Untitled';
            if (titleMatch) title = (titleMatch[1] || titleMatch[2] || title).trim();

            // Extract link (RSS <link> or Atom <link href="">)
            const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/) || block.match(/<link[^>]+href=["']([^"']+)["']/);
            const url = linkMatch ? (linkMatch[1] || '').trim() : '';

            // Extract pubDate
            const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || block.match(/<published>([\s\S]*?)<\/published>/) || block.match(/<updated>([\s\S]*?)<\/updated>/);
            const pubDate = pubDateMatch ? pubDateMatch[1].trim() : null;
            const pubDateMs = pubDate ? new Date(pubDate).getTime() : 0;

            const id = `news-${category}-${Buffer.from(url || title).toString('base64').substring(0, 12)}`;

            items.push({
                id,
                category,
                title,
                source,
                url,
                pubDate,
                pubDateMs,
                timestamp: Date.now()
            });
        }

        return items;
    }

    async getNews(category) {
        return this.cache[category] || [];
    }

    async getLocalNews(countryCode) {
        const code = (countryCode || '').toUpperCase();
        if (!this.localCache[code] || this.localCache[code].length === 0) {
            await this.fetchLocalNews(code);
        }
        return this.localCache[code] || [];
    }

    // Empty — this provider does NOT participate in broadcastSignals pipeline
    async getEvents() {
        return [];
    }
}
