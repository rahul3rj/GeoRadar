import fs from 'fs';
import path from 'path';

/**
 * ACLEDIngestor — Parses ACLED weekly CSV exports and stores them in MongoDB.
 * 
 * Workflow:
 * 1. Read CSV from datasets/acled_latest.csv
 * 2. Parse all fields into structured JSON
 * 3. Deduplicate by event_id_cnty
 * 4. Upsert into MongoDB conflict_events collection
 * 5. Also saves a JSON cache for file-based fallback
 */
export class ACLEDIngestor {
    constructor(db = null) {
        this.db = db;
        this.csvDir = path.join(process.cwd(), 'datasets');
        this.csvFile = path.join(this.csvDir, 'acled_latest.csv');
        this.cacheFile = path.join(this.csvDir, 'acled_cache.json');
    }

    /**
     * Parse a CSV file into structured event objects.
     * Handles quoted fields with commas and newlines.
     */
    parseCSV(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`CSV file not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

        // Parse header row
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
        console.log(`[ACLEDIngestor] CSV headers: ${headers.slice(0, 10).join(', ')}...`);

        const events = [];

        for (let i = 1; i < lines.length; i++) {
            try {
                // Handle quoted fields containing commas
                const row = lines[i]
                    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
                    .map(v => v.trim().replace(/^"|"$/g, ''));

                const raw = {};
                headers.forEach((h, idx) => {
                    raw[h] = row[idx] || '';
                });

                // Map to standardized structure
                const event = {
                    event_id: raw.event_id_cnty || raw.data_id || `acled_${i}`,
                    event_id_cnty: raw.event_id_cnty || '',
                    data_id: raw.data_id || '',
                    iso: parseInt(raw.iso) || 0,
                    event_date: raw.event_date || '',
                    year: parseInt(raw.year) || new Date().getFullYear(),
                    time_precision: parseInt(raw.time_precision) || 0,
                    disorder_type: raw.disorder_type || '',
                    event_type: raw.event_type || '',
                    sub_event_type: raw.sub_event_type || '',
                    actor1: raw.actor1 || '',
                    assoc_actor_1: raw.assoc_actor_1 || '',
                    inter1: parseInt(raw.inter1) || 0,
                    actor2: raw.actor2 || '',
                    assoc_actor_2: raw.assoc_actor_2 || '',
                    inter2: parseInt(raw.inter2) || 0,
                    interaction: parseInt(raw.interaction) || 0,
                    civilian_targeting: raw.civilian_targeting || '',
                    country: raw.country || '',
                    region: raw.admin1 || raw.region || '',
                    admin1: raw.admin1 || '',
                    admin2: raw.admin2 || '',
                    admin3: raw.admin3 || '',
                    location: raw.location || '',
                    latitude: parseFloat(raw.latitude) || 0,
                    longitude: parseFloat(raw.longitude) || 0,
                    geo_precision: parseInt(raw.geo_precision) || 0,
                    source: raw.source || '',
                    source_scale: raw.source_scale || '',
                    notes: raw.notes || '',
                    fatalities: parseInt(raw.fatalities) || 0,
                    tags: raw.tags || '',
                    timestamp: raw.event_date ? new Date(raw.event_date).getTime() : Date.now(),
                    ingested_at: new Date().toISOString(),
                    // Severity classification
                    severity: this.classifySeverity(raw.event_type, parseInt(raw.fatalities) || 0)
                };

                // Skip events with no valid coordinates
                if (event.latitude === 0 && event.longitude === 0) continue;

                events.push(event);
            } catch (e) {
                // Skip malformed rows silently
                continue;
            }
        }

        console.log(`[ACLEDIngestor] Parsed ${events.length} events from ${lines.length - 1} CSV rows`);
        return events;
    }

    /**
     * Classify event severity based on type and fatalities.
     * Maps to the color system: green/yellow/orange/red
     */
    classifySeverity(eventType, fatalities) {
        const type = (eventType || '').toLowerCase();

        // Red: Explosions, remote violence, violence against civilians
        if (type.includes('explosion') || type.includes('remote violence') || type.includes('violence against civilians')) {
            return fatalities > 10 ? 'critical' : 'high';
        }
        // Orange: Battles, armed clashes
        if (type.includes('battle')) {
            return fatalities > 5 ? 'high' : 'medium';
        }
        // Yellow: Riots
        if (type.includes('riot')) {
            return 'medium';
        }
        // Green: Protests, strategic developments
        if (type.includes('protest') || type.includes('strategic')) {
            return 'low';
        }

        return fatalities > 0 ? 'medium' : 'low';
    }

    /**
     * Insert parsed events into MongoDB.
     * Uses upsert to prevent duplicates based on event_id.
     */
    async insertToMongo(events) {
        if (!this.db) {
            console.warn('[ACLEDIngestor] MongoDB not connected — skipping database insert');
            return { inserted: 0, updated: 0 };
        }

        const col = this.db.collection('conflict_events');
        let inserted = 0;
        let updated = 0;

        // Batch upsert using bulkWrite
        const ops = events.map(event => ({
            updateOne: {
                filter: { event_id: event.event_id },
                update: { $set: event },
                upsert: true
            }
        }));

        // Process in batches of 500
        for (let i = 0; i < ops.length; i += 500) {
            const batch = ops.slice(i, i + 500);
            try {
                const result = await col.bulkWrite(batch, { ordered: false });
                inserted += result.upsertedCount || 0;
                updated += result.modifiedCount || 0;
            } catch (e) {
                console.error(`[ACLEDIngestor] Batch ${Math.floor(i / 500) + 1} error:`, e.message);
            }
        }

        console.log(`[ACLEDIngestor] MongoDB: ${inserted} inserted, ${updated} updated`);
        return { inserted, updated };
    }

    /**
     * Save events to JSON cache file (file-based fallback)
     */
    saveToCache(events) {
        try {
            const data = {
                timestamp: Date.now(),
                fetchedAt: new Date().toISOString(),
                eventCount: events.length,
                events: events.map(e => ({
                    type: 'acled_event',
                    event_id_cnty: e.event_id_cnty,
                    actor1: e.actor1,
                    actor2: e.actor2,
                    country: e.country,
                    region: e.region,
                    event_type: e.event_type,
                    sub_event_type: e.sub_event_type,
                    latitude: e.latitude,
                    longitude: e.longitude,
                    fatalities: e.fatalities,
                    notes: e.notes,
                    event_date: e.event_date,
                    timestamp: e.timestamp,
                    severity: e.severity
                }))
            };
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
            console.log(`[ACLEDIngestor] Saved ${events.length} events to JSON cache`);
        } catch (e) {
            console.error('[ACLEDIngestor] Cache save error:', e.message);
        }
    }

    /**
     * Run the full ingestion pipeline:
     * 1. Parse CSV
     * 2. Insert to MongoDB
     * 3. Save JSON cache backup
     */
    async ingest(csvPath = null) {
        const filePath = csvPath || this.csvFile;
        console.log(`[ACLEDIngestor] Starting ingestion from: ${filePath}`);

        try {
            const events = this.parseCSV(filePath);

            if (events.length === 0) {
                console.warn('[ACLEDIngestor] No events parsed from CSV');
                return { success: false, reason: 'No events in CSV' };
            }

            // Insert to MongoDB
            const mongoResult = await this.insertToMongo(events);

            // Save JSON cache backup
            this.saveToCache(events);

            const result = {
                success: true,
                totalParsed: events.length,
                mongoInserted: mongoResult.inserted,
                mongoUpdated: mongoResult.updated,
                countries: [...new Set(events.map(e => e.country))].length,
                dateRange: {
                    from: events.reduce((min, e) => e.event_date < min ? e.event_date : min, events[0].event_date),
                    to: events.reduce((max, e) => e.event_date > max ? e.event_date : max, events[0].event_date)
                },
                totalFatalities: events.reduce((sum, e) => sum + e.fatalities, 0)
            };

            console.log(`[ACLEDIngestor] ✅ Ingestion complete:`, JSON.stringify(result, null, 2));
            return result;

        } catch (e) {
            console.error(`[ACLEDIngestor] ❌ Ingestion failed: ${e.message}`);
            return { success: false, reason: e.message };
        }
    }
}
