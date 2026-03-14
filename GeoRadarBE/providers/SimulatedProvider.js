import fs from 'fs';
import path from 'path';

export class SimulatedProvider {
    constructor() {
        this.name = 'simulated';
        this.airportsFile = path.join(process.cwd(), 'data', 'airports.dat');
        this.routesFile = path.join(process.cwd(), 'data', 'routes.dat');
        this.airports = {};
        this.routes = [];
        this.simulatedFlights = [];
        this.loaded = false;

        // Settings for simulation
        this.maxSimulated = 300;
    }

    async loadData() {
        if (this.loaded) return;

        try {
            // Parse airports
            const airportData = fs.readFileSync(this.airportsFile, 'utf8');
            const lines = airportData.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                // e.g. 1,"Goroka Airport","Goroka","Papua New Guinea","GKA","AYGA",-6.081689834590001,145.391998291,5282,10,"U","Pacific/Port_Moresby","airport","OurAirports"
                const parts = line.split(',');
                if (parts.length < 9) continue;

                // Usually IATA is at index 4 and it's surrounded by quotes
                const iata = parts[4].replace(/"/g, '').trim();
                const lat = parseFloat(parts[6]);
                const lon = parseFloat(parts[7]);

                if (iata && !isNaN(lat) && !isNaN(lon)) {
                    this.airports[iata] = { lat, lon };
                }
            }

            // Parse routes
            const routeData = fs.readFileSync(this.routesFile, 'utf8');
            const routeLines = routeData.split('\n');
            for (const line of routeLines) {
                if (!line.trim()) continue;
                // e.g. 2B,410,AER,2965,KZN,2990,,0,CR2
                const parts = line.split(',');
                if (parts.length < 5) continue;

                const srcIata = parts[2].trim();
                const dstIata = parts[4].trim();
                const airline = parts[0].trim();

                const src = this.airports[srcIata];
                const dst = this.airports[dstIata];

                if (src && dst) {
                    this.routes.push({
                        airline: airline || 'UNK',
                        originIata: srcIata,
                        destIata: dstIata,
                        originLat: src.lat,
                        originLon: src.lon,
                        destLat: dst.lat,
                        destLon: dst.lon
                    });
                }
            }

            this.loaded = true;
            this.initializeSimulation();

            console.log(`[SimulatedProvider] Loaded ${Object.keys(this.airports).length} airports and ${this.routes.length} routes.`);
        } catch (err) {
            console.error('[SimulatedProvider] Failed to load OpenFlights data. Ensure data/routes.dat and data/airports.dat exist.');
            throw err;
        }
    }

    initializeSimulation() {
        if (this.routes.length === 0) return;
        this.simulatedFlights = [];

        for (let i = 0; i < this.maxSimulated; i++) {
            this.simulatedFlights.push(this.createRandomFlight(i));
        }
    }

    createRandomFlight(id) {
        // Pick a random route
        const route = this.routes[Math.floor(Math.random() * this.routes.length)];

        // Random progress along route 0.0 to 1.0
        const progress = Math.random();

        // Roughly interpolate position
        const lat = route.originLat + (route.destLat - route.originLat) * progress;
        const lon = route.originLon + (route.destLon - route.originLon) * progress;

        // Heading calculation (simplified bearing)
        const rad1 = route.originLat * Math.PI / 180;
        const rad2 = route.destLat * Math.PI / 180;
        const dLon = (route.destLon - route.originLon) * Math.PI / 180;

        const y = Math.sin(dLon) * Math.cos(rad2);
        const x = Math.cos(rad1) * Math.sin(rad2) - Math.sin(rad1) * Math.cos(rad2) * Math.cos(dLon);
        let heading = Math.atan2(y, x) * 180 / Math.PI;
        heading = (heading + 360) % 360;

        return {
            id: id,
            route: route,
            progress: progress,
            lat: lat,
            lon: lon,
            heading: heading,
            velocity: 450 + Math.random() * 50, // 450-500 knots
            altitude: 30000 + Math.random() * 8000,
            callsign: route.airline + Math.floor(Math.random() * 9999),
            icao: 'SIM' + id.toString().padStart(3, '0')
        };
    }

    updateSimulation() {
        // Step simulation forward slightly
        const deltaProgress = 0.005; // speed factor

        for (let i = 0; i < this.simulatedFlights.length; i++) {
            let flight = this.simulatedFlights[i];
            flight.progress += deltaProgress;

            if (flight.progress >= 1.0) {
                // Plane finished route, respawn a new one
                this.simulatedFlights[i] = this.createRandomFlight(flight.id);
                continue;
            }

            const route = flight.route;
            flight.lat = route.originLat + (route.destLat - route.originLat) * flight.progress;
            flight.lon = route.originLon + (route.destLon - route.originLon) * flight.progress;
        }
    }

    async fetchFlights() {
        await this.loadData();
        this.updateSimulation();

        return this.simulatedFlights.map(f => {
            return {
                icao: f.icao,
                callsign: f.callsign,
                lat: f.lat,
                lon: f.lon,
                altitude: Math.round(f.altitude),
                velocity: Math.round(f.velocity),
                heading: Math.round(f.heading),
                verticalRate: 0,
                country: 'Simulated',
                category: 'passenger' // openflights mostly passenger routes
            };
        });
    }
}
