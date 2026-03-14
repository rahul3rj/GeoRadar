export class ConflictProvider {
    constructor(providers) {
        this.providers = providers || [];
        this.cache = [];
        this.interval = 5 * 60 * 1000;
        this.timer = null;
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        if (this.cache.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const targetProviders = ['RSSNewsProvider', 'DisasterAlertProvider'];

        let allEvents = [];
        for (const p of this.providers) {
            if (p && p.constructor && targetProviders.includes(p.constructor.name)) {
                try {
                    const evts = await p.getEvents();
                    if (evts && evts.length > 0) {
                        allEvents.push(...evts);
                    }
                } catch (e) {
                    // Ignore errors to maintain polling stability
                }
            }
        }

        const keywords = ['war', 'conflict', 'military strike', 'airstrike', 'battle', 'invasion', 'troops deployed', 'armed clashes', 'missile attack', 'bombing'];

        let conflicts = [];
        for (const e of allEvents) {
            const text = ((e.title || '') + ' ' + (e.message || '')).toLowerCase();
            let matched = false;
            for (const kw of keywords) {
                if (text.includes(kw)) {
                    matched = true;
                    break;
                }
            }

            if (matched) {
                let severity = 'low';
                if (text.includes('missile attack') || text.includes('bombing')) severity = 'high';
                else if (text.includes('military clashes') || text.includes('troops deployed') || text.includes('armed clashes')) severity = 'medium';
                else if (text.includes('political tension')) severity = 'low';
                else severity = 'medium';

                conflicts.push({
                    id: e.id || `conflict-${Math.random()}`,
                    type: 'conflict_event',
                    title: e.title || e.message || 'Unknown Conflict',
                    region: e.location || e.country || 'Unknown Region',
                    country: e.country || e.location || 'Unknown',
                    timestamp: e.timestamp || Date.now(),
                    severity: severity,
                    coordinates: e.coordinates || null
                });
            }
        }

        this.cache = conflicts;
    }

    async getEvents() {
        return this.cache;
    }
}
