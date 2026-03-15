import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from './Globe';

/* ═══════════════════════════════════════════════════════
   Configuration
   ═══════════════════════════════════════════════════════ */
const isLocal = window.location.hostname === 'localhost';
const API_URL = isLocal ? 'http://localhost:4000/api/marine' : '/api/marine';
const ALERTS_URL = isLocal ? 'http://localhost:4000/api/marine/alerts' : '/api/marine/alerts';
const POLL_INTERVAL = 20_000; // 20 seconds

const SHIP_COLORS = {
    cargo: '#00c8ff',    // Cyan/Blue
    tanker: '#ef4444',   // Red
    military: '#a050ff', // Purple
};

const SHIP_LABELS = {
    cargo: 'CARGO',
    tanker: 'TANKER',
    military: 'MILITARY',
};

/* ═══════════════════════════════════════════════════════
   Canvas-drawn ship icon → HTMLImageElement
   (mirrors AviationLayer's createPlaneCanvas pattern)
   ═══════════════════════════════════════════════════════ */
function createShipCanvas(color, size = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2, s = size / 32;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();

    // Bow (top, pointing up — heading 0°)
    ctx.moveTo(0, -13 * s);

    // Right hull curve from bow to beam
    ctx.quadraticCurveTo(3 * s, -8 * s, 4 * s, -2 * s);

    // Right hull beam to stern
    ctx.lineTo(4 * s, 6 * s);

    // Stern right corner
    ctx.lineTo(3.5 * s, 10 * s);

    // Stern transom (flat back)
    ctx.lineTo(1 * s, 12 * s);
    ctx.lineTo(0, 11 * s);
    ctx.lineTo(-1 * s, 12 * s);

    // Stern left corner
    ctx.lineTo(-3.5 * s, 10 * s);

    // Left hull stern to beam
    ctx.lineTo(-4 * s, 6 * s);

    // Left hull beam back to bow
    ctx.lineTo(-4 * s, -2 * s);
    ctx.quadraticCurveTo(-3 * s, -8 * s, 0, -13 * s);

    ctx.closePath();
    ctx.fill();

    // Superstructure / bridge (small rectangle near stern)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-2.5 * s, 2 * s, 5 * s, 4 * s);

    // Deck line (center spine)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.8 * s;
    ctx.beginPath();
    ctx.moveTo(0, -10 * s);
    ctx.lineTo(0, 1 * s);
    ctx.stroke();

    ctx.restore();
    return canvas;
}

function loadShipImage(color, size = 32) {
    return new Promise((resolve) => {
        const canvas = createShipCanvas(color, size);
        const img = new Image(size, size);
        img.onload = () => resolve(img);
        img.src = canvas.toDataURL();
    });
}

/* ═══════════════════════════════════════════════════════
   GeoJSON builder
   ═══════════════════════════════════════════════════════ */
