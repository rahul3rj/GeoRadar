import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_STYLE =
    'https://api.maptiler.com/maps/019cb3d9-3cd7-7b1b-96b0-e1669d297a00/style.json?key=DNvnDzGq038Xaqfp593e';

const COUNTRIES_GEOJSON_URL =
    'https://raw.githubusercontent.com/cB-Abhinav-Gautam/World-Map-India-Complete/master/GeoJson/geo.json';

const BORDER_COLOR = 'rgba(184, 128, 66, 0.5)';
const HIGHLIGHT_FILL = 'rgba(184, 128, 66, 0.5)';
const HIGHLIGHT_BORDER = 'rgba(230, 153, 51, 0.85)';

/* ── Map Context (so layer components can access the map) ── */
const MapContext = createContext(null);
export const useMap = () => useContext(MapContext)?.instance || null;

const Globe = ({ children }) => {
    const containerRef = useRef(null);
    const starsRef = useRef(null);
    const mapRef = useRef(null);
    const coordRef = useRef(null);
    const [mapReady, setMapReady] = useState(null);

    /* ── Draw cyberpunk HUD background on canvas ── */
    useEffect(() => {
        const canvas = starsRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);

            const cx = w / 2;
            const cy = h / 2;
            const maxR = Math.max(w, h) * 0.85;

            /* Concentric circle arcs */
            const ringRadii = [0.18, 0.28, 0.40, 0.55, 0.72, 0.90, 1.1, 1.35];
            for (let ri = 0; ri < ringRadii.length; ri++) {
                const r = maxR * ringRadii[ri];
                const alpha = ri < 4 ? 0.07 + ri * 0.015 : 0.04;
                if (ri % 2 === 0) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                    ctx.lineWidth = ri === 2 || ri === 4 ? 1.0 : 0.5;
                    ctx.stroke();
                } else {
                    const segments = [[0, 0.6], [0.8, 1.4], [1.7, 2.3], [2.5, 2.9],
                    [3.3, 4.0], [4.4, 5.1], [5.4, 5.9]];
                    for (const [s, e] of segments) {
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, s, e);
                        ctx.strokeStyle = `rgba(255,255,255,${alpha + 0.02})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            /* Crosshair lines */
            ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();

            const chLen = maxR * 0.15;
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(cx - chLen, cy); ctx.lineTo(cx + chLen, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy - chLen); ctx.lineTo(cx, cy + chLen); ctx.stroke();

            /* Tick marks */
            const tickSpacing = maxR * 0.05;
            for (let t = 1; t < 20; t++) {
                const tickLen = t % 5 === 0 ? 8 : 4;
                const alpha_t = t % 5 === 0 ? 0.12 : 0.06;
                ctx.strokeStyle = `rgba(255,255,255,${alpha_t})`; ctx.lineWidth = 0.5;
                const tx = cx + t * tickSpacing, txN = cx - t * tickSpacing;
                if (tx < w) { ctx.beginPath(); ctx.moveTo(tx, cy - tickLen); ctx.lineTo(tx, cy + tickLen); ctx.stroke(); }
                if (txN > 0) { ctx.beginPath(); ctx.moveTo(txN, cy - tickLen); ctx.lineTo(txN, cy + tickLen); ctx.stroke(); }
                const ty = cy + t * tickSpacing, tyN = cy - t * tickSpacing;
                if (ty < h) { ctx.beginPath(); ctx.moveTo(cx - tickLen, ty); ctx.lineTo(cx + tickLen, ty); ctx.stroke(); }
                if (tyN > 0) { ctx.beginPath(); ctx.moveTo(cx - tickLen, tyN); ctx.lineTo(cx + tickLen, tyN); ctx.stroke(); }
            }

            /* Radial spokes */
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                if (i % 3 === 0) continue;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * maxR * 0.22, cy + Math.sin(angle) * maxR * 0.22);
                ctx.lineTo(cx + Math.cos(angle) * maxR * 1.2, cy + Math.sin(angle) * maxR * 1.2);
                ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 0.5; ctx.stroke();
            }

            /* Corner brackets */
            const bs = 20, bi = 30;
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bi, bi + bs); ctx.lineTo(bi, bi); ctx.lineTo(bi + bs, bi); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w - bi - bs, bi); ctx.lineTo(w - bi, bi); ctx.lineTo(w - bi, bi + bs); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bi, h - bi - bs); ctx.lineTo(bi, h - bi); ctx.lineTo(bi + bs, h - bi); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w - bi - bs, h - bi); ctx.lineTo(w - bi, h - bi); ctx.lineTo(w - bi, h - bi - bs); ctx.stroke();

            /* Dot accents */
            for (let ri = 0; ri < ringRadii.length; ri += 2) {
                const r = maxR * ringRadii[ri];
                for (let a = 0; a < 12; a++) {
                    const angle = (a / 12) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 1.2, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
                }
            }

            /* Vignette */
            const vignette = ctx.createRadialGradient(cx, cy, maxR * 0.2, cx, cy, maxR);
            vignette.addColorStop(0, 'transparent');
            vignette.addColorStop(0.7, 'transparent');
            vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
            ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);

            /* Dust */
            for (let i = 0; i < 120; i++) {
                const dx = Math.random() * w, dy = Math.random() * h;
                if (Math.hypot(dx - cx, dy - cy) < maxR * 0.25) continue;
                ctx.beginPath();
                ctx.arc(dx, dy, Math.random() * 0.8 + 0.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.12})`; ctx.fill();
            }
        };

        draw();
        window.addEventListener('resize', draw);
        return () => window.removeEventListener('resize', draw);
    }, []);

    /* ── Map initialization ── */
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        let activeLayerId = 'dark';

        /* ── Fog configurations per map layer type ── */
        const getFogConfig = (layerId) => {
            switch (layerId) {
                case 'satellite':
                    return {
                        color: 'rgb(10, 10, 20)',
                        'high-color': 'rgb(20, 20, 40)',
                        'horizon-blend': 0.02,
                        'space-color': 'rgb(0, 0, 0)',
                        'star-intensity': 0.5,
                    };
                case 'night':
                    return {
                        color: 'rgb(0, 4, 15)',
                        'high-color': 'rgb(5, 8, 30)',
                        'horizon-blend': 0.03,
                        'space-color': 'rgb(0, 0, 0)',
                        'star-intensity': 0.9,
                    };
                case 'dark':
                default:
                    return {
                        color: 'rgb(0, 0, 0)',
                        'high-color': 'rgb(0, 0, 0)',
                        'horizon-blend': 0.01,
                        'space-color': 'rgb(0, 0, 0)',
                        'star-intensity': 0.7,
                    };
            }
        };

        /* ── Setup base layers — called on initial load AND after every style swap ── */
        const setupBaseLayers = (map) => {
            try { map.setFog(getFogConfig(activeLayerId)); } catch { }

            /* Country borders source */
            if (!map.getSource('countries')) {
                map.addSource('countries', { type: 'geojson', data: COUNTRIES_GEOJSON_URL, generateId: true });
            }
            if (!map.getLayer('country-borders')) {
                map.addLayer({ id: 'country-borders', type: 'line', source: 'countries', paint: { 'line-color': BORDER_COLOR, 'line-width': 1.2 } });
            }

            /* Conflict country highlighting (red fill + glow border) */
            if (!map.getLayer('conflict-country-fill')) {
                map.addLayer({
                    id: 'conflict-country-fill', type: 'fill', source: 'countries',
                    paint: {
                        'fill-color': 'rgba(220, 38, 38, 0.25)',
                        'fill-opacity': ['case', ['boolean', ['feature-state', 'conflict'], false], 1, 0]
                    }
                });
            }
            if (!map.getLayer('conflict-country-border')) {
                map.addLayer({
                    id: 'conflict-country-border', type: 'line', source: 'countries',
                    paint: {
                        'line-color': 'rgba(239, 68, 68, 0.65)',
                        'line-width': ['case', ['boolean', ['feature-state', 'conflict'], false], 2.5, 0]
                    }
                });
            }

            /* Click-to-highlight (sits on top of conflict highlight) */
            if (!map.getLayer('country-highlight-fill')) {
                map.addLayer({ id: 'country-highlight-fill', type: 'fill', source: 'countries', paint: { 'fill-color': HIGHLIGHT_FILL, 'fill-opacity': ['case', ['boolean', ['feature-state', 'highlighted'], false], 1, 0] } });
            }
            if (!map.getLayer('country-highlight-border')) {
                map.addLayer({ id: 'country-highlight-border', type: 'line', source: 'countries', paint: { 'line-color': HIGHLIGHT_BORDER, 'line-width': ['case', ['boolean', ['feature-state', 'highlighted'], false], 3, 0] } });
            }
        };

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: MAPTILER_STYLE,
            center: [35, 20],
            zoom: 2,
            minZoom: 1.5,
            maxZoom: 20,
            projection: 'globe',
            attributionControl: false,
            fadeDuration: 0,
            maxTileCacheSize: 50,
            collectResourceTiming: false,
        });
        mapRef.current = map;

        map.on('load', () => {
            setupBaseLayers(map);

            let hoveredId = null;
            map.on('click', (e) => {
                /* Guard: if layers were stripped by a style swap, skip */
                try {
                    if (hoveredId !== null) map.setFeatureState({ source: 'countries', id: hoveredId }, { highlighted: false });
                    const f = map.queryRenderedFeatures(e.point, { layers: ['country-borders', 'country-highlight-fill'] });
                    hoveredId = f.length > 0 ? f[0].id : null;
                    if (hoveredId !== null) map.setFeatureState({ source: 'countries', id: hoveredId }, { highlighted: true });
                } catch { }
            });

            /* ── System crosshair cursor + coord readout (rAF-throttled) ── */
            map.getCanvas().style.cursor = 'crosshair';

            let coordRaf = 0;
            const coordEl = coordRef.current;
            const coordLat = coordEl?.querySelector('.coord-lat');
            const coordLng = coordEl?.querySelector('.coord-lng');

            map.on('mousemove', (e) => {
                if (coordRaf) return;
                coordRaf = requestAnimationFrame(() => {
                    coordRaf = 0;
                    if (!coordEl) return;
                    const { lng, lat } = e.lngLat;
                    coordLat.textContent = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
                    coordLng.textContent = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
                    coordEl.style.transform = `translate(${e.point.x + 18}px, ${e.point.y + 18}px)`;
                    coordEl.style.opacity = '1';
                });
            });
            map.getContainer().addEventListener('mouseleave', () => {
                if (coordRaf) { cancelAnimationFrame(coordRaf); coordRaf = 0; }
                if (coordEl) coordEl.style.opacity = '0';
            });

            /* ── Notify layers that map is ready ── */
            setMapReady({ instance: map, styleKey: Date.now() });
        });

        /* ══════════════════════════════════════════════════════
           Map Layer Change handler — swaps the entire tile style
           ══════════════════════════════════════════════════════ */
        const handleLayerChange = (e) => {
            const { styleUrl, layerId } = e.detail;
            activeLayerId = layerId;

            /* Save current camera so we can restore it after the swap */
            const center = map.getCenter();
            const zoom = map.getZoom();
            const bearing = map.getBearing();
            const pitch = map.getPitch();

            /* Unmount all child layer components (ConflictLayer, AviationLayer, etc.) */
            setMapReady(null);

            /* Swap the style — this removes ALL custom sources & layers */
            map.setStyle(styleUrl);

            map.once('style.load', () => {
                /* Re-add base layers on the fresh style */
                setupBaseLayers(map);

                /* Restore crosshair cursor (style swap resets it) */
                map.getCanvas().style.cursor = 'crosshair';

                /* Restore camera position */
                map.jumpTo({ center, zoom, bearing, pitch });

                /* Re-mount child layer components after style settles, with a new styleKey */
                setTimeout(() => setMapReady({ instance: map, styleKey: Date.now() }), 150);
            });
        };
        window.addEventListener('mapLayerChange', handleLayerChange);

        /* ── Map Tilt handler ── */
        const handleTiltChange = (e) => {
            const { isTilted } = e.detail;
            map.easeTo({
                pitch: isTilted ? 60 : 0,
                duration: 800,
                easing: t => t * (2 - t),
            });
        };
        window.addEventListener('mapTiltChange', handleTiltChange);

        /* ── Auto-rotation (efficient — uses single easeTo instead of per-frame setCenter) ── */
        let rotating = true;
        let rotateTimer = null;

        function startRotation() {
            if (!rotating || !mapRef.current) return;
            const c = map.getCenter();
            map.easeTo({
                center: [c.lng - 180, c.lat],
                duration: 120000,
                easing: t => t,
            });
            rotateTimer = setTimeout(startRotation, 120000);
        }
        rotateTimer = setTimeout(startRotation, 1000);

        const stop = () => {
            rotating = false;
            map.stop();
            if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
        };
        map.on('mousedown', stop);
        map.on('wheel', stop);
        map.on('touchstart', stop);

        /* ── Fly To Location handler ── */
        const handleFlyTo = (e) => {
            stop(); // Halt auto-rotation if running
            const { lat, lng, zoom = 4 } = e.detail;

            // Un-tilt map slightly if it was violently tilted so user can actually see the context
            const currentPitch = map.getPitch();
            const targetPitch = currentPitch > 40 ? 40 : currentPitch;

            map.flyTo({
                center: [lng, lat],
                zoom: zoom,
                pitch: targetPitch,
                essential: true, // this animation is considered essential with respect to prefers-reduced-motion
                duration: 2500
            });
        };
        window.addEventListener('flyToLocation', handleFlyTo);

        return () => {
            window.removeEventListener('mapLayerChange', handleLayerChange);
            window.removeEventListener('mapTiltChange', handleTiltChange);
            window.removeEventListener('flyToLocation', handleFlyTo);
            if (rotateTimer) clearTimeout(rotateTimer);
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
    }, []);

    return (
        <MapContext.Provider value={mapReady}>
            <div id="tactical-globe" style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
                <canvas ref={starsRef} className="stars-canvas" />
                <div className="globe-halo" />
                <div ref={containerRef} className="map-container" />

                {/* Layer overlays */}
                <div className="globe-layers" key={mapReady?.styleKey || 'initial'}>
                    {children}
                </div>


                {/* Coordinate tooltip */}
                <div ref={coordRef} className="coord-tooltip">
                    <span className="coord-icon">⊕</span>
                    <div className="coord-values">
                        <span className="coord-lat">0.0000° N</span>
                        <span className="coord-lng">0.0000° E</span>
                    </div>
                </div>

                <style>{`
                    .stars-canvas { position:absolute; inset:0; z-index:0; width:100%; height:100%; }
                    .globe-halo {
                        position:absolute; inset:0; z-index:1; pointer-events:none;
                        background: radial-gradient(circle at 50% 50%,
                            rgba(230,126,34,0.10) 15%, rgba(200,120,50,0.06) 25%,
                            rgba(55,123,191,0.08) 40%, rgba(30,90,160,0.05) 55%,
                            rgba(20,70,140,0.03) 70%, transparent 90%);
                    }
                    .map-container { position:absolute; inset:0; z-index:2; opacity:1; }
                    .globe-layers { position:absolute; inset:0; z-index:3; pointer-events:none; }
                    .maplibregl-ctrl-logo, .maplibregl-ctrl-attrib { display:none!important; }
                    .maplibregl-canvas { background:transparent!important; cursor:crosshair!important; }

                    /* ── Coordinate tooltip ── */
                    .coord-tooltip {
                        position: absolute;
                        top: 0; left: 0;
                        z-index: 10;
                        pointer-events: none;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 4px 8px;
                        background: rgba(0,0,0,0.75);
                        border: 1px solid rgba(255,255,255,0.15);
                        opacity: 0;
                        will-change: transform, opacity;
                        font-family: 'Share Tech Mono', monospace;
                        white-space: nowrap;
                    }
                    .coord-icon {
                        font-size: 10px;
                        color: rgba(230,126,34,0.7);
                        line-height: 1;
                    }
                    .coord-values {
                        display: flex;
                        flex-direction: column;
                        gap: 1px;
                    }
                    .coord-lat, .coord-lng {
                        font-size: 9px;
                        letter-spacing: 1.5px;
                        color: rgba(255,255,255,0.7);
                        line-height: 1.2;
                    }
                `}</style>
            </div>
        </MapContext.Provider>
    );
};

export default Globe;