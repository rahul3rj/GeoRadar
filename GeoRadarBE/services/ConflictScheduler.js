import cron from 'node-cron';
import { ACLEDIngestor } from './ACLEDIngestor.js';

/**
 * ConflictScheduler — Runs the ACLED ingestion pipeline on a weekly schedule.
 * 
 * Default: Every Monday at 06:00 AM (server time)
 * ACLED publishes weekly updates on Mondays/Tuesdays.
 * 
 * Can also be triggered manually via the /api/conflicts/ingest endpoint.
 */
export class ConflictScheduler {
    constructor(db = null) {
        this.db = db;
        this.ingestor = new ACLEDIngestor(db);
        this.cronJob = null;
        this.lastRun = null;
        this.lastResult = null;
    }

    /**
     * Start the weekly cron job.
     * Schedule: Every Monday at 06:00 AM
     * Cron format: minute hour dayOfMonth month dayOfWeek
     */
    start() {
        // Run at 06:00 every Monday (day 1)
        this.cronJob = cron.schedule('0 6 * * 1', async () => {
            console.log('[ConflictScheduler] ⏰ Weekly ACLED ingestion triggered');
            await this.runIngestion();
        }, {
            scheduled: true,
            timezone: 'Asia/Kolkata' // IST
        });

        console.log('[ConflictScheduler] ✅ Scheduled: Every Monday at 06:00 AM IST');

        // Also run immediately on startup if no recent data exists
        this.runStartupCheck();
    }

    /**
     * Check if we need to ingest on startup
     * (e.g., if no data exists yet or data is > 7 days old)
     */
    async runStartupCheck() {
        if (!this.db) {
            console.log('[ConflictScheduler] No MongoDB — running file-based ingestion on startup');
            await this.runIngestion();
            return;
        }

        try {
            const col = this.db.collection('conflict_events');
            const count = await col.countDocuments();
            
            if (count === 0) {
                console.log('[ConflictScheduler] Empty database — running initial ingestion');
                await this.runIngestion();
                return;
            }

            // Check if latest event is > 7 days old
            const latest = await col.findOne({}, { sort: { event_date: -1 } });
            if (latest && latest.event_date) {
                const latestDate = new Date(latest.event_date);
                const daysOld = (Date.now() - latestDate.getTime()) / (24 * 60 * 60 * 1000);
                if (daysOld > 7) {
                    console.log(`[ConflictScheduler] Data is ${Math.round(daysOld)} days old — running ingestion`);
                    await this.runIngestion();
                } else {
                    console.log(`[ConflictScheduler] Data is ${Math.round(daysOld)} days old — skipping startup ingestion`);
                }
            }
        } catch (e) {
            console.error('[ConflictScheduler] Startup check error:', e.message);
            await this.runIngestion();
        }
    }

    /**
     * Run the ingestion pipeline
     */
    async runIngestion(csvPath = null) {
        this.lastRun = new Date().toISOString();
        try {
            this.lastResult = await this.ingestor.ingest(csvPath);
            return this.lastResult;
        } catch (e) {
            this.lastResult = { success: false, reason: e.message };
            return this.lastResult;
        }
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            scheduled: !!this.cronJob,
            schedule: 'Every Monday at 06:00 AM IST',
            lastRun: this.lastRun,
            lastResult: this.lastResult
        };
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }
    }
}
