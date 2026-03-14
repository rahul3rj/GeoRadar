import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from './Globe';

/* ═══════════════════════════════════════════════════════
   Configuration
   ═══════════════════════════════════════════════════════ */
const isLocal = window.location.hostname === 'localhost';
const API_URL = isLocal ? 'http://localhost:4000/api/conflicts' : '/api/conflicts';
const SUMMARY_URL = isLocal ? 'http://localhost:4000/api/conflict-summary' : '/api/conflict-summary';
const POLL_INTERVAL = 60000; // 1 minute

// Color palette: green → yellow → orange → red
const SEVERITY_COLORS = {
    low: '#22c55e',      // Green — protests, non-violent
    medium: '#eab308',   // Yellow — riots
    high: '#f97316',     // Orange — armed clashes
    critical: '#ef4444', // Red — explosions, war events
};

const SEVERITY_LABELS = {
    low: 'NON-VIOLENT',
    medium: 'UNREST',
    high: 'ARMED CLASH',
    critical: 'WAR EVENT',
};

/* ═══════════════════════════════════════════════════════
   Country name mapping for GeoJSON matching
   (ACLED country name → GeoJSON NAME property)
   ═══════════════════════════════════════════════════════ */
const COUNTRY_NAME_MAP = {
    // Americas
    'united states': 'united states of america',
    'usa': 'united states of america',
    'bolivia': 'bolivia, plurinational state of',
    'venezuela': 'venezuela, bolivarian republic of',
    // Europe
    'russia': 'russian federation',
    'czech republic': 'czechia',
    'uk': 'united kingdom',
    'united kingdom': 'united kingdom of great britain and northern ireland',
    'moldova': 'republic of moldova',
    'netherlands': 'kingdom of the netherlands',
    'north macedonia': 'republic of north macedonia',
    'bosnia': 'bosnia and herzegovina',
    // Africa
    'democratic republic of congo': 'democratic republic of the congo',
    'drc': 'democratic republic of the congo',
    'republic of congo': 'republic of the congo',
    'congo': 'republic of the congo',
    'ivory coast': "côte d'ivoire",
    'cote d\'ivoire': "côte d'ivoire",
    'tanzania': 'united republic of tanzania',
    'eswatini': 'eswatini',
    'swaziland': 'eswatini',
    'cabo verde': 'cape verde',
    'guinea bissau': 'guinea-bissau',
    'south sudan': 'south sudan',
    'central african republic': 'central african republic',
    'car': 'central african republic',
    'libya': 'libya',
    'egypt': 'egypt',
    'sudan': 'sudan',
    'ethiopia': 'ethiopia',
    'somalia': 'somalia',
    'nigeria': 'nigeria',
    'mozambique': 'mozambique',
    'mali': 'mali',
    'burkina faso': 'burkina faso',
    'niger': 'niger',
    'cameroon': 'cameroon',
    'chad': 'chad',
    // Middle East & Central Asia
    'iran': 'iran, islamic republic of',
    'syria': 'syrian arab republic',
    'palestine': 'state of palestine',
    'turkey': 'türkiye',
    'turkiye': 'türkiye',
    'saudi arabia': 'kingdom of saudi arabia',
    'yemen': 'yemen',
    // Asia & Pacific
    'south korea': 'republic of korea',
    'north korea': "democratic people's republic of korea",
    'myanmar': 'myanmar',
    'burma': 'myanmar',
    'brunei': 'brunei darussalam',
    'laos': "lao people's democratic republic",
    'vietnam': 'viet nam',
    'east timor': 'timor-leste',
    'taiwan': 'taiwan, province of china',
    'pakistan': 'pakistan',
    'afghanistan': 'afghanistan',
    'india': 'india',
    'philippines': 'philippines',
    'indonesia': 'indonesia',
};

/* ═══════════════════════════════════════════════════════
   GeoJSON builder
   ═══════════════════════════════════════════════════════ */
