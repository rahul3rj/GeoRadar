import fetch from 'node-fetch';
import { parseADSBxFormat } from './ADSBxFormatParser.js';

export class ADSBExchangeProvider {
    constructor() {
        this.name = 'adsbexchange';
        this.apiKey = process.env.ADSBEXCHANGE_API_KEY;
        this.baseUrl = 'https://api.adsbexchange.com/v2';
    }

    async fetchFlights() {
        if (!this.apiKey) {
            const err = new Error("Missing ADSBEXCHANGE_API_KEY in .env");
            err.status = 401;
            throw err;
        }

        const urls = [
            `${this.baseUrl}/mil`,
            `${this.baseUrl}/ladd`,
            `${this.baseUrl}/lat/40.71/lon/-74.00/dist/250`, // NY
            `${this.baseUrl}/lat/51.50/lon/-0.12/dist/250`,  // London
            `${this.baseUrl}/lat/35.67/lon/139.65/dist/250`, // Tokyo
            `${this.baseUrl}/lat/25.20/lon/55.27/dist/250`   // Dubai
        ];

        const allAircraft = [];
        let hasError = false;
        let lastStatus = 500;

        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    headers: { 'api-auth': this.apiKey },
                    signal: AbortSignal.timeout(10_000)
                });

                if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 503) {
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
                if ([401, 403, 429, 503].includes(err.status)) throw err;
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
