const CARGO_PFX = ['FDX', 'UPS', 'GTI', 'CLX', 'CKS', 'ABW', 'GEC', 'SQC', 'CAO', 'BOX', 'ADB', 'MPH', 'ATN', 'MAS', 'ABD', 'ICL', 'TAY', 'QTR', 'ACA', 'GIA', 'ABX', 'MXA', 'NPT', 'PAC', 'POL', 'KAL'];
const MIL_PFX = ['RCH', 'DUKE', 'TOPCT', 'REACH', 'STEEL', 'VIPER', 'RRR', 'CNV', 'IAM', 'EVAC', 'CHAOS', 'NAF', 'PAT', 'ISTRY', 'GOLD', 'COBRA', 'SPAR', 'SAM', 'EXEC', 'DARK', 'HAWK', 'BOLT', 'THUD', 'FURY', 'RAMS'];

export function classify(callsign = '', categoryInt = 0, squawk = '') {
    const cs = callsign.trim().toUpperCase();

    if (['7500', '7600', '7700'].includes(squawk)) return 'emergency';
    if ([8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20].includes(categoryInt)) return 'unknown'; // or null if you want to skip
    if (categoryInt === 7) return 'military';
    if (MIL_PFX.some(p => cs.startsWith(p))) return 'military';
    if (CARGO_PFX.some(p => cs.startsWith(p))) return 'cargo';
    if ([4, 5, 6].includes(categoryInt)) return 'passenger';
    if (categoryInt === 2 || categoryInt === 3) return 'private';
    if (/^[A-Z]{3}\d/.test(cs)) return 'passenger';
    return 'unknown';
}
