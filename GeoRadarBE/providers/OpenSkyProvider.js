import fetch from 'node-fetch';
import { classify } from './utils.js';

export class OpenSkyProvider {
    constructor() {
        this.name = 'opensky';
        this.clientId = process.env.OPENSKY_CLIENT_ID;
        this.clientSecret = process.env.OPENSKY_CLIENT_SECRET;
        this.tokenUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
        this.apiUrl = 'https://opensky-network.org/api/states/all';
        this.accessToken = null;
        this.tokenExpiresAt = 0;
    }

    async getAccessToken() {
        const now = Date.now();
        if (this.accessToken && now < this.tokenExpiresAt - 30_000) {
            return this.accessToken;
        }

        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });

        const res = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            throw new Error(`OpenSky auth error: HTTP ${res.status}`);
        }

        const data = await res.json();
        this.accessToken = data.access_token;
        this.tokenExpiresAt = now + (data.expires_in || 300) * 1000;
        return this.accessToken;
    }

    async fetchFlights() {
        if (!this.clientId || !this.clientSecret) {
            throw new Error('OpenSky credentials missing. Supply OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in .env');
        }

        const regions = [
            `lamin=15&lomin=-170&lamax=75&lomax=-50`,  // North America
            `lamin=-55&lomin=-85&lamax=15&lomax=-30`,  // South America
            `lamin=35&lomin=-10&lamax=70&lomax=40`,    // Europe
            `lamin=-35&lomin=-20&lamax=35&lomax=55`,   // Africa
            `lamin=10&lomin=35&lamax=40&lomax=60`,     // Middle East
            `lamin=5&lomin=60&lamax=35&lomax=100`,     // South Asia
            `lamin=10&lomin=100&lamax=60&lomax=150`,   // East Asia
            `lamin=-50&lomin=110&lamax=-10&lomax=180`  // Australia
        ];

        let token = await this.getAccessToken();
        let allStates = [];
        let hasError = false;
        let lastErrorStatus = 500;

        for (const bbox of regions) {
            const url = `${this.apiUrl}?${bbox}`;
            try {
                let res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: AbortSignal.timeout(15_000),
                });

                if (res.status === 401 || res.status === 403) {
                    this.accessToken = null;
                    this.tokenExpiresAt = 0;
                    token = await this.getAccessToken();
                    res = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${token}` },
                        signal: AbortSignal.timeout(15_000),
                    });
                }

                if (res.status === 429) {
                    const err = new Error(`HTTP ${res.status}`);
                    err.status = res.status;
                    throw err; // bubble up immediately to trigger cooldown
                }

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.states) {
                        allStates.push(...data.states);
                    }
                } else {
                    hasError = true;
                    lastErrorStatus = res.status;
                }
            } catch (err) {
                if (err.status === 429) throw err;
                hasError = true;
                lastErrorStatus = err.status || 500;
            }
        }

        if (allStates.length === 0 && hasError) {
            const err = new Error(`HTTP ${lastErrorStatus}`);
            err.status = lastErrorStatus;
            throw err;
        }

        return allStates.map(s => {
            const callsign = (s[1] || '').trim();
            const catInt = s.length > 17 ? s[17] : 0;
            const squawk = s[14] || '';
            const cat = classify(callsign, catInt, squawk);

            return {
                icao: s[0],
                callsign: callsign,
                lat: s[6],
                lon: s[5],
                altitude: Math.round((s[7] || s[13] || 0) * 3.28084),
                velocity: Math.round((s[9] || 0) * 1.94384),
                heading: s[10] || 0,
                verticalRate: s[11] || 0,
                country: s[2] || '',
                category: cat || 'unknown'
            };
        });
    }
}