function toGeoJSON(vessels) {
    return {
        type: 'FeatureCollection',
        features: (vessels || []).map((v, i) => ({
            type: 'Feature',
            id: i,
            geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
            properties: {
                mmsi: v.mmsi || 0,
                name: v.name || '',
                type: v.type || 'cargo',
                heading: v.heading || 0,
                speed: v.speed || 0,
                course: v.course || v.heading || 0,
                typeScore: v.type === 'military' ? 3 : v.type === 'tanker' ? 2 : 1,
            },
        })),
    };
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */
const MarineLayer = ({ showPanel = true }) => {
    const map = useMap();
    const ivRef = useRef(null);
    const [stats, setStats] = useState({ total: 0, cargo: 0, tanker: 0, military: 0 });
    const [alerts, setAlerts] = useState([]);
    const [live, setLive] = useState(false);
    const [visible, setVisible] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [selectedVessel, setSelectedVessel] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
    const selectedRef = useRef(null);
    const popupPosRef = useRef({ x: 0, y: 0 });
    const lineRef = useRef(null);


    useEffect(() => { selectedRef.current = selectedVessel; }, [selectedVessel]);
    useEffect(() => { popupPosRef.current = popupPos; }, [popupPos]);

    const closePopup = useCallback(() => setSelectedVessel(null), []);

    /* ── Toggle visibility from GlobeLayersPanel ── */
    useEffect(() => {
        function handleToggle(e) {
            if (e.detail.layer === 'marine') {
                setVisible(e.detail.active);
            }
        }
        window.addEventListener('globeLayerToggle', handleToggle);
        return () => window.removeEventListener('globeLayerToggle', handleToggle);
    }, []);

    /* ── Apply visibility changes ── */
    useEffect(() => {
        if (!map) return;
        const layerIds = [
            'marine-heatmap', 'marine-clusters', 'marine-cluster-count',
            'marine-ship-icon', 'marine-ship-icon-hover', 'marine-ships-glow'
        ];
        const vis = visible ? 'visible' : 'none';
        for (const id of layerIds) {
            try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); } catch { }
        }
        if (!visible) setSelectedVessel(null);
    }, [map, visible]);



    /* ── Main MapLibre effect ── */
    useEffect(() => {
        if (!map) return;
        let cancelled = false;

        async function setupLayers() {
            try {
                /* ── Load colored ship icon images (like AviationLayer's planes) ── */
                const types = ['cargo', 'tanker', 'military'];
                for (const t of types) {
                    const imgName = `ship-${t}`;
                    if (!map.hasImage(imgName)) {
                        const img = await loadShipImage(SHIP_COLORS[t], 32);
                        if (cancelled) return;
                        try { map.addImage(imgName, img); } catch { /* already exists — race condition during style switch */ }
                    }
                }

                // Single source for all marine data (heatmap + clusters + individual ships)
                if (!map.getSource('marine-vessels')) {
                    map.addSource('marine-vessels', {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] },
                        cluster: true,
                        clusterMaxZoom: 8,
                        clusterRadius: 60,
                        clusterProperties: {
                            maxType: ['max', ['get', 'typeScore']],
                        },
                    });
                }

                /* ── Shipping lane heatmap (zoom < 4) ── 
                   Subtle deep-ocean glow that traces shipping lanes
                   without overwhelming the dark globe aesthetic */
                if (!map.getLayer('marine-heatmap')) {
                    map.addLayer({
                        id: 'marine-heatmap',
                        type: 'heatmap',
                        source: 'marine-vessels',
                        maxzoom: 5,
                        filter: ['!', ['has', 'point_count']], // Only use unclustered points for heatmap
                        paint: {
                            'heatmap-weight': [
                                'match', ['get', 'type'],
                                'tanker', 1.2,
                                'military', 1.5,
                                1
                            ],
                            'heatmap-intensity': [
                                'interpolate', ['linear'], ['zoom'],
                                0, 0.15, 2, 0.35, 4, 0.5
                            ],
                            'heatmap-color': [
                                'interpolate', ['linear'], ['heatmap-density'],
                                0, 'rgba(0, 0, 0, 0)',
                                0.05, 'rgba(2, 15, 30, 0.08)',
                                0.15, 'rgba(5, 30, 60, 0.15)',
                                0.3, 'rgba(8, 50, 90, 0.25)',
                                0.5, 'rgba(12, 75, 120, 0.35)',
                                0.7, 'rgba(20, 110, 155, 0.40)',
                                0.85, 'rgba(30, 140, 180, 0.45)',
                                1, 'rgba(45, 170, 210, 0.50)'
                            ],
                            'heatmap-radius': [
                                'interpolate', ['linear'], ['zoom'],
                                0, 5, 2, 10, 4, 18
                            ],
                            'heatmap-opacity': [
                                'interpolate', ['linear'], ['zoom'],
                                2, 0.6, 4, 0.25, 5, 0
                            ],
                        },
                    });
                }

                /* ── Cluster circles (zoom 3-8) ── */
                if (!map.getLayer('marine-clusters')) {
                    map.addLayer({
                        id: 'marine-clusters',
                        type: 'circle',
                        source: 'marine-vessels',
                        filter: ['has', 'point_count'],
                        minzoom: 3,
                        paint: {
                            'circle-color': [
                                'case',
                                ['>=', ['get', 'maxType'], 3], SHIP_COLORS.military,
                                ['>=', ['get', 'maxType'], 2], SHIP_COLORS.tanker,
                                SHIP_COLORS.cargo
                            ],
                            'circle-radius': [
                                'step', ['get', 'point_count'],
                                10, 10, 14, 50, 18, 200, 24
                            ],
                            'circle-opacity': 0.5,
                            'circle-stroke-width': 1,
                            'circle-stroke-color': 'rgba(255,255,255,0.12)',
                        },
                    });
                }

                /* ── Cluster count labels ── */
                if (!map.getLayer('marine-cluster-count')) {
                    map.addLayer({
                        id: 'marine-cluster-count',
                        type: 'symbol',
                        source: 'marine-vessels',
                        filter: ['has', 'point_count'],
                        minzoom: 3,
                        layout: {
                            'text-field': '{point_count_abbreviated}',
                            'text-font': ['Open Sans Bold'],
                            'text-size': 10,
                            'text-allow-overlap': true,
                        },
                        paint: {
                            'text-color': 'rgba(255,255,255,0.75)',
                        },
                    });
                }

                /* ── Individual ship glow (barely-there halo behind icon) ── */
                if (!map.getLayer('marine-ships-glow')) {
                    map.addLayer({
                        id: 'marine-ships-glow',
                        type: 'circle',
                        source: 'marine-vessels',
                        filter: ['!', ['has', 'point_count']],
                        minzoom: 5,
                        paint: {
                            'circle-radius': [
                                'case',
                                ['boolean', ['feature-state', 'hover'], false], 12, 5
                            ],
                            'circle-color': [
                                'match', ['get', 'type'],
                                'tanker', SHIP_COLORS.tanker,
                                'military', SHIP_COLORS.military,
                                SHIP_COLORS.cargo
                            ],
                            'circle-opacity': [
                                'case',
                                ['boolean', ['feature-state', 'hover'], false], 0.2, 0.08
                            ],
                            'circle-blur': 1,
                        },
                    });
                }

                /* ── Individual ship icons (symbol layer — like planes!) ── */
                if (!map.getLayer('marine-ship-icon')) {
                    map.addLayer({
                        id: 'marine-ship-icon',
                        type: 'symbol',
                        source: 'marine-vessels',
                        filter: ['!', ['has', 'point_count']],
                        minzoom: 5,
                        layout: {
                            'icon-image': ['concat', 'ship-', ['get', 'type']],
                            'icon-size': 0.55,
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

                /* ── Ship icon hover (enlarged, visible only on hover) ── */
                if (!map.getLayer('marine-ship-icon-hover')) {
                    map.addLayer({
                        id: 'marine-ship-icon-hover',
                        type: 'symbol',
                        source: 'marine-vessels',
                        filter: ['!', ['has', 'point_count']],
                        minzoom: 5,
                        layout: {
                            'icon-image': ['concat', 'ship-', ['get', 'type']],
                            'icon-size': 0.85,
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
                console.error('MarineLayer: layer setup failed:', err);
            }
        }

        setupLayers();

        /* ── Hover ── */
        let hoveredId = null;
        function onMouseEnter(e) {
            if (!e.features?.length) return;
            map.getCanvas().style.cursor = 'pointer';
            if (hoveredId !== null) {
                map.setFeatureState({ source: 'marine-vessels', id: hoveredId }, { hover: false });
            }
            hoveredId = e.features[0].id;
            map.setFeatureState({ source: 'marine-vessels', id: hoveredId }, { hover: true });
        }
        function onMouseLeave() {
            map.getCanvas().style.cursor = 'crosshair';
            if (hoveredId !== null) {
                map.setFeatureState({ source: 'marine-vessels', id: hoveredId }, { hover: false });
                hoveredId = null;
            }
        }
        map.on('mouseenter', 'marine-ship-icon', onMouseEnter);
        map.on('mouseleave', 'marine-ship-icon', onMouseLeave);
        map.on('mouseenter', 'marine-ship-icon-hover', onMouseEnter);
        map.on('mouseleave', 'marine-ship-icon-hover', onMouseLeave);

        /* ── Click: individual vessel → popup ── */
        function onShipClick(e) {
            if (!e.features?.length) return;
            const props = e.features[0].properties;
            const coords = e.features[0].geometry.coordinates;
            const pt = map.project(coords);
            const rect = map.getContainer().getBoundingClientRect();

            setPopupPos({ x: Math.min(pt.x + 25, rect.width - 260), y: Math.max(pt.y - 80, 20) });
            setSelectedVessel({
                mmsi: props.mmsi,
                name: props.name,
                type: props.type,
                heading: props.heading,
                speed: props.speed,
                course: props.course,
                lngLat: [coords[0], coords[1]],
            });
        }
        map.on('click', 'marine-ship-icon', onShipClick);

        /* ── Click: cluster → zoom ── */
        function onClusterClick(e) {
            const features = map.queryRenderedFeatures(e.point, { layers: ['marine-clusters'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            map.getSource('marine-vessels').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 });
            });
        }
        map.on('click', 'marine-clusters', onClusterClick);

        /* ── Connecting line ── */
        function onMapMove() {
            const sel = selectedRef.current;
            const line = lineRef.current;
            if (!sel || !line) return;
            try {
                const dot = map.project(sel.lngLat);
                const pp = popupPosRef.current;
                line.setAttribute('x1', dot.x);
                line.setAttribute('y1', dot.y);
                line.setAttribute('x2', pp.x);
                line.setAttribute('y2', pp.y);
                line.style.display = 'block';
            } catch { line.style.display = 'none'; }
        }
        map.on('move', onMapMove);

        /* ── Fetch data ── */
        async function fetchVessels() {
            try {
                const zoom = map.getZoom();
                const bounds = map.getBounds();
                const bbox = [
                    bounds.getWest().toFixed(2),
                    bounds.getSouth().toFixed(2),
                    bounds.getEast().toFixed(2),
                    bounds.getNorth().toFixed(2),
                ].join(',');

                const res = await fetch(`${API_URL}?zoom=${zoom.toFixed(1)}&bbox=${bbox}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();

                if (json.success && json.data) {
                    setLive(true);
                    const geojson = toGeoJSON(json.data);

                    const src = map.getSource('marine-vessels');
                    if (src) src.setData(geojson);

                    setStats(json.stats || {});
                }
            } catch (e) {
                console.warn('MarineLayer: fetch failed:', e.message);
                setLive(false);
            }
        }

        async function fetchAlerts() {
            try {
                const res = await fetch(ALERTS_URL);
                if (!res.ok) return;
                const json = await res.json();
                if (json.success) setAlerts(json.alerts || []);
            } catch { }
        }

        fetchVessels();
        fetchAlerts();

        // Re-fetch on viewport changes (debounced)
        let fetchTimeout = null;
        function onMoveEnd() {
            if (fetchTimeout) clearTimeout(fetchTimeout);
            fetchTimeout = setTimeout(fetchVessels, 2000); // 2s debounce to avoid rapid re-fetching while panning
        }
        map.on('moveend', onMoveEnd);

        ivRef.current = setInterval(() => {
            fetchVessels();
            fetchAlerts();
        }, POLL_INTERVAL);

        return () => {
            if (ivRef.current) clearInterval(ivRef.current);
            if (fetchTimeout) clearTimeout(fetchTimeout);
            map.off('mouseenter', 'marine-ship-icon', onMouseEnter);
            map.off('mouseleave', 'marine-ship-icon', onMouseLeave);
            map.off('mouseenter', 'marine-ship-icon-hover', onMouseEnter);
            map.off('mouseleave', 'marine-ship-icon-hover', onMouseLeave);
            map.off('click', 'marine-ship-icon', onShipClick);
            map.off('click', 'marine-clusters', onClusterClick);
            map.off('move', onMapMove);
            map.off('moveend', onMoveEnd);
            try {
                ['marine-ship-icon-hover', 'marine-ship-icon', 'marine-ships-glow', 'marine-cluster-count', 'marine-clusters', 'marine-heatmap'].forEach(l => {
                    if (map.getLayer(l)) map.removeLayer(l);
                });
                if (map.getSource('marine-vessels')) map.removeSource('marine-vessels');
            } catch { }
        };
    }, [map]);

    /* ═══════ Render ═══════ */
    const shipColor = selectedVessel ? (SHIP_COLORS[selectedVessel.type] || SHIP_COLORS.cargo) : SHIP_COLORS.cargo;

    return (
        <div className="marine-layer" style={{ pointerEvents: 'none' }}>

            {/* ── Connecting line SVG (portaled to body) ── */}
            {createPortal(
                <svg className="marine-line-svg">
                    <defs>
                        <linearGradient id="marineLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={shipColor} stopOpacity="0.7" />
                            <stop offset="100%" stopColor={shipColor} stopOpacity="0.15" />
                        </linearGradient>
                    </defs>
                    <line
                        ref={lineRef}
                        stroke="url(#marineLineGrad)"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        style={{ display: selectedVessel ? 'block' : 'none' }}
                    />
                </svg>,
                document.body
            )}

            {/* ── Marine Monitor Widget ── */}
            {showPanel && (
            <div
                className="marine-monitor"
                style={{ pointerEvents: 'auto' }}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <span className="mm-corner tl" /><span className="mm-corner tr" />
                <span className="mm-corner bl" /><span className="mm-corner br" />

                <div className="mm-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="mm-dot" style={{ background: live ? '#00ff88' : '#ff3232' }} />
                        <span className="mm-title">MARINE MONITOR</span>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                        {isCollapsed ? '[ + ]' : '[ - ]'}
                    </span>
                </div>

                {!isCollapsed && (
                    <>
                        <div className="mm-divider" />
                        <div className="mm-row">
                            <span className="mm-label">TRACKED VESSELS</span>
                            <span className="mm-val">{stats.total || 0}</span>
                        </div>
                        <div className="mm-divider" />
                        <div className="mm-row">
                            <span className="mm-cat-dot" style={{ background: SHIP_COLORS.cargo }} />
                            <span className="mm-label">CARGO</span>
                            <span className="mm-val">{stats.cargo || 0}</span>
                        </div>
                        <div className="mm-row">
                            <span className="mm-cat-dot" style={{ background: SHIP_COLORS.tanker }} />
                            <span className="mm-label">TANKER</span>
                            <span className="mm-val">{stats.tanker || 0}</span>
                        </div>
                        <div className="mm-row">
                            <span className="mm-cat-dot" style={{ background: SHIP_COLORS.military }} />
                            <span className="mm-label">MILITARY</span>
                            <span className="mm-val">{stats.military || 0}</span>
                        </div>

                        {alerts.length > 0 && (
                            <>
                                <div className="mm-divider" />
                                <div className="mm-label" style={{ marginBottom: '4px', letterSpacing: '2px' }}>⚠ CHOKEPOINT ALERTS</div>
                                {alerts.slice(0, 3).map((a, i) => (
                                    <div key={i} className="mm-alert">
                                        <span className="mm-alert-dot" style={{
                                            background: a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f97316' : '#eab308'
                                        }} />
                                        <span className="mm-alert-text">{a.location}: {a.count} vessels</span>
                                    </div>
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>
            )}

            {/* ── Vessel popup (portaled to body) ── */}
            {selectedVessel && createPortal(
                <div className="marine-popup" style={{
                    left: popupPos.x + 'px', top: popupPos.y + 'px', pointerEvents: 'auto'
                }}>
                    <span className="mm-corner tl" /><span className="mm-corner tr" />
                    <span className="mm-corner bl" /><span className="mm-corner br" />
                    <button className="mp-close" onClick={closePopup}>✕</button>

                    <div className="mp-header">
                        <span className="mp-dot" style={{ background: shipColor }} />
                        <span className="mp-title">{selectedVessel.name || 'UNKNOWN'}</span>
                        <span className="mp-badge" style={{ borderColor: shipColor, color: shipColor }}>
                            {SHIP_LABELS[selectedVessel.type] || 'VESSEL'}
                        </span>
                    </div>
                    <div className="mm-divider" />
                    <div className="mp-grid">
                        <div className="mp-field">
                            <span className="mp-label">MMSI</span>
                            <span className="mp-value">{selectedVessel.mmsi || '-'}</span>
                        </div>
                        <div className="mp-field">
                            <span className="mp-label">SPEED</span>
                            <span className="mp-value">{selectedVessel.speed} kts</span>
                        </div>
                        <div className="mp-field">
                            <span className="mp-label">HEADING</span>
                            <span className="mp-value">{selectedVessel.heading}°</span>
                        </div>
                        <div className="mp-field">
                            <span className="mp-label">COURSE</span>
                            <span className="mp-value">{selectedVessel.course}°</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ═══════ Styles ═══════ */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;500;700&display=swap');

                .marine-layer { position:absolute; inset:0; z-index:4; }

                .marine-line-svg {
                    position:fixed; inset:0; width:100%; height:100%;
                    pointer-events:none; z-index:99998;
                }

                /* ── Marine Monitor ── */
                .marine-monitor {
                    position:absolute; bottom:24px; left:50%; transform:translateX(8px); z-index:10;
                    min-width:190px; padding:10px 14px;
                    background:rgba(0,0,0,0.72);
                    border:1px solid rgba(255,255,255,0.12);
                    font-family:'Share Tech Mono',monospace;
                    pointer-events:auto;
                }
                .mm-corner { position:absolute; width:8px; height:8px; pointer-events:none; }
                .mm-corner.tl { top:-1px; left:-1px; border-top:1.5px solid rgba(255,255,255,0.45); border-left:1.5px solid rgba(255,255,255,0.45); }
                .mm-corner.tr { top:-1px; right:-1px; border-top:1.5px solid rgba(255,255,255,0.45); border-right:1.5px solid rgba(255,255,255,0.45); }
                .mm-corner.bl { bottom:-1px; left:-1px; border-bottom:1.5px solid rgba(255,255,255,0.45); border-left:1.5px solid rgba(255,255,255,0.45); }
                .mm-corner.br { bottom:-1px; right:-1px; border-bottom:1.5px solid rgba(255,255,255,0.45); border-right:1.5px solid rgba(255,255,255,0.45); }

                .mm-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
                .mm-dot {
                    width:6px; height:6px; border-radius:50%;
                    box-shadow:0 0 6px currentColor;
                    animation:mm-blink 2s ease-in-out infinite;
                }
                @keyframes mm-blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
                .mm-title { font-family:'Orbitron',monospace; font-size:9px; font-weight:600; letter-spacing:2.5px; color:rgba(255,255,255,0.7); }
                .mm-divider { width:100%; height:1px; background:rgba(255,255,255,0.08); margin:5px 0; }
                .mm-row { display:flex; align-items:center; gap:6px; padding:2px 0; }
                .mm-cat-dot { width:5px; height:5px; border-radius:1px; flex-shrink:0; }
                .mm-label { font-size:10px; letter-spacing:1.5px; color:rgba(255,255,255,0.45); flex:1; }
                .mm-val { font-size:11px; letter-spacing:1px; color:rgba(255,255,255,0.85); text-align:right; min-width:28px; }

                .mm-alert { display:flex; align-items:center; gap:5px; padding:2px 0; }
                .mm-alert-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
                .mm-alert-text { font-size:8px; color:rgba(255,255,255,0.65); letter-spacing:0.5px; }

                /* ── Vessel Popup ── */
                .marine-popup {
                    position:fixed; z-index:99999;
                    min-width:200px; max-width:280px;
                    padding:10px 14px;
                    background:rgba(0,0,0,0.85);
                    border:1px solid rgba(255,255,255,0.12);
                    font-family:'Share Tech Mono',monospace;
                    backdrop-filter:blur(6px);
                    animation: mpPopIn 0.2s ease-out;
                }
                @keyframes mpPopIn {
                    from { opacity:0; transform:scale(0.92); }
                    to { opacity:1; transform:scale(1); }
                }
                .mp-close {
                    position:absolute; top:4px; right:6px;
                    background:none; border:none; color:rgba(255,255,255,0.4);
                    font-size:12px; cursor:pointer; padding:2px 4px;
                    font-family:'Share Tech Mono',monospace; line-height:1;
                }
                .mp-close:hover { color:#ff5555; }
                .mp-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; padding-right:20px; }
                .mp-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; box-shadow:0 0 8px currentColor; animation:mmPulse 2s ease-in-out infinite; }
                .mp-title { font-family:'Orbitron',monospace; font-size:10px; font-weight:600; letter-spacing:1.5px; color:rgba(255,255,255,0.9); }
                .mp-badge { font-size:7px; letter-spacing:1.5px; border:1px solid; padding:1px 5px; line-height:1.3; white-space:nowrap; }
                .mp-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; }
                .mp-field { display:flex; flex-direction:column; gap:1px; }
                .mp-label { font-size:7px; letter-spacing:2px; color:rgba(255,255,255,0.35); }
                .mp-value { font-size:10px; letter-spacing:1px; color:rgba(255,255,255,0.8); }
            `}</style>
        </div>
    );
};

export default MarineLayer;