function toGeoJSON(events) {
    return {
        type: 'FeatureCollection',
        features: (events || []).map((e, i) => ({
            type: 'Feature',
            id: i,
            geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
            properties: {
                type: e.type || 'Unknown',
                subType: e.subType || '',
                country: e.country || 'Unknown',
                region: e.region || '',
                fatalities: e.fatalities || 0,
                actor1: e.actor1 || '',
                actor2: e.actor2 || '',
                date: e.date || '',
                notes: e.notes || '',
                severity: e.severity || 'medium',
                // For clustering — numeric severity
                severityScore: e.severity === 'critical' ? 4 : e.severity === 'high' ? 3 : e.severity === 'medium' ? 2 : 1,
            },
        })),
    };
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */
const ConflictLayer = () => {
    const map = useMap();
    const ivRef = useRef(null);
    const [stats, setStats] = useState({ total: 0, countries: 0, fatalities: 0 });
    const [summary, setSummary] = useState({});
    const [live, setLive] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [visible, setVisible] = useState(true); // controlled by GlobeLayersPanel

    // Popup state
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
    const selectedRef = useRef(null);
    const popupPosRef = useRef({ x: 0, y: 0 });
    const lineRef = useRef(null);

    // Track which country feature IDs we've highlighted
    const highlightedCountryIds = useRef(new Set());
    const conflictCountriesRef = useRef(new Set());
    const visibleRef = useRef(true);

    useEffect(() => { selectedRef.current = selectedEvent; }, [selectedEvent]);
    useEffect(() => { popupPosRef.current = popupPos; }, [popupPos]);
    useEffect(() => { visibleRef.current = visible; }, [visible]);

    const closePopup = useCallback(() => setSelectedEvent(null), []);

    /* ── Toggle visibility from GlobeLayersPanel ── */
    useEffect(() => {
        function handleToggle(e) {
            if (e.detail.layer === 'conflict') {
                setVisible(e.detail.active);
            }
        }
        window.addEventListener('globeLayerToggle', handleToggle);
        return () => window.removeEventListener('globeLayerToggle', handleToggle);
    }, []);

    /* ── Apply visibility changes to map layers ── */
    useEffect(() => {
        if (!map) return;
        const layerIds = [
            'conflict-clusters', 'conflict-cluster-count',
            'conflict-markers-glow', 'conflict-markers',
            'conflict-country-fill', 'conflict-country-border'
        ];
        const vis = visible ? 'visible' : 'none';
        for (const id of layerIds) {
            try {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, 'visibility', vis);
                }
            } catch { }
        }
        // Close popup when hiding
        if (!visible) setSelectedEvent(null);
    }, [map, visible]);

    /* ── Highlight conflict countries on the countries source ── */
    const updateCountryHighlights = useCallback((conflictCountryNames) => {
        if (!map) return;
        const src = map.getSource('countries');
        if (!src) return;

        // Build a set of normalised conflict country names
        const normalised = new Set();
        for (const name of conflictCountryNames) {
            const lower = name.toLowerCase().trim();
            normalised.add(lower);
            // Also add mapped variant if exists
            if (COUNTRY_NAME_MAP[lower]) {
                normalised.add(COUNTRY_NAME_MAP[lower]);
            }
        }

        conflictCountriesRef.current = normalised;

        // We need to iterate rendered features to find country IDs
        // Try querying all rendered country features
        try {
            // Clear previous highlights
            for (const id of highlightedCountryIds.current) {
                try {
                    map.setFeatureState({ source: 'countries', id }, { conflict: false });
                } catch { }
            }
            highlightedCountryIds.current.clear();

            // Query rendered features from the country layers
            const features = map.querySourceFeatures('countries');

            for (const feat of features) {
                const name = (feat.properties?.NAME || '').toLowerCase().trim();
                const nameLong = (feat.properties?.NAME_LONG || '').toLowerCase().trim();
                const formalEn = (feat.properties?.FORMAL_EN || '').toLowerCase().trim();

                if (normalised.has(name) || normalised.has(nameLong) || normalised.has(formalEn)) {
                    const fid = feat.id;
                    if (fid != null && !highlightedCountryIds.current.has(fid)) {
                        map.setFeatureState({ source: 'countries', id: fid }, { conflict: true });
                        highlightedCountryIds.current.add(fid);
                    }
                }
            }
        } catch (err) {
            console.warn('ConflictLayer: country highlight update failed:', err.message);
        }
    }, [map]);

    /* ── Re-apply highlights when new tiles load (debounced for performance) ── */
    useEffect(() => {
        if (!map) return;
        let debounceTimer = null;

        function applyHighlights() {
            if (!visibleRef.current) return;
            const countries = conflictCountriesRef.current;
            if (countries.size === 0) return;

            try {
                const features = map.querySourceFeatures('countries');
                for (const feat of features) {
                    const fid = feat.id;
                    if (fid == null || highlightedCountryIds.current.has(fid)) continue;

                    const name = (feat.properties?.NAME || '').toLowerCase().trim();
                    const nameLong = (feat.properties?.NAME_LONG || '').toLowerCase().trim();
                    const formalEn = (feat.properties?.FORMAL_EN || '').toLowerCase().trim();

                    if (countries.has(name) || countries.has(nameLong) || countries.has(formalEn)) {
                        map.setFeatureState({ source: 'countries', id: fid }, { conflict: true });
                        highlightedCountryIds.current.add(fid);
                    }
                }
            } catch { }
        }

        // Debounced — only fire 500ms after last event to batch multiple sourcedata events
        function debouncedApply() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(applyHighlights, 500);
        }

        // 'idle' fires once after all map rendering is complete (much less frequent than sourcedata)
        map.on('idle', debouncedApply);
        map.on('moveend', debouncedApply);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            map.off('idle', debouncedApply);
            map.off('moveend', debouncedApply);
        };
    }, [map]);

    /* ── Main MapLibre effect ── */
    useEffect(() => {
        if (!map) return;
        let cancelled = false;

        async function setupLayers() {
            try {
                // Source with clustering
                if (!map.getSource('conflict-events')) {
                    map.addSource('conflict-events', {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] },
                        cluster: true,
                        clusterMaxZoom: 10,
                        clusterRadius: 50,
                        clusterProperties: {
                            maxSeverity: ['max', ['get', 'severityScore']],
                            totalFatalities: ['+', ['get', 'fatalities']],
                        },
                    });
                }

                // Cluster circles
                if (!map.getLayer('conflict-clusters')) {
                    map.addLayer({
                        id: 'conflict-clusters',
                        type: 'circle',
                        source: 'conflict-events',
                        filter: ['has', 'point_count'],
                        paint: {
                            'circle-color': [
                                'case',
                                ['>=', ['get', 'maxSeverity'], 4], SEVERITY_COLORS.critical,
                                ['>=', ['get', 'maxSeverity'], 3], SEVERITY_COLORS.high,
                                ['>=', ['get', 'maxSeverity'], 2], SEVERITY_COLORS.medium,
                                SEVERITY_COLORS.low
                            ],
                            'circle-radius': [
                                'step', ['get', 'point_count'],
                                15,   // < 10 events
                                10, 20,  // 10+
                                50, 25,  // 50+
                                100, 35  // 100+
                            ],
                            'circle-opacity': 0.7,
                            'circle-stroke-width': 1.5,
                            'circle-stroke-color': 'rgba(255,255,255,0.25)',
                        },
                    });
                }

                // Cluster count labels
                if (!map.getLayer('conflict-cluster-count')) {
                    map.addLayer({
                        id: 'conflict-cluster-count',
                        type: 'symbol',
                        source: 'conflict-events',
                        filter: ['has', 'point_count'],
                        layout: {
                            'text-field': '{point_count_abbreviated}',
                            'text-font': ['Open Sans Bold'],
                            'text-size': 11,
                            'text-allow-overlap': true,
                        },
                        paint: {
                            'text-color': '#ffffff',
                        },
                    });
                }

                // Individual event markers (unclustered)
                if (!map.getLayer('conflict-markers-glow')) {
                    map.addLayer({
                        id: 'conflict-markers-glow',
                        type: 'circle',
                        source: 'conflict-events',
                        filter: ['!', ['has', 'point_count']],
                        paint: {
                            'circle-radius': [
                                'case',
                                ['boolean', ['feature-state', 'hover'], false], 12,
                                8
                            ],
                            'circle-color': [
                                'match', ['get', 'severity'],
                                'critical', SEVERITY_COLORS.critical,
                                'high', SEVERITY_COLORS.high,
                                'medium', SEVERITY_COLORS.medium,
                                'low', SEVERITY_COLORS.low,
                                SEVERITY_COLORS.medium
                            ],
                            'circle-opacity': 0.25,
                            'circle-blur': 0.8,
                        },
                    });
                }

                if (!map.getLayer('conflict-markers')) {
                    map.addLayer({
                        id: 'conflict-markers',
                        type: 'circle',
                        source: 'conflict-events',
                        filter: ['!', ['has', 'point_count']],
                        paint: {
                            'circle-radius': [
                                'interpolate', ['linear'], ['get', 'fatalities'],
                                0, 3,
                                10, 5,
                                50, 7,
                                200, 10
                            ],
                            'circle-color': [
                                'match', ['get', 'severity'],
                                'critical', SEVERITY_COLORS.critical,
                                'high', SEVERITY_COLORS.high,
                                'medium', SEVERITY_COLORS.medium,
                                'low', SEVERITY_COLORS.low,
                                SEVERITY_COLORS.medium
                            ],
                            'circle-opacity': 0.85,
                            'circle-stroke-width': 1,
                            'circle-stroke-color': 'rgba(255,255,255,0.3)',
                        },
                    });
                }
            } catch (err) {
                console.error('ConflictLayer: layer setup failed:', err);
            }
        }

        setupLayers();

        /* ── Hover ── */
        let hoveredId = null;

        function onMouseEnter(e) {
            if (!e.features || !e.features.length) return;
            map.getCanvas().style.cursor = 'pointer';
            const feat = e.features[0];
            if (hoveredId !== null) {
                map.setFeatureState({ source: 'conflict-events', id: hoveredId }, { hover: false });
            }
            hoveredId = feat.id;
            map.setFeatureState({ source: 'conflict-events', id: hoveredId }, { hover: true });
        }

        function onMouseLeave() {
            map.getCanvas().style.cursor = 'crosshair';
            if (hoveredId !== null) {
                map.setFeatureState({ source: 'conflict-events', id: hoveredId }, { hover: false });
                hoveredId = null;
            }
        }

        map.on('mouseenter', 'conflict-markers', onMouseEnter);
        map.on('mouseleave', 'conflict-markers', onMouseLeave);

        /* ── Click: unclustered event → popup ── */
        function onMarkerClick(e) {
            if (!e.features || !e.features.length) return;
            const feat = e.features[0];
            const props = feat.properties;
            const coords = feat.geometry.coordinates;

            const screenPt = map.project(coords);
            const containerRect = map.getContainer().getBoundingClientRect();
            const popX = Math.min(screenPt.x + 30, containerRect.width - 280);
            const popY = Math.max(screenPt.y - 100, 20);

            setPopupPos({ x: popX, y: popY });
            setSelectedEvent({
                type: props.type,
                subType: props.subType,
                country: props.country,
                region: props.region,
                fatalities: props.fatalities,
                actor1: props.actor1,
                actor2: props.actor2,
                date: props.date,
                notes: props.notes,
                severity: props.severity,
                lngLat: [coords[0], coords[1]],
            });
        }

        map.on('click', 'conflict-markers', onMarkerClick);

        /* ── Click: cluster → zoom in ── */
        function onClusterClick(e) {
            const features = map.queryRenderedFeatures(e.point, { layers: ['conflict-clusters'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            map.getSource('conflict-events').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 });
            });
        }

        map.on('click', 'conflict-clusters', onClusterClick);

        /* ── Connecting line ── */
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

        /* ── Fetch data ── */
        async function fetchConflicts() {
            try {
                const res = await fetch(API_URL);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                if (data.success && data.data) {
                    setLive(true);
                    const events = data.data;

                    // Update source
                    const src = map.getSource('conflict-events');
                    if (src) src.setData(toGeoJSON(events));

                    // Stats
                    const countriesSet = new Set(events.map(e => e.country));
                    const fatalities = events.reduce((s, e) => s + (e.fatalities || 0), 0);
                    setStats({ total: events.length, countries: countriesSet.size, fatalities });

                    // Highlight conflict countries on the globe
                    updateCountryHighlights(countriesSet);
                }
            } catch (e) {
                console.warn('ConflictLayer: fetch failed:', e.message);
                setLive(false);
            }
        }

        async function fetchSummary() {
            try {
                const res = await fetch(SUMMARY_URL);
                if (!res.ok) return;
                const data = await res.json();
                setSummary(data);
            } catch { }
        }

        fetchConflicts();
        fetchSummary();
        ivRef.current = setInterval(() => {
            fetchConflicts();
            fetchSummary();
        }, POLL_INTERVAL);

        return () => {
            if (ivRef.current) clearInterval(ivRef.current);
            map.off('mouseenter', 'conflict-markers', onMouseEnter);
            map.off('mouseleave', 'conflict-markers', onMouseLeave);
            map.off('click', 'conflict-markers', onMarkerClick);
            map.off('click', 'conflict-clusters', onClusterClick);
            map.off('move', onMapMove);

            // Clear country highlights
            for (const id of highlightedCountryIds.current) {
                try { map.setFeatureState({ source: 'countries', id }, { conflict: false }); } catch { }
            }
            highlightedCountryIds.current.clear();

            try {
                ['conflict-markers', 'conflict-markers-glow', 'conflict-cluster-count', 'conflict-clusters'].forEach(l => {
                    if (map.getLayer(l)) map.removeLayer(l);
                });
                if (map.getSource('conflict-events')) map.removeSource('conflict-events');
            } catch { }
        };
    }, [map, updateCountryHighlights]);

    /* ═══════ Render ═══════ */
    const topCountries = Object.entries(summary).slice(0, 5);
    const severityColor = selectedEvent ? (SEVERITY_COLORS[selectedEvent.severity] || '#eab308') : '#eab308';

    return (
        <div className="conflict-layer" style={{ pointerEvents: 'none' }}>

            {/* ── Connecting line SVG ── */}
            <svg className="conflict-line-svg">
                <defs>
                    <linearGradient id="conflictLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={severityColor} stopOpacity="0.7" />
                        <stop offset="100%" stopColor={severityColor} stopOpacity="0.15" />
                    </linearGradient>
                </defs>
                <line
                    ref={lineRef}
                    stroke="url(#conflictLineGrad)"
                    strokeWidth="1"
                    strokeDasharray="4 3"
                    style={{ display: selectedEvent ? 'block' : 'none' }}
                />
            </svg>

            {/* ── Event detail popup ── */}
            {selectedEvent && (
                <div
                    className="conflict-popup"
                    style={{
                        left: popupPos.x + 'px',
                        top: popupPos.y + 'px',
                        pointerEvents: 'auto',
                    }}
                >
                    <span className="cf-corner tl" /><span className="cf-corner tr" />
                    <span className="cf-corner bl" /><span className="cf-corner br" />

                    <button className="cf-popup-close" onClick={closePopup}>✕</button>

                    <div className="cf-popup-header">
                        <span className="cf-popup-dot" style={{ background: severityColor }} />
                        <span className="cf-popup-title">{selectedEvent.type}</span>
                        <span className="cf-popup-badge" style={{ borderColor: severityColor, color: severityColor }}>
                            {SEVERITY_LABELS[selectedEvent.severity] || 'EVENT'}
                        </span>
                    </div>

                    <div className="cf-popup-divider" />

                    <div className="cf-popup-grid">
                        <div className="cf-popup-field">
                            <span className="cf-popup-label">COUNTRY</span>
                            <span className="cf-popup-value">{selectedEvent.country}</span>
                        </div>
                        <div className="cf-popup-field">
                            <span className="cf-popup-label">DATE</span>
                            <span className="cf-popup-value">{selectedEvent.date}</span>
                        </div>
                        <div className="cf-popup-field">
                            <span className="cf-popup-label">FATALITIES</span>
                            <span className="cf-popup-value" style={{ color: selectedEvent.fatalities > 0 ? '#ef4444' : 'inherit' }}>
                                {selectedEvent.fatalities}
                            </span>
                        </div>
                        <div className="cf-popup-field">
                            <span className="cf-popup-label">REGION</span>
                            <span className="cf-popup-value">{selectedEvent.region || '-'}</span>
                        </div>
                        {selectedEvent.actor1 && (
                            <div className="cf-popup-field full">
                                <span className="cf-popup-label">ACTOR 1</span>
                                <span className="cf-popup-value">{selectedEvent.actor1}</span>
                            </div>
                        )}
                        {selectedEvent.actor2 && (
                            <div className="cf-popup-field full">
                                <span className="cf-popup-label">ACTOR 2</span>
                                <span className="cf-popup-value">{selectedEvent.actor2}</span>
                            </div>
                        )}
                    </div>

                    {selectedEvent.notes && (
                        <>
                            <div className="cf-popup-divider" />
                            <div className="cf-popup-notes">{selectedEvent.notes}</div>
                        </>
                    )}
                </div>
            )}

            {/* ═══════ Styles ═══════ */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;500;700&display=swap');

                .conflict-layer { position:absolute; inset:0; z-index:5; }

                .conflict-line-svg {
                    position:absolute; inset:0; width:100%; height:100%;
                    pointer-events:none; z-index:5;
                }

                /* ── Popup ── */
                .conflict-popup {
                    position: absolute;
                    z-index: 15;
                    min-width: 220px;
                    max-width: 320px;
                    padding: 10px 14px;
                    background: rgba(0,0,0,0.85);
                    border: 1px solid rgba(255,255,255,0.12);
                    font-family: 'Share Tech Mono', monospace;
                    backdrop-filter: blur(6px);
                    animation: cfPopIn 0.2s ease-out;
                }
                @keyframes cfPopIn {
                    from { opacity:0; transform:scale(0.92); }
                    to   { opacity:1; transform:scale(1); }
                }
                .cf-corner {
                    position:absolute; width:8px; height:8px; pointer-events:none;
                }
                .cf-corner.tl { top:-1px; left:-1px; border-top:1.5px solid rgba(255,255,255,0.5); border-left:1.5px solid rgba(255,255,255,0.5); }
                .cf-corner.tr { top:-1px; right:-1px; border-top:1.5px solid rgba(255,255,255,0.5); border-right:1.5px solid rgba(255,255,255,0.5); }
                .cf-corner.bl { bottom:-1px; left:-1px; border-bottom:1.5px solid rgba(255,255,255,0.5); border-left:1.5px solid rgba(255,255,255,0.5); }
                .cf-corner.br { bottom:-1px; right:-1px; border-bottom:1.5px solid rgba(255,255,255,0.5); border-right:1.5px solid rgba(255,255,255,0.5); }

                .cf-popup-close {
                    position:absolute; top:4px; right:6px;
                    background:none; border:none; color:rgba(255,255,255,0.4);
                    font-size:12px; cursor:pointer; padding:2px 4px;
                    font-family:'Share Tech Mono',monospace; line-height:1;
                }
                .cf-popup-close:hover { color:#ff5555; }

                .cf-popup-header {
                    display:flex; align-items:center; gap:8px; margin-bottom:6px; padding-right:20px;
                }
                .cf-popup-dot {
                    width:7px; height:7px; border-radius:50%; flex-shrink:0;
                    box-shadow: 0 0 8px currentColor;
                    animation: cfPulse 2s ease-in-out infinite;
                }
                @keyframes cfPulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }

                .cf-popup-title {
                    font-family:'Orbitron',monospace;
                    font-size:11px; font-weight:600;
                    letter-spacing:1.5px; color:rgba(255,255,255,0.9);
                }
                .cf-popup-badge {
                    font-size:7px; letter-spacing:1.5px;
                    border:1px solid; padding:1px 5px;
                    line-height:1.3; white-space:nowrap;
                }
                .cf-popup-divider {
                    width:100%; height:1px;
                    background:rgba(255,255,255,0.08);
                    margin:5px 0;
                }
                .cf-popup-grid {
                    display:grid; grid-template-columns:1fr 1fr;
                    gap:4px 12px;
                }
                .cf-popup-field { display:flex; flex-direction:column; gap:1px; }
                .cf-popup-field.full { grid-column: 1 / -1; }
                .cf-popup-label {
                    font-size:7px; letter-spacing:2px;
                    color:rgba(255,255,255,0.35);
                }
                .cf-popup-value {
                    font-size:10px; letter-spacing:1px;
                    color:rgba(255,255,255,0.8);
                    word-break: break-word;
                }
                .cf-popup-notes {
                    font-size:9px; letter-spacing:0.5px;
                    color:rgba(255,255,255,0.5);
                    line-height:1.4;
                    max-height:60px; overflow:hidden;
                }

                @media (max-width:640px) {
                    .conflict-popup { min-width:180px; max-width:250px; padding:8px 10px; }
                    .cf-popup-title { font-size:9px; }
                    .cf-popup-label { font-size:6px; }
                    .cf-popup-value { font-size:8px; }
                }
            `}</style>
        </div>
    );
};

export default ConflictLayer;
