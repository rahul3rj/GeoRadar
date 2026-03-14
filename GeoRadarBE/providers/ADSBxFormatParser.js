import { classify } from './utils.js';

export function parseADSBxFormat(ac) {
    if (!ac || !Array.isArray(ac)) return [];

    return ac.map(f => {
        const callsign = (f.flight || f.callsign || '').trim();
        const squawk = f.squawk || '';
        const catInt = f.category ? parseInt(f.category.replace(/\D/g, ''), 10) : 0;
        let cat = classify(callsign, catInt, squawk);

        // Additional fallback: adsbx 'dbFlags' or 'mil' fields
        if (f.mil || (f.dbFlags && (f.dbFlags & 1))) {
            cat = 'military';
        }

        return {
            icao: f.hex || '',
            callsign: callsign,
            lat: f.lat,
            lon: f.lon,
            altitude: Math.round(parseFloat(f.alt_baro || f.alt_geom || 0)),
            velocity: Math.round(parseFloat(f.gs || f.mach || 0)),
            heading: parseFloat(f.track || f.mag_heading || f.true_heading || 0),
            verticalRate: parseFloat(f.baro_rate || f.geom_rate || 0),
            country: '',
            category: cat || 'unknown'
        };
    });
}
