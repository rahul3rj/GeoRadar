import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './Globe';
import satelliteSvg from '../assets/satellite.png';

const ISS_API_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const ISS_INCLINATION = 51.6;
const ISS_UPDATE_INTERVAL = 5000;
const DEG = Math.PI / 180;
const ALT_RATIO = 1.09;

/* ════════════════════════════════════════════════════════
   3-D orbit ring renderer  (canvas overlay)
   ════════════════════════════════════════════════════════ */

function getGlobeScreenRadius(map) {
    try {
        const c = map.getCenter();
        const cp = map.project(c);
        const ep = map.project(new maplibregl.LngLat(c.lng + 90, 0));
        const r = Math.hypot(ep.x - cp.x, ep.y - cp.y);
        if (r > 30) return r;
    } catch { }
    return null;
}

function drawOrbit3D(ctx, w, h, map, issLat, issLng, satImg) {
    ctx.clearRect(0, 0, w, h);
    if (issLat === 0 && issLng === 0) return;

    const globeR = getGlobeScreenRadius(map);
    if (!globeR) return;

    const INC = ISS_INCLINATION * DEG;
    const cll = map.getCenter();
    const bearing = map.getBearing() * DEG;
    const pitch = map.getPitch() * DEG;
    const cvlat = cll.lat * DEG;
    const cvlng = cll.lng * DEG;

    /* camera basis vectors */
    const radial = [
        Math.cos(cvlat) * Math.cos(cvlng),
        Math.cos(cvlat) * Math.sin(cvlng),
        Math.sin(cvlat),
    ];
    const northRaw = [
        -Math.sin(cvlat) * Math.cos(cvlng),
        -Math.sin(cvlat) * Math.sin(cvlng),
        Math.cos(cvlat),
    ];
    const eastRaw = [-Math.sin(cvlng), Math.cos(cvlng), 0];

    const cb = Math.cos(bearing), sb = Math.sin(bearing);
    const right = eastRaw.map((v, i) => v * cb + northRaw[i] * sb);
    const upRaw = eastRaw.map((v, i) => -v * sb + northRaw[i] * cb);

    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const up = upRaw.map((v, i) => v * cp + radial[i] * sp);

    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    /* orbital plane from ISS position */
    const ilat = issLat * DEG, ilng = issLng * DEG;
    const sinPhase = Math.max(-1, Math.min(1, Math.sin(ilat) / Math.sin(INC)));
    const phase0 = Math.asin(sinPhase);
    const raan = ilng - Math.atan2(Math.cos(INC) * Math.sin(phase0), Math.cos(phase0));

    const pHat = [Math.cos(raan), Math.sin(raan), 0];
    const qHat = [-Math.sin(raan) * Math.cos(INC), Math.cos(raan) * Math.cos(INC), Math.sin(INC)];

    const cx = w / 2, cy = h / 2;
    const NUM = 300;

    /* collect ring dots */
    const dots = [];
    for (let i = 0; i < NUM; i++) {
        const t = (i / NUM) * 2 * Math.PI;
        const ct = Math.cos(t), st = Math.sin(t);
        const pt = [
            ALT_RATIO * (ct * pHat[0] + st * qHat[0]),
            ALT_RATIO * (ct * pHat[1] + st * qHat[1]),
            ALT_RATIO * (ct * pHat[2] + st * qHat[2]),
        ];
        const sx = dot3(pt, right) * globeR + cx;
        const sy = -dot3(pt, up) * globeR + cy;
        const depth = dot3(pt, radial);
        const sDist = Math.hypot(sx - cx, sy - cy);
        const occluded = depth < 0 && sDist < globeR * 0.97;
        dots.push({ x: sx, y: sy, occluded, depth });
    }

    /* draw BACK half */
    for (const d of dots) {
        if (!d.occluded) continue;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 0.7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(230,126,34,0.08)';
        ctx.fill();
    }

    /* draw FRONT half */
    for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (d.occluded) continue;
        const brightness = 0.4 + 0.5 * Math.max(0, d.depth / ALT_RATIO);
        const sz = 0.8 + 0.7 * Math.max(0, d.depth / ALT_RATIO);
        ctx.beginPath();
        ctx.arc(d.x, d.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230,126,34,${brightness.toFixed(2)})`;
        ctx.fill();
        if (i % 4 === 0) {
            ctx.beginPath();
            ctx.arc(d.x, d.y, sz + 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(230,126,34,${(brightness * 0.12).toFixed(2)})`;
            ctx.fill();
        }
    }

    /* connecting arcs */
    ctx.beginPath();
    let started = false;
    for (const d of dots) {
        if (d.occluded) { started = false; continue; }
        if (!started) { ctx.moveTo(d.x, d.y); started = true; }
        else ctx.lineTo(d.x, d.y);
    }
    ctx.strokeStyle = 'rgba(230,126,34,0.10)';
    ctx.lineWidth = 0.4;
    ctx.stroke();

    /* satellite icon at ISS position */
    const issEC = [
        ALT_RATIO * Math.cos(ilat) * Math.cos(ilng),
        ALT_RATIO * Math.cos(ilat) * Math.sin(ilng),
        ALT_RATIO * Math.sin(ilat),
    ];
    const issSx = dot3(issEC, right) * globeR + cx;
    const issSy = -dot3(issEC, up) * globeR + cy;
    const issDepth = dot3(issEC, radial);

    if (issDepth > 0 && satImg && satImg.complete) {
        const grd = ctx.createRadialGradient(issSx, issSy, 0, issSx, issSy, 28);
        grd.addColorStop(0, 'rgba(230,126,34,0.35)');
        grd.addColorStop(0.5, 'rgba(230,126,34,0.10)');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(issSx - 28, issSy - 28, 56, 56);

        const sz = 36;
        ctx.drawImage(satImg, issSx - sz / 2, issSy - sz / 2, sz, sz);

        ctx.fillStyle = '#e67e22';
        ctx.font = 'bold 10px Inter, Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.fillText('ISS', issSx, issSy + sz / 2 + 14);
        ctx.shadowBlur = 0;
    }

    /* altitude tether */
    if (issDepth > 0) {
        const surfEC = [Math.cos(ilat) * Math.cos(ilng), Math.cos(ilat) * Math.sin(ilng), Math.sin(ilat)];
        const surfSx = dot3(surfEC, right) * globeR + cx;
        const surfSy = -dot3(surfEC, up) * globeR + cy;

        ctx.beginPath();
        ctx.moveTo(surfSx, surfSy);
        ctx.lineTo(issSx, issSy);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(230,126,34,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(surfSx, surfSy, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(230,126,34,0.6)';
        ctx.fill();
    }
}

/* ════════════════════════════════════════════════════════
   SpaceLayer — ISS orbit ring + satellite tracker
   ════════════════════════════════════════════════════════ */

const SpaceLayer = () => {
    const map = useMap();
    const canvasRef = useRef(null);
    const issDataRef = useRef({ lat: 0, lng: 0 });
    const intervalRef = useRef(null);
    const satImgRef = useRef(null);

    /* preload satellite icon */
    useEffect(() => {
        const img = new Image();
        img.src = satelliteSvg;
        satImgRef.current = img;
    }, []);

    /* setup orbit rendering when map is ready */
    useEffect(() => {
        if (!map || !canvasRef.current) return;

        const canvas = canvasRef.current;

        function redrawOrbit() {
            const dpr = window.devicePixelRatio || 1;
            const parent = canvas.parentElement;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();

            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                canvas.style.width = rect.width + 'px';
                canvas.style.height = rect.height + 'px';
            }
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawOrbit3D(ctx, rect.width, rect.height, map, issDataRef.current.lat, issDataRef.current.lng, satImgRef.current);
        }

        async function fetchISS() {
            try {
                const res = await fetch(ISS_API_URL);
                if (!res.ok) return;
                const d = await res.json();
                issDataRef.current = { lat: d.latitude, lng: d.longitude };
                redrawOrbit();
            } catch (e) { console.warn('ISS fetch:', e); }
        }

        map.on('render', redrawOrbit);
        fetchISS();
        intervalRef.current = setInterval(fetchISS, ISS_UPDATE_INTERVAL);

        return () => {
            map.off('render', redrawOrbit);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [map]);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
    );
};

export default SpaceLayer;
