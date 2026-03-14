import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from './Globe';

/* ═══════════════════════════════════════════════════════
   Configuration
   ═══════════════════════════════════════════════════════ */
const isLocal = window.location.hostname === 'localhost';
const API_URL = isLocal ? 'http://localhost:4000/api/flights' : '/api/flights';
const POLL_INTERVAL = 20000;

const COLORS = {
    passenger: '#00c8ff',
    cargo: '#e67e22',
    military: '#ff3232',
    private: '#a050ff',
    emergency: '#ffdc00',
    unknown: '#777777',
};

const LABELS = {
    passenger: 'PASSENGER',
    cargo: 'CARGO',
    military: 'MILITARY',
    private: 'PRIVATE',
    emergency: 'EMERGENCY',
    unknown: 'UNKNOWN',
};

/* ═══════════════════════════════════════════════════════
   GeoJSON builder
   ═══════════════════════════════════════════════════════ */
function toGeoJSON(flights) {
    return {
        type: 'FeatureCollection',
        features: (flights || [])
            .filter(f => f.category !== 'private')
            .map((f, i) => ({
                type: 'Feature',
                id: i,
                geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
                properties: {
                    callsign: f.callsign,
                    flightType: f.category,
                    heading: f.heading,
                    altFeet: f.altitude,
                    speedKnots: f.velocity,
                    country: f.country,
                    icao: f.icao,
                },
            })),
    };
}

/* ═══════════════════════════════════════════════════════
   Canvas-drawn plane icon → HTMLImageElement
   ═══════════════════════════════════════════════════════ */
function createPlaneCanvas(color, size = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2, s = size / 32;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();

    // Nose (top, pointing up)
    ctx.moveTo(0, -14 * s);

    // Right side of fuselage down to wing
    ctx.quadraticCurveTo(1.5 * s, -10 * s, 1.5 * s, -4 * s);

    // Right wing (swept back)
    ctx.lineTo(11 * s, 2 * s);
    ctx.lineTo(11 * s, 4 * s);
    ctx.lineTo(1.5 * s, 1 * s);

    // Right fuselage continues down to tail
    ctx.lineTo(1.5 * s, 8 * s);

    // Right tail stabilizer
    ctx.lineTo(5 * s, 11 * s);
    ctx.lineTo(5 * s, 12.5 * s);
    ctx.lineTo(1.5 * s, 10 * s);

    // Tail notch (vertical stabilizer split)
    ctx.lineTo(1 * s, 13 * s);
    ctx.lineTo(0, 12 * s);
    ctx.lineTo(-1 * s, 13 * s);

    // Left tail stabilizer
    ctx.lineTo(-1.5 * s, 10 * s);
    ctx.lineTo(-5 * s, 12.5 * s);
    ctx.lineTo(-5 * s, 11 * s);
    ctx.lineTo(-1.5 * s, 8 * s);

    // Left fuselage up to wing
    ctx.lineTo(-1.5 * s, 1 * s);

    // Left wing (swept back)
    ctx.lineTo(-11 * s, 4 * s);
    ctx.lineTo(-11 * s, 2 * s);
    ctx.lineTo(-1.5 * s, -4 * s);

    // Left side of fuselage back to nose
    ctx.quadraticCurveTo(-1.5 * s, -10 * s, 0, -14 * s);

    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return canvas;
}

