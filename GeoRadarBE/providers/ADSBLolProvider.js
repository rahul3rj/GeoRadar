import fetch from 'node-fetch';
import { parseADSBxFormat } from './ADSBxFormatParser.js';

export class ADSBLolProvider {
    constructor() {
        this.name = 'adsb_lol';
        this.baseUrl = 'https://api.adsb.lol/v2';
    }

    async fetchFlights() {
        const urls = [
            `${this.baseUrl}/mil`,
            `${this.baseUrl}/ladd`,
            `${this.baseUrl}/point/40/-100/250`, // North America
            `${this.baseUrl}/point/-15/-60/250`, // South America
            `${this.baseUrl}/point/50/10/250`,   // Europe
            `${this.baseUrl}/point/0/20/250`,    // Africa
            `${this.baseUrl}/point/25/45/250`,   // Middle East
            `${this.baseUrl}/point/20/80/250`,   // South Asia
            `${this.baseUrl}/point/35/115/250`,  // East Asia
            `${this.baseUrl}/point/-25/135/250`  // Australia
        ];

        const allAircraft = [];
        let hasError = false;
        let lastStatus = 500;

        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10_000)
                });

                if (res.status === 429 || res.status === 503) {
                    const err = new Error(`HTTP ${res.status}`);
                    err.status = res.status;
                    throw err;
                }

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.ac) {
                        allAircraft.push(...parseADSBxFormat(data.ac));
                    }
                } else {
                    hasError = true;
                    lastStatus = res.status;
                }
            } catch (err) {
                if (err.status === 429 || err.status === 503) throw err;
                hasError = true;
                lastStatus = err.status || 500;
            }
        }

        if (allAircraft.length === 0 && hasError) {
            const err = new Error(`HTTP ${lastStatus}`);
            err.status = lastStatus;
            throw err;
        }

        return allAircraft;
    }
}
