import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class ACLEDProvider {
    constructor(mongoDb = null) {
        this.cacheFile = path.join(process.cwd(), 'datasets', 'acled_cache.json');
        this.csvFile = path.join(process.cwd(), 'datasets', 'acled_latest.csv');
        this.mockFile = path.join(process.cwd(), 'datasets', 'acled_mock.json');

        this.email = process.env.ACLED_EMAIL ? process.env.ACLED_EMAIL.trim() : null;
        this.password = process.env.ACLED_PASSWORD ? process.env.ACLED_PASSWORD.trim() : null;

        this.accessToken = null;
        this.tokenExpiry = 0;
        this.db = mongoDb; // MongoDB reference (optional)

        this.eventsCache = [];
        this.interval = 12 * 60 * 60 * 1000; // 12 hours
        this.timer = null;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async getACLEDToken() {
        this.email = process.env.ACLED_EMAIL ? process.env.ACLED_EMAIL.trim() : this.email;
        this.password = process.env.ACLED_PASSWORD ? process.env.ACLED_PASSWORD.trim() : this.password;

        if (!this.email || !this.password) {
            throw new Error('ACLED_EMAIL or ACLED_PASSWORD missing');
        }

        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const body = new URLSearchParams();
        body.append('username', this.email);
        body.append('password', this.password);
        body.append('grant_type', 'password');
        body.append('client_id', 'acled');

        const res = await fetch('https://acleddata.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) {
            throw new Error(`Failed to get token: HTTP ${res.status}`);
        }

        const data = await res.json();
        this.accessToken = data.access_token;
        const expiresIn = data.expires_in || 3600;
        this.tokenExpiry = Date.now() + (expiresIn - 60) * 1000;

        console.log('[ACLED] OAuth token acquired');
        return this.accessToken;
    }

    async fetchACLEDData(token) {
        console.log('[ACLED] Fetching conflict events from API');
        const res = await fetch('https://api.acleddata.com/acled/read?limit=500', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error(`API returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data || !Array.isArray(data.data)) {
            throw new Error('Invalid API response format');
        }

        return this.normalizeEvents(data.data);
    }

    normalizeEvents(rawEvents) {
        const now = Date.now();
        return rawEvents.map(event => ({
            type: 'acled_event',
            event_id_cnty: event.event_id_cnty || event.data_id || '',
            actor1: event.actor1 || '',
            actor2: event.actor2 || '',
            country: event.country || '',
            region: event.admin1 || event.region || '',
            event_type: event.event_type || '',
            sub_event_type: event.sub_event_type || '',
            latitude: parseFloat(event.latitude) || 0,
            longitude: parseFloat(event.longitude) || 0,
            fatalities: parseInt(event.fatalities) || 0,
            notes: event.notes || '',
            event_date: event.event_date || '',
            timestamp: event.event_date ? new Date(event.event_date).getTime() : now
        }));
    }

    loadCSVData() {
        if (!fs.existsSync(this.csvFile)) {
            throw new Error(`CSV file not found: ${this.csvFile}`);
        }

        const content = fs.readFileSync(this.csvFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) throw new Error('CSV file is empty or missing headers');

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const events = [];

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Simple CSV parser
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
            const event = {};
            headers.forEach((h, index) => {
                event[h] = row[index] || '';
            });

            if (event.event_date) {
                const eventDate = new Date(event.event_date);
                if (eventDate >= oneDayAgo) {
                    events.push(event);
                }
            } else {
                events.push(event);
            }
        }

        return this.normalizeEvents(events);
    }

    saveToCache(events) {
        try {
            const data = {
                timestamp: Date.now(),
                events
            };
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[ACLED] Failed to save cache:', e.message);
        }
    }

    loadCachedData() {
        if (!fs.existsSync(this.cacheFile)) {
            throw new Error(`Cache file not found: ${this.cacheFile}`);
        }
        const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        if (!data || !Array.isArray(data.events)) {
            throw new Error('Invalid cache format');
        }
        return data.events;
    }

    /**
     * Try loading from MongoDB if available
     */
    async loadFromMongo() {
        if (!this.db) throw new Error('MongoDB not connected');

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const col = this.db.collection('conflict_events');
        const docs = await col.find({
            event_date: { $gte: thirtyDaysAgo.toISOString().split('T')[0] }
        }).sort({ event_date: -1 }).limit(2000).toArray();

        if (!docs || docs.length === 0) {
            throw new Error('No events in MongoDB');
        }

        console.log(`[ACLED] Loaded ${docs.length} events from MongoDB`);
        return docs.map(d => ({
            type: 'acled_event',
            event_id_cnty: d.event_id_cnty || d.event_id || '',
            actor1: d.actor1 || '',
            actor2: d.actor2 || '',
            country: d.country || '',
            region: d.region || '',
            event_type: d.event_type || '',
            sub_event_type: d.sub_event_type || '',
            latitude: d.latitude || 0,
            longitude: d.longitude || 0,
            fatalities: d.fatalities || 0,
            notes: d.notes || '',
            event_date: d.event_date || '',
            timestamp: d.event_date ? new Date(d.event_date).getTime() : Date.now()
        }));
    }

    loadMockData() {
        if (!fs.existsSync(this.mockFile)) {
            console.warn('[ACLED] Mock file also not found! Returning empty array.');
            return [];
        }
        const data = JSON.parse(fs.readFileSync(this.mockFile, 'utf8'));
        return this.normalizeEvents(data.data || []);
    }

    async fetchData() {
        let events = null;

        // Strategy 1: MongoDB (if connected)
        try {
            events = await this.loadFromMongo();
        } catch (mongoError) {
            // Strategy 2: ACLED API (if credentials work)
            try {
                const token = await this.getACLEDToken();
                events = await this.fetchACLEDData(token);
                this.saveToCache(events);
            } catch (apiError) {
                console.error(`[ACLED] API failed → loading CSV dataset. Reason: ${apiError.message}`);

                // Strategy 3: CSV fallback
                try {
                    events = this.loadCSVData();
                    this.saveToCache(events);
                } catch (csvError) {
                    console.error(`[ACLED] CSV failed → loading cached data. Reason: ${csvError.message}`);

                    // Strategy 4: Cache fallback
                    try {
                        events = this.loadCachedData();
                    } catch (cacheError) {
                        console.error(`[ACLED] Cache unavailable → loading mock dataset. Reason: ${cacheError.message}`);
                        // Strategy 5: Mock data
                        events = this.loadMockData();
                    }
                }
            }
        }

        if (events) {
            this.eventsCache = events;
        }
    }

    async getEvents() {
        if (this.eventsCache.length === 0) {
            await this.fetchData();
        }
        return this.eventsCache;
    }
}