function loadPlaneImage(color, size = 32) {
    return new Promise((resolve) => {
        const canvas = createPlaneCanvas(color, size);
        const img = new Image(size, size);
        img.onload = () => resolve(img);
        img.src = canvas.toDataURL();
    });
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */
const AviationLayer = ({ showPanel = true }) => {
    const map = useMap();
    const ivRef = useRef(null);
    const prevFlightsRef = useRef({});
    const [stats, setStats] = useState({ total: 0, passenger: 0, cargo: 0, military: 0, private: 0, emergency: 0, unknown: 0 });
    const [live, setLive] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Popup state
    const [selectedFlight, setSelectedFlight] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
    const lineRef = useRef(null);     // SVG line element
    const selectedRef = useRef(null); // keep in sync for map event callbacks
    const popupPosRef = useRef({ x: 0, y: 0 });

    // Keep refs in sync
    useEffect(() => { selectedRef.current = selectedFlight; }, [selectedFlight]);
    useEffect(() => { popupPosRef.current = popupPos; }, [popupPos]);

    /* ── Close popup handler ── */
    const closePopup = useCallback(() => {
        setSelectedFlight(null);
    }, []);

    /* ── Main map effect ── */
    useEffect(() => {
        if (!map) return;

        let cancelled = false;

        async function setupLayers() {
            const glowColorExpr = [
                'match', ['get', 'flightType'],
                'passenger', 'rgba(0,200,255,0.15)', 'cargo', 'rgba(230,126,34,0.15)',
                'military', 'rgba(255,50,50,0.18)', 'private', 'rgba(160,80,255,0.12)',
                'emergency', 'rgba(255,220,0,0.20)', 'rgba(150,150,150,0.10)',
            ];

            try {
                /* ── Load colored plane icon images ── */
                const categories = ['passenger', 'cargo', 'military', 'private', 'emergency', 'unknown'];
                for (const cat of categories) {
                    const imgName = `plane-${cat}`;
                    if (!map.hasImage(imgName)) {
                        const img = await loadPlaneImage(COLORS[cat], 32);
                        if (cancelled) return;
                        try { map.addImage(imgName, img); } catch { /* already exists — race condition during style switch */ }
                    }
                }

                if (!map.getSource('aircraft')) {
                    map.addSource('aircraft', {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] },
                        generateId: false,
                    });
                }

                if (!map.getLayer('aircraft-glow')) {
                    map.addLayer({
                        id: 'aircraft-glow', type: 'circle', source: 'aircraft',
                        paint: {
                            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 14, 6],
                            'circle-color': glowColorExpr,
                            'circle-blur': 0.9,
                        },
                    });
                }

                if (!map.getLayer('aircraft-icon')) {
                    map.addLayer({
                        id: 'aircraft-icon', type: 'symbol', source: 'aircraft',
                        layout: {
                            'icon-image': ['concat', 'plane-', ['get', 'flightType']],
                            'icon-size': 0.6,
                            'icon-rotate': ['get', 'heading'],
                            'icon-rotation-alignment': 'map',
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true,
                        },
                        paint: {
                            'icon-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0, 0.9],
                        },
                    });
                }

                if (!map.getLayer('aircraft-icon-hover')) {
                    map.addLayer({
                        id: 'aircraft-icon-hover', type: 'symbol', source: 'aircraft',
                        layout: {
                            'icon-image': ['concat', 'plane-', ['get', 'flightType']],
                            'icon-size': 0.95,
                            'icon-rotate': ['get', 'heading'],
                            'icon-rotation-alignment': 'map',
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true,
                        },
                        paint: {
                            'icon-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
                        },
                    });
                }
            } catch (err) {
                console.error('AviationLayer: layer setup failed:', err);
                return;
            }
        }

        setupLayers();

        /* ── Hover: scale up dot ── */
        let hoveredId = null;

        function onMouseEnter(e) {
            if (!e.features || !e.features.length) return;
            const feat = e.features[0];
            if (hoveredId !== null) {
                map.setFeatureState({ source: 'aircraft', id: hoveredId }, { hover: false });
            }
            hoveredId = feat.id;
            map.setFeatureState({ source: 'aircraft', id: hoveredId }, { hover: true });
        }

        function onMouseLeave() {
            if (hoveredId !== null) {
                map.setFeatureState({ source: 'aircraft', id: hoveredId }, { hover: false });
                hoveredId = null;
            }
        }

        map.on('mouseenter', 'aircraft-icon', onMouseEnter);
        map.on('mouseleave', 'aircraft-icon', onMouseLeave);
        map.on('mouseenter', 'aircraft-icon-hover', onMouseEnter);
        map.on('mouseleave', 'aircraft-icon-hover', onMouseLeave);

        /* ── Click: show popup ── */
        function onClick(e) {
            if (!e.features || !e.features.length) return;
            const feat = e.features[0];
            const props = feat.properties;
            const coords = feat.geometry.coordinates;

            // Calculate popup position (fixed screen position, offset from click)
            const screenPt = map.project(coords);
            const containerRect = map.getContainer().getBoundingClientRect();
            const popX = Math.min(screenPt.x + 40, containerRect.width - 260);
            const popY = Math.max(screenPt.y - 80, 20);

            setPopupPos({ x: popX, y: popY });
            setSelectedFlight({
                callsign: props.callsign || 'N/A',
                flightType: props.flightType || 'unknown',
                altFeet: props.altFeet || 0,
                speedKnots: props.speedKnots || 0,
                heading: props.heading || 0,
                country: props.country || 'Unknown',
                icao: props.icao || '',
                lngLat: [coords[0], coords[1]],
            });
        }

        map.on('click', 'aircraft-icon', onClick);
        map.on('click', 'aircraft-icon-hover', onClick);

        /* ── Move: update connecting line only when map moves & popup is open ── */
        function onMapMove() {
            const sel = selectedRef.current;
            const line = lineRef.current;
            if (!sel || !line) return;

            try {
                const dotScreen = map.project(sel.lngLat);
                const pp = popupPosRef.current;
                line.setAttribute('x1', dotScreen.x);
                line.setAttribute('y1', dotScreen.y);
                line.setAttribute('x2', pp.x);
                line.setAttribute('y2', pp.y);
                line.style.display = 'block';
            } catch {
                line.style.display = 'none';
            }
        }

        map.on('move', onMapMove);

        /* ── Smooth interpolation (throttled to ~4 FPS for performance) ── */
        let animFrame = null;
        let targetFlights = null;
        let interpStart = 0;
        const INTERP_DURATION = 3000;
        let lastInterpUpdate = 0;
        const INTERP_THROTTLE = 250; // ms between setData calls during interpolation

        function interpolatePositions() {
            if (!targetFlights) return;
            const now = Date.now();
            const elapsed = now - interpStart;
            const t = Math.min(elapsed / INTERP_DURATION, 1);

            // Throttle: only update map data every INTERP_THROTTLE ms
            if (t < 1 && (now - lastInterpUpdate) < INTERP_THROTTLE) {
                animFrame = requestAnimationFrame(interpolatePositions);
                return;
            }
            lastInterpUpdate = now;

            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            const prev = prevFlightsRef.current;
            const interpolated = targetFlights.map(f => {
                const p = prev[f.icao];
                if (p && t < 1) {
                    return { ...f, lon: p.lon + (f.lon - p.lon) * eased, lat: p.lat + (f.lat - p.lat) * eased };
                }
                return f;
            });

            try {
                const src = map.getSource('aircraft');
                if (src) src.setData(toGeoJSON(interpolated));
            } catch { }

            if (t < 1) {
                animFrame = requestAnimationFrame(interpolatePositions);
            } else {
                const posMap = {};
                for (const f of targetFlights) posMap[f.icao] = { lon: f.lon, lat: f.lat };
                prevFlightsRef.current = posMap;
            }
        }

        /* ── Fetch from backend ── */
        async function fetchFlights() {
            try {
                const res = await fetch(API_URL);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                setLive(!data.meta?.error);
                setStats(data.stats || { total: 0, passenger: 0, cargo: 0, military: 0, private: 0, emergency: 0, unknown: 0 });

                if (animFrame) cancelAnimationFrame(animFrame);
                targetFlights = data.flights || [];
                interpStart = Date.now();
                interpolatePositions();

                // Update selected flight's lngLat if it's still in the new data
                const sel = selectedRef.current;
                if (sel) {
                    const updated = targetFlights.find(f => f.icao === sel.icao);
                    if (updated) {
                        setSelectedFlight(prev => ({
                            ...prev,
                            lngLat: [updated.lon, updated.lat],
                            altFeet: updated.altitude,
                            speedKnots: updated.velocity,
                            heading: updated.heading,
                        }));
                    }
                }
            } catch (e) {
                console.warn('Backend fetch failed:', e.message);
            }
        }

        fetchFlights();
        ivRef.current = setInterval(fetchFlights, POLL_INTERVAL);

        /* ── Globe Layer toggle: show/hide aviation layers from GlobeLayersPanel ── */
        function handleGlobeLayerToggle(e) {
            const { layer, active } = e.detail || {};
            if (layer !== 'aviation') return;
            const visibility = active ? 'visible' : 'none';
            ['aircraft-glow', 'aircraft-icon', 'aircraft-icon-hover'].forEach(id => {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, 'visibility', visibility);
                }
            });
        }
        window.addEventListener('globeLayerToggle', handleGlobeLayerToggle);

        return () => {
            if (ivRef.current) clearInterval(ivRef.current);
            if (animFrame) cancelAnimationFrame(animFrame);
            map.off('mouseenter', 'aircraft-icon', onMouseEnter);
            map.off('mouseleave', 'aircraft-icon', onMouseLeave);
            map.off('click', 'aircraft-icon', onClick);
            map.off('mouseenter', 'aircraft-icon-hover', onMouseEnter);
            map.off('mouseleave', 'aircraft-icon-hover', onMouseLeave);
            map.off('click', 'aircraft-icon-hover', onClick);
            map.off('move', onMapMove);
            window.removeEventListener('globeLayerToggle', handleGlobeLayerToggle);
            try {
                if (map.getLayer('aircraft-icon')) map.removeLayer('aircraft-icon');
                if (map.getLayer('aircraft-icon-hover')) map.removeLayer('aircraft-icon-hover');
                if (map.getLayer('aircraft-glow')) map.removeLayer('aircraft-glow');
                if (map.getSource('aircraft')) map.removeSource('aircraft');
            } catch { }
        };
    }, [map]);

    /* ═══════ Render ═══════ */
    return (
        <div className="av-layer" style={{ pointerEvents: 'none' }}>

            {/* ── Connecting line SVG (full-screen overlay) ── */}
            <svg className="av-line-svg">
                <defs>
                    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={selectedFlight ? (COLORS[selectedFlight.flightType] || '#777') : '#777'} stopOpacity="0.7" />
                        <stop offset="100%" stopColor={selectedFlight ? (COLORS[selectedFlight.flightType] || '#777') : '#777'} stopOpacity="0.15" />
                    </linearGradient>
                </defs>
                <line
                    ref={lineRef}
                    stroke="url(#lineGrad)"
                    strokeWidth="1"
                    strokeDasharray="4 3"
                    style={{ display: selectedFlight ? 'block' : 'none' }}
                />
            </svg>

            {/* ── Aircraft info popup ── */}
            {selectedFlight && (
                <div
                    className="av-popup"
                    style={{
                        left: popupPos.x + 'px',
                        top: popupPos.y + 'px',
                        pointerEvents: 'auto',
                    }}
                >
                    <span className="av-popup-corner tl" /><span className="av-popup-corner tr" />
                    <span className="av-popup-corner bl" /><span className="av-popup-corner br" />

                    <button className="av-popup-close" onClick={closePopup}>✕</button>

                    <div className="av-popup-header">
                        <span className="av-popup-type-dot" style={{ background: COLORS[selectedFlight.flightType] }} />
                        <span className="av-popup-callsign">{selectedFlight.callsign || 'N/A'}</span>
                        <span className="av-popup-badge" style={{ borderColor: COLORS[selectedFlight.flightType], color: COLORS[selectedFlight.flightType] }}>
                            {LABELS[selectedFlight.flightType] || 'UNKNOWN'}
                        </span>
                    </div>

                    <div className="av-popup-divider" />

                    <div className="av-popup-grid">
                        <div className="av-popup-field">
                            <span className="av-popup-label">ICAO</span>
                            <span className="av-popup-value">{selectedFlight.icao?.toUpperCase()}</span>
                        </div>
                        <div className="av-popup-field">
                            <span className="av-popup-label">COUNTRY</span>
                            <span className="av-popup-value">{selectedFlight.country}</span>
                        </div>
                        <div className="av-popup-field">
                            <span className="av-popup-label">ALT</span>
                            <span className="av-popup-value">{selectedFlight.altFeet?.toLocaleString()} ft</span>
                        </div>
                        <div className="av-popup-field">
                            <span className="av-popup-label">SPD</span>
                            <span className="av-popup-value">{selectedFlight.speedKnots} kts</span>
                        </div>
                        <div className="av-popup-field">
                            <span className="av-popup-label">HDG</span>
                            <span className="av-popup-value">{Math.round(selectedFlight.heading)}°</span>
                        </div>
                        <div className="av-popup-field">
                            <span className="av-popup-label">POS</span>
                            <span className="av-popup-value" style={{ fontSize: '8px' }}>
                                {selectedFlight.lngLat[1]?.toFixed(2)}°, {selectedFlight.lngLat[0]?.toFixed(2)}°
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── HUD Stats Panel ── */}
            {showPanel && (
            <div className="av-hud" style={{ pointerEvents: 'auto' }}>
                <span className="av-corner tl" /><span className="av-corner tr" />
                <span className="av-corner bl" /><span className="av-corner br" />

                <div className="av-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="av-dot" style={{ background: live ? '#00ff88' : '#ff3232' }} />
                        <span className="av-title">AVIATION MONITOR</span>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                        {isCollapsed ? '[ + ]' : '[ - ]'}
                    </span>
                </div>
                {!isCollapsed && (
                    <>
                        <div className="av-divider" />
                        <div className="av-row">
                            <span className="av-label">LIVE FLIGHTS</span>
                            <span className="av-val">{stats.total}</span>
                        </div>
                        <div className="av-divider" />
                        {['passenger', 'cargo', 'military'].map(cat => (
                            <div className="av-row" key={cat}>
                                <span className="av-cat-dot" style={{ background: COLORS[cat] }} />
                                <span className="av-label">{cat.toUpperCase()}</span>
                                <span className="av-val">{stats[cat] || 0}</span>
                            </div>
                        ))}
                        {stats.emergency > 0 && (
                            <div className="av-row emergency">
                                <span className="av-cat-dot" style={{ background: COLORS.emergency }} />
                                <span className="av-label">EMERGENCY</span>
                                <span className="av-val">{stats.emergency}</span>
                            </div>
                        )}
                    </>
                )}
            </div>
            )}

            {/* ═══════ Styles ═══════ */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;500;700&display=swap');

                .av-layer { position:absolute; inset:0; z-index:5; }

                /* ── Connecting line SVG ── */
                .av-line-svg {
                    position:absolute; inset:0; width:100%; height:100%;
                    pointer-events:none; z-index:5;
                }

                /* ── Popup ── */
                .av-popup {
                    position: absolute;
                    z-index: 15;
                    min-width: 200px;
                    padding: 10px 14px;
                    background: rgba(0,0,0,0.82);
                    border: 1px solid rgba(255,255,255,0.15);
                    font-family: 'Share Tech Mono', monospace;
                    backdrop-filter: blur(4px);
                    animation: avPopIn 0.2s ease-out;
                }
                @keyframes avPopIn {
                    from { opacity:0; transform:scale(0.92); }
                    to   { opacity:1; transform:scale(1); }
                }
                .av-popup-corner {
                    position:absolute; width:8px; height:8px; pointer-events:none;
                }
                .av-popup-corner.tl { top:-1px; left:-1px; border-top:1.5px solid rgba(255,255,255,0.5); border-left:1.5px solid rgba(255,255,255,0.5); }
                .av-popup-corner.tr { top:-1px; right:-1px; border-top:1.5px solid rgba(255,255,255,0.5); border-right:1.5px solid rgba(255,255,255,0.5); }
                .av-popup-corner.bl { bottom:-1px; left:-1px; border-bottom:1.5px solid rgba(255,255,255,0.5); border-left:1.5px solid rgba(255,255,255,0.5); }
                .av-popup-corner.br { bottom:-1px; right:-1px; border-bottom:1.5px solid rgba(255,255,255,0.5); border-right:1.5px solid rgba(255,255,255,0.5); }

                .av-popup-close {
                    position:absolute; top:4px; right:6px;
                    background:none; border:none; color:rgba(255,255,255,0.4);
                    font-size:12px; cursor:pointer; padding:2px 4px;
                    font-family:'Share Tech Mono',monospace; line-height:1;
                }
                .av-popup-close:hover { color:#ff5555; }

                .av-popup-header {
                    display:flex; align-items:center; gap:8px; margin-bottom:6px; padding-right:20px;
                }
                .av-popup-type-dot {
                    width:7px; height:7px; border-radius:50%; flex-shrink:0;
                    box-shadow: 0 0 6px currentColor;
                }
                .av-popup-callsign {
                    font-family:'Orbitron',monospace;
                    font-size:13px; font-weight:700;
                    letter-spacing:2px; color:rgba(255,255,255,0.9);
                }
                .av-popup-badge {
                    font-size:7px; letter-spacing:1.5px;
                    border:1px solid; padding:1px 5px;
                    line-height:1.3;
                }
                .av-popup-divider {
                    width:100%; height:1px;
                    background:rgba(255,255,255,0.08);
                    margin:5px 0;
                }
                .av-popup-grid {
                    display:grid; grid-template-columns:1fr 1fr;
                    gap:4px 12px;
                }
                .av-popup-field { display:flex; flex-direction:column; gap:1px; }
                .av-popup-label {
                    font-size:7px; letter-spacing:2px;
                    color:rgba(255,255,255,0.35);
                }
                .av-popup-value {
                    font-size:10px; letter-spacing:1px;
                    color:rgba(255,255,255,0.8);
                }

                /* ── HUD Stats Panel ── */
                .av-hud {
                    position:absolute; bottom:24px; left:50%; transform:translateX(calc(-100% - 8px)); z-index:10;
                    min-width:190px; padding:10px 14px;
                    background:rgba(0,0,0,0.72);
                    border:1px solid rgba(255,255,255,0.12);
                    font-family:'Share Tech Mono',monospace;
                    pointer-events:auto;
                }
                .av-corner { position:absolute; width:8px; height:8px; pointer-events:none; }
                .av-corner.tl { top:-1px; left:-1px; border-top:1.5px solid rgba(255,255,255,0.45); border-left:1.5px solid rgba(255,255,255,0.45); }
                .av-corner.tr { top:-1px; right:-1px; border-top:1.5px solid rgba(255,255,255,0.45); border-right:1.5px solid rgba(255,255,255,0.45); }
                .av-corner.bl { bottom:-1px; left:-1px; border-bottom:1.5px solid rgba(255,255,255,0.45); border-left:1.5px solid rgba(255,255,255,0.45); }
                .av-corner.br { bottom:-1px; right:-1px; border-bottom:1.5px solid rgba(255,255,255,0.45); border-right:1.5px solid rgba(255,255,255,0.45); }

                .av-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
                .av-dot {
                    width:6px; height:6px; border-radius:50%;
                    box-shadow:0 0 6px currentColor;
                    animation:av-blink 2s ease-in-out infinite;
                }
                @keyframes av-blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
                .av-title { font-family:'Orbitron',monospace; font-size:9px; font-weight:600; letter-spacing:2.5px; color:rgba(255,255,255,0.7); }
                .av-divider { width:100%; height:1px; background:rgba(255,255,255,0.08); margin:5px 0; }
                .av-row { display:flex; align-items:center; gap:6px; padding:2px 0; }
                .av-cat-dot { width:5px; height:5px; border-radius:1px; flex-shrink:0; }
                .av-label { font-size:10px; letter-spacing:1.5px; color:rgba(255,255,255,0.45); flex:1; }
                .av-val { font-size:11px; letter-spacing:1px; color:rgba(255,255,255,0.85); text-align:right; min-width:28px; }
                .av-row.emergency .av-label { color:rgba(255,220,0,0.7); }
                .av-row.emergency .av-val { color:#ffdc00; }

                @media (max-width:640px) {
                    .av-hud { bottom:12px; right:12px; min-width:160px; padding:8px 10px; }
                    .av-title { font-size:7px; }
                    .av-label { font-size:8px; }
                    .av-val { font-size:9px; }
                    .av-popup { min-width:170px; padding:8px 10px; }
                    .av-popup-callsign { font-size:11px; }
                }
            `}</style>
        </div>
    );
};

export default AviationLayer;
