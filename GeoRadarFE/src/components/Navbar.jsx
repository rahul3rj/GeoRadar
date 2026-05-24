import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
    { label: 'Home', path: '/' },
    { label: 'Trade', path: '/trade' },
    { label: 'Markets', path: '/markets' },
    { label: 'Tech', path: '/tech' },
    { label: 'Space', path: '/space' },
    { label: 'Climate', path: '/climate' },
];

const MAP_LAYERS = [
    { id: 'satellite', label: 'SATELLITE' },
    { id: 'dark', label: 'DARK MODE' },
    { id: 'night', label: 'NIGHT SAT' },
];

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAP_LAYER_STYLES = {
    satellite: `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_MAP_SATELLITE}/style.json?key=${MAPTILER_KEY}`,
    dark: `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_MAP_DARK}/style.json?key=${MAPTILER_KEY}`,
    night: `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_MAP_NIGHT}/style.json?key=${MAPTILER_KEY}`,
};

const PANEL_OPTIONS = [
    { id: 'conflict', label: 'ACTIVE CONFLICT MONITOR', group: 'Left' },
    { id: 'military', label: 'MILITARY POWER RANKING', group: 'Left' },
    { id: 'signalFeed', label: 'GLOBAL SIGNAL FEED', group: 'Left' },
    { id: 'personalZone', label: 'PERSONAL ZONE', group: 'Right' },
    { id: 'liveIntel', label: 'LIVE INTEL', group: 'Right' },
    { id: 'humanImpact', label: 'HUMAN IMPACT', group: 'Right' },
    { id: 'globeLayers', label: 'GLOBE LAYERS', group: 'Right' },
    { id: 'explosion', label: 'EXPLOSION ALERT', group: 'Center' },
    { id: 'aviation', label: 'AVIATION MONITOR', group: 'Center' },
    { id: 'marine', label: 'MARINE MONITOR', group: 'Center' },
];

const DEFAULT_PANELS = {};
PANEL_OPTIONS.forEach(p => { DEFAULT_PANELS[p.id] = true; });
DEFAULT_PANELS.aviation = false;
DEFAULT_PANELS.marine = false;

/* ── Sound Wave Animation Component ── */
const SoundWaveIcon = ({ active }) => {
    const bars = [
        { height: '35%', delay: '0s' },
        { height: '60%', delay: '0.3s' },
        { height: '100%', delay: '0.6s' },
        { height: '45%', delay: '0.9s' },
        { height: '75%', delay: '0.2s' },
        { height: '50%', delay: '0.5s' },
        { height: '90%', delay: '0.8s' },
    ];
    return (
        <div className="sound-wave-container">
            {bars.map((bar, i) => (
                <div
                    key={i}
                    className={`sound-wave-bar ${active ? 'active' : ''}`}
                    style={{
                        '--bar-height': bar.height,
                        animationDelay: bar.delay,
                    }}
                />
            ))}
        </div>
    );
};

const Navbar = () => {
    const location = useLocation();
    const [tick, setTick] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [navLinksVisible, setNavLinksVisible] = useState(false);
    const [soundActive, setSoundActive] = useState(true);
    const [isTilted, setIsTilted] = useState(false);
    const [layersOpen, setLayersOpen] = useState(false);
    const [activeLayer, setActiveLayer] = useState('dark');
    const layersRef = useRef(null);
    const [panelSettings, setPanelSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('georadar_panel_settings');
            return saved ? JSON.parse(saved) : { ...DEFAULT_PANELS };
        } catch { return { ...DEFAULT_PANELS }; }
    });

    /* ── Close layers dropdown on outside click ── */
    useEffect(() => {
        const handleClick = (e) => {
            if (layersRef.current && !layersRef.current.contains(e.target)) {
                setLayersOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    /* ── Cycle a subtle code number for HUD feel ── */
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => (t + 1) % 100), 2000);
        return () => clearInterval(iv);
    }, []);

    /* ── Dispatch panel settings on change ── */
    useEffect(() => {
        localStorage.setItem('georadar_panel_settings', JSON.stringify(panelSettings));
        window.dispatchEvent(new CustomEvent('panelSettingsChange', { detail: panelSettings }));
    }, [panelSettings]);

    /* ── Dispatch initial state on mount ── */
    useEffect(() => {
        const t = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('panelSettingsChange', { detail: panelSettings }));
        }, 100);
        return () => clearTimeout(t);
    }, []);

    /* ── Global Click Sound Effect ── */
    useEffect(() => {
        const clickAudio = new Audio('/click.mp3');
        clickAudio.volume = 0.4; // Soft HUD tick sound
        
        const handleGlobalClick = (e) => {
            if (!soundActive) return;
            
            // Re-trigger sound for rapid clicks
            const target = e.target.closest('button, a, input, select, .hud-link, .map-layer-btn, .panel-toggle-item, [role="button"], .hud-header');
            
            if (target) {
                // If it's the sound toggle button itself, we might want to ONLY play it when turning ON.
                // But let's just make it play on all button clicks that are enabled.
                clickAudio.currentTime = 0;
                clickAudio.play().catch(err => console.warn('Audio play restricted by browser:', err));
            }
        };

        // Use capture phase to ensure it triggers early
        document.addEventListener('click', handleGlobalClick, true);
        return () => document.removeEventListener('click', handleGlobalClick, true);
    }, [soundActive]);

    const togglePanel = (id) => {
        setPanelSettings(prev => ({ ...prev, [id]: !prev[id] }));
    };

    /* ── Handle map layer change ── */
    const handleLayerChange = (layerId) => {
        setActiveLayer(layerId);
        setLayersOpen(false);
        const styleUrl = MAP_LAYER_STYLES[layerId];
        if (styleUrl) {
            window.dispatchEvent(new CustomEvent('mapLayerChange', { detail: { layerId, styleUrl } }));
        }
    };

    /* ── Handle map tilt toggle ── */
    const handleTiltToggle = () => {
        const newTilted = !isTilted;
        setIsTilted(newTilted);
        window.dispatchEvent(new CustomEvent('mapTiltChange', { detail: { isTilted: newTilted } }));
    };

    return (
        <>
            <nav className="hud-navbar" id="main-navbar">
                {/* ── Corner brackets (outer) ── */}
                <span className="hud-corner tl" />
                <span className="hud-corner tr" />
                <span className="hud-corner bl" />
                <span className="hud-corner br" />

                {/* ── Small square markers at midpoints ── */}
                <span className="hud-sq sq-top" />
                <span className="hud-sq sq-bot" />
                <span className="hud-sq sq-left" />
                <span className="hud-sq sq-right" />

                {/* ── Top line with GitHub / Map Layers / SYS.NAV / Sound / Settings ── */}
                <div className="hud-top-code">
                    {/* LEFT ACTIONS: GitHub + Map Layers */}
                    <div className="hud-top-actions-left">
                        {/* GitHub Button (wider, with @rahul3rj) */}
                        <a className="hud-icon-btn hud-github-wide" id="github-btn" href="https://github.com/rahul3rj" target="_blank" rel="noopener noreferrer" title="GitHub @rahul3rj">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                            <span className="github-handle">@rahul3rj</span>
                        </a>

                        {/* Map Layers Dropdown */}
                        <div className="hud-layers-dropdown" ref={layersRef}>
                            <button className="hud-icon-btn hud-layers-btn" id="layers-btn" title="Map Layers" onClick={() => setLayersOpen(!layersOpen)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                    <polyline points="2 17 12 22 22 17" />
                                    <polyline points="2 12 12 17 22 12" />
                                </svg>
                                <span className="layers-label">LAYERS</span>
                            </button>
                            {layersOpen && (
                                <div className="hud-layers-menu">
                                    <span className="hud-corner tl" />
                                    <span className="hud-corner tr" />
                                    <span className="hud-corner bl" />
                                    <span className="hud-corner br" />
                                    <div className="layers-menu-title">MAP LAYERS</div>
                                    <div className="hud-divider" style={{ margin: '4px 0' }} />
                                    {MAP_LAYERS.map(layer => (
                                        <button
                                            key={layer.id}
                                            className={`layers-menu-item ${activeLayer === layer.id ? 'active' : ''}`}
                                            onClick={() => handleLayerChange(layer.id)}
                                        >
                                            <div className={`layers-radio ${activeLayer === layer.id ? 'active' : ''}`}>
                                                {activeLayer === layer.id && <div className="layers-radio-inner" />}
                                            </div>
                                            <span>{layer.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CENTER: SYS.NAV toggle */}
                    <button
                        className={`hud-sysnav-toggle ${navLinksVisible ? 'expanded' : 'collapsed'}`}
                        id="sysnav-toggle"
                        onClick={() => setNavLinksVisible(!navLinksVisible)}
                        title={navLinksVisible ? 'Hide Navigation' : 'Show Navigation'}
                    >
                        <span className="sysnav-indicator" />
                        <span className="hud-code-text">SYS.NAV // {String(tick).padStart(2, '0')}</span>
                        <span className="sysnav-indicator" />
                    </button>

                    {/* RIGHT ACTIONS: 3D Tilt + Sound + Settings */}
                    <div className="hud-top-actions-right">
                        {/* 3D Tilt Button */}
                        <button
                            className={`hud-icon-btn hud-tilt-btn ${isTilted ? 'active' : ''}`}
                            id="tilt-btn"
                            title={isTilted ? 'Switch to Flat View' : 'Switch to 3D View'}
                            onClick={handleTiltToggle}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                {/* Cube representing 3D toggle */}
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                            <span className="tilt-label">3D</span>
                        </button>

                        {/* Sound Button with Wave Animation */}
                        <button
                            className={`hud-icon-btn hud-sound-btn ${soundActive ? 'active' : ''}`}
                            id="sound-btn"
                            title={soundActive ? 'Mute Sound' : 'Enable Sound'}
                            onClick={() => setSoundActive(!soundActive)}
                        >
                            <SoundWaveIcon active={soundActive} />
                        </button>

                        {/* Settings Button */}
                        <button className="hud-icon-btn" id="settings-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Nav links (toggle visibility) ── */}
                <div className={`hud-links ${navLinksVisible ? 'visible' : 'hidden'}`}>
                    {NAV_ITEMS.map((item, i) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                            className={({ isActive }) =>
                                `hud-link${isActive ? ' active' : ''}`
                            }
                        >
                            <span className="hud-link-bracket left">&#x250C;</span>
                            <span className="hud-link-label">{item.label}</span>
                            <span className="hud-link-bracket right">&#x2510;</span>
                        </NavLink>
                    ))}
                </div>

                {/* ── Bottom accent line ── */}
                <div className="hud-bottom-accent">
                    <span className="hud-accent-dash" />
                    <span className="hud-accent-chevron">&lt;</span>
                    <span className="hud-accent-dot" />
                    <span className="hud-accent-chevron">&gt;</span>
                    <span className="hud-accent-dash" />
                </div>
            </nav>

            {/* ═══════════════════════════════════════════════════
                SETTINGS MODAL
                ═══════════════════════════════════════════════════ */}
            {settingsOpen && (
                <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
                    <div className="settings-modal" onClick={e => e.stopPropagation()}>
                        <span className="hud-corner tl" />
                        <span className="hud-corner tr" />
                        <span className="hud-corner bl" />
                        <span className="hud-corner br" />

                        <div className="settings-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(230,126,34,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                <span className="settings-title">SYSTEM SETTINGS</span>
                            </div>
                            <button className="settings-close" onClick={() => setSettingsOpen(false)}>✕</button>
                        </div>
                        <div className="hud-divider" style={{ margin: '8px 0' }} />

                        {/* ── Panel Visibility Section ── */}
                        <div className="settings-section-label">PANEL VISIBILITY</div>
                        <div className="settings-section-desc">Toggle which HUD panels are displayed on the dashboard</div>

                        {['Left', 'Right', 'Center'].map(group => (
                            <div key={group} className="settings-group">
                                <div className="settings-group-label">{group.toUpperCase()} COLUMN</div>
                                {PANEL_OPTIONS.filter(p => p.group === group).map(panel => (
                                    <label key={panel.id} className="settings-toggle-row" onClick={(e) => { e.preventDefault(); togglePanel(panel.id); }}>
                                        <div className={`settings-checkbox ${panelSettings[panel.id] ? 'active' : ''}`}>
                                            {panelSettings[panel.id] && <div className="settings-check-inner" />}
                                        </div>
                                        <span className={`settings-toggle-label ${panelSettings[panel.id] ? 'on' : ''}`}>
                                            {panel.label}
                                        </span>
                                        <span className={`settings-status ${panelSettings[panel.id] ? 'on' : 'off'}`}>
                                            {panelSettings[panel.id] ? 'VISIBLE' : 'HIDDEN'}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        ))}

                        <div className="hud-divider" style={{ margin: '10px 0 6px 0' }} />
                        <div className="settings-footer">
                            <span className="settings-footer-text">GEORADAR v0.5 — MORE SETTINGS COMING SOON</span>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;500;700&display=swap');

                .hud-navbar {
                    position: fixed;
                    top: 14px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 9999;

                    background: rgba(0, 0, 0, 0.70);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    padding: 6px 6px 4px 6px;

                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0;
                }

                /* ═══════ Corner brackets ═══════ */
                .hud-corner {
                    position: absolute;
                    width: 10px;
                    height: 10px;
                    pointer-events: none;
                }
                .hud-corner.tl {
                    top: -1px; left: -1px;
                    border-top: 1.5px solid rgba(255,255,255,0.7);
                    border-left: 1.5px solid rgba(255,255,255,0.7);
                }
                .hud-corner.tr {
                    top: -1px; right: -1px;
                    border-top: 1.5px solid rgba(255,255,255,0.7);
                    border-right: 1.5px solid rgba(255,255,255,0.7);
                }
                .hud-corner.bl {
                    bottom: -1px; left: -1px;
                    border-bottom: 1.5px solid rgba(255,255,255,0.7);
                    border-left: 1.5px solid rgba(255,255,255,0.7);
                }
                .hud-corner.br {
                    bottom: -1px; right: -1px;
                    border-bottom: 1.5px solid rgba(255,255,255,0.7);
                    border-right: 1.5px solid rgba(255,255,255,0.7);
                }

                /* ═══════ Small square markers ═══════ */
                .hud-sq {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    border: 1px solid rgba(255,255,255,0.35);
                    pointer-events: none;
                }
                .hud-sq.sq-top  { top: -2px;    left: 50%; transform: translateX(-50%); }
                .hud-sq.sq-bot  { bottom: -2px; left: 50%; transform: translateX(-50%); }
                .hud-sq.sq-left { left: -2px;   top: 50%;  transform: translateY(-50%); }
                .hud-sq.sq-right{ right: -2px;  top: 50%;  transform: translateY(-50%); }

                /* ═══════ Top code bar — full layout ═══════ */
                .hud-top-code {
                    width: 100%;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 0 3px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                    min-height: 22px;
                    gap: 8px;
                }

                .hud-top-actions-left,
                .hud-top-actions-right {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    position: relative;
                    z-index: 2;
                    flex-shrink: 0;
                }

                .hud-code-text {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 3px;
                    color: rgba(230, 126, 34, 0.5);
                    text-transform: uppercase;
                }

                /* ═══════ Action icon buttons ═══════ */
                .hud-icon-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 20px;
                    padding: 0;
                    background: none;
                    border: 1px solid rgba(255,255,255,0.12);
                    color: rgba(255,255,255,0.45);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                }
                .hud-icon-btn:hover {
                    color: rgba(255,255,255,0.9);
                    border-color: rgba(255,255,255,0.4);
                    background: rgba(255,255,255,0.06);
                    box-shadow: 0 0 8px rgba(255,255,255,0.1);
                }
                .hud-icon-btn:hover svg {
                    filter: drop-shadow(0 0 3px rgba(255,255,255,0.3));
                }
                #settings-btn:hover svg {
                    animation: gear-spin 1.5s linear infinite;
                }
                @keyframes gear-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                /* ═══════ GitHub Wide Button ═══════ */
                .hud-github-wide {
                    width: auto !important;
                    padding: 0 10px !important;
                    gap: 6px;
                    height: 20px;
                }
                .github-handle {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.5);
                    white-space: nowrap;
                    transition: color 0.2s ease;
                }
                .hud-github-wide:hover .github-handle {
                    color: rgba(255,255,255,0.9);
                }

                /* ═══════ Map Layers Dropdown ═══════ */
                .hud-layers-dropdown {
                    position: relative;
                }
                .hud-layers-btn {
                    width: auto !important;
                    padding: 0 8px !important;
                    gap: 5px;
                    height: 20px;
                }
                .layers-label {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 7px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.45);
                    white-space: nowrap;
                    transition: color 0.2s ease;
                }
                .hud-layers-btn:hover .layers-label {
                    color: rgba(255,255,255,0.9);
                }
                .hud-layers-menu {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 50%;
                    transform: translateX(-50%);
                    min-width: 160px;
                    background: rgba(0,0,0,0.92);
                    border: 1px solid rgba(255,255,255,0.15);
                    padding: 8px 6px;
                    z-index: 99999;
                    animation: layersSlideIn 0.15s ease-out;
                }
                @keyframes layersSlideIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                .layers-menu-title {
                    font-family: 'Orbitron', monospace;
                    font-size: 7px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(230,126,34,0.7);
                    padding: 0 4px;
                }
                .layers-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 5px 6px;
                    background: none;
                    border: 1px solid transparent;
                    color: rgba(255,255,255,0.5);
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 1.5px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    text-align: left;
                }
                .layers-menu-item:hover {
                    background: rgba(255,255,255,0.04);
                    border-color: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.9);
                }
                .layers-menu-item.active {
                    color: rgba(230,126,34,0.9);
                }
                .layers-radio {
                    width: 10px;
                    height: 10px;
                    border: 1px solid rgba(255,255,255,0.25);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.2s ease;
                }
                .layers-radio.active {
                    border-color: rgba(230,126,34,0.8);
                    box-shadow: 0 0 6px rgba(230,126,34,0.3);
                }
                .layers-radio-inner {
                    width: 4px;
                    height: 4px;
                    background: rgba(230,126,34,0.9);
                }

                /* ═══════ SYS.NAV Toggle Button (absolutely centered) ═══════ */
                .hud-sysnav-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 2px 12px;
                    background: none;
                    border: 1px solid rgba(255,255,255,0.08);
                    cursor: pointer;
                    transition: all 0.25s ease;
                    /* Absolute center in the top bar */
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 1;
                }
                .hud-sysnav-toggle:hover {
                    border-color: rgba(230,126,34,0.4);
                    background: rgba(230,126,34,0.05);
                }
                .hud-sysnav-toggle .hud-code-text {
                    pointer-events: none;
                    transition: color 0.2s ease;
                }
                .hud-sysnav-toggle:hover .hud-code-text {
                    color: rgba(230,126,34,0.8);
                }
                .sysnav-indicator {
                    width: 4px;
                    height: 4px;
                    background: rgba(230,126,34,0.4);
                    transition: all 0.3s ease;
                }
                .hud-sysnav-toggle.expanded .sysnav-indicator {
                    background: #00ff88;
                    box-shadow: 0 0 6px rgba(0,255,136,0.5);
                }
                .hud-sysnav-toggle.collapsed .sysnav-indicator {
                    background: rgba(255,80,80,0.6);
                    box-shadow: 0 0 6px rgba(255,80,80,0.3);
                }

                /* ═══════ 3D Tilt Button ═══════ */
                .hud-tilt-btn {
                    width: 38px !important;
                    gap: 3px;
                }
                .tilt-label {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 7px;
                    letter-spacing: 1.5px;
                    line-height: 1;
                    padding-top: 1px;
                }
                .hud-tilt-btn.active {
                    border-color: rgba(230,126,34,0.4) !important;
                    background: rgba(230,126,34,0.08) !important;
                    color: rgba(230,126,34,0.9) !important;
                    box-shadow: inset 0 0 8px rgba(230,126,34,0.15);
                }
                .hud-tilt-btn.active svg {
                    filter: drop-shadow(0 0 4px rgba(230,126,34,0.4));
                }

                /* ═══════ Sound Button (wider) ═══════ */
                .hud-sound-btn {
                    width: 44px !important;
                    padding: 0 6px !important;
                    position: relative;
                    overflow: hidden;
                }
                .hud-sound-btn.active {
                    border-color: rgba(0,255,136,0.3) !important;
                    box-shadow: 0 0 8px rgba(0,255,136,0.15);
                }

                /* ═══════ Sound Wave Animation ═══════ */
                .sound-wave-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 2px;
                    height: 14px;
                    width: 100%;
                }
                .sound-wave-bar {
                    width: 2px;
                    height: 3px;
                    background: rgba(255,255,255,0.3);
                    transition: all 0.4s ease;
                }
                .sound-wave-bar.active {
                    background: #00ff88;
                    box-shadow: 0 0 4px rgba(0,255,136,0.5);
                    animation: soundPulse 2s ease-in-out infinite alternate;
                }
                @keyframes soundPulse {
                    0% {
                        height: 3px;
                        opacity: 0.5;
                    }
                    20% {
                        height: var(--bar-height, 8px);
                        opacity: 0.8;
                    }
                    40% {
                        height: 4px;
                        opacity: 0.4;
                    }
                    60% {
                        height: var(--bar-height, 10px);
                        opacity: 0.9;
                    }
                    80% {
                        height: 3px;
                        opacity: 0.5;
                    }
                    100% {
                        height: var(--bar-height, 6px);
                        opacity: 0.7;
                    }
                }

                /* ═══════ Nav Links with toggle animation ═══════ */
                .hud-links {
                    display: flex;
                    align-items: center;
                    gap: 0;
                    overflow: hidden;
                    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                                opacity 0.3s ease,
                                margin 0.3s ease,
                                padding 0.3s ease;
                }
                .hud-links.visible {
                    max-height: 60px;
                    opacity: 1;
                    margin-top: 0;
                    padding: 0;
                }
                .hud-links.hidden {
                    max-height: 0;
                    opacity: 0;
                    margin-top: 0;
                    padding: 0;
                    pointer-events: none;
                }

                .hud-link {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    text-decoration: none;
                    font-family: 'Orbitron', 'Share Tech Mono', monospace;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 2.5px;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.45);
                    transition: color 0.2s ease;
                    white-space: nowrap;
                }

                /* Vertical separator */
                .hud-link + .hud-link::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 30%;
                    height: 40%;
                    width: 1px;
                    background: rgba(255,255,255,0.10);
                }

                /* Bracket characters — hidden by default */
                .hud-link-bracket {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    color: rgba(230, 126, 34, 0);
                    transition: color 0.2s ease, transform 0.2s ease;
                    line-height: 1;
                }
                .hud-link-bracket.left  { transform: translateX(4px); }
                .hud-link-bracket.right { transform: translateX(-4px); }

                /* Hover state */
                .hud-link:hover {
                    color: rgba(255, 255, 255, 0.85);
                }
                .hud-link:hover .hud-link-bracket {
                    color: rgba(230, 126, 34, 0.6);
                }
                .hud-link:hover .hud-link-bracket.left  { transform: translateX(0); }
                .hud-link:hover .hud-link-bracket.right { transform: translateX(0); }

                /* Active state */
                .hud-link.active {
                    color: #fff;
                }
                .hud-link.active .hud-link-bracket {
                    color: rgba(230, 126, 34, 0.9);
                    transform: translateX(0);
                }

                /* Active bottom tick */
                .hud-link.active::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 16px;
                    height: 1.5px;
                    background: rgba(230, 126, 34, 0.7);
                    box-shadow: 0 0 6px rgba(230, 126, 34, 0.4);
                }

                /* ═══════ Bottom accent ═══════ */
                .hud-bottom-accent {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 3px 0 0 0;
                    border-top: 1px solid rgba(255,255,255,0.07);
                    width: 100%;
                    justify-content: center;
                }
                .hud-accent-dash {
                    width: 30px;
                    height: 1px;
                    background: rgba(255,255,255,0.10);
                }
                .hud-accent-chevron {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    color: rgba(230, 126, 34, 0.45);
                    line-height: 1;
                }
                .hud-accent-dot {
                    width: 3px;
                    height: 3px;
                    background: rgba(230, 126, 34, 0.35);
                    border-radius: 0;
                }

                /* ═══════ HUD Divider ═══════ */
                .hud-divider {
                    width: 100%;
                    height: 1px;
                    background: linear-gradient(90deg,
                        transparent,
                        rgba(255,255,255,0.12) 20%,
                        rgba(230,126,34,0.2) 50%,
                        rgba(255,255,255,0.12) 80%,
                        transparent
                    );
                }

                /* ═══════ Settings Modal ═══════ */
                .settings-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: settingsFadeIn 0.2s ease-out;
                }
                @keyframes settingsFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .settings-modal {
                    position: relative;
                    width: 420px;
                    max-height: 80vh;
                    overflow-y: auto;
                    padding: 16px 20px;
                    background: rgba(0,0,0,0.88);
                    border: 1px solid rgba(255,255,255,0.15);
                    font-family: 'Share Tech Mono', monospace;
                    color: rgba(255,255,255,0.85);
                    animation: settingsSlideIn 0.25s ease-out;
                }
                @keyframes settingsSlideIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .settings-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .settings-title {
                    font-family: 'Orbitron', monospace;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 2.5px;
                    color: rgba(255,255,255,0.8);
                }
                .settings-close {
                    background: none;
                    border: 1px solid rgba(255,255,255,0.15);
                    color: rgba(255,255,255,0.4);
                    font-size: 12px;
                    cursor: pointer;
                    padding: 2px 6px;
                    font-family: 'Share Tech Mono', monospace;
                    transition: all 0.2s ease;
                }
                .settings-close:hover {
                    color: #ff5555;
                    border-color: rgba(255,85,85,0.4);
                }

                .settings-section-label {
                    font-family: 'Orbitron', monospace;
                    font-size: 9px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(230,126,34,0.7);
                    margin-bottom: 2px;
                }
                .settings-section-desc {
                    font-size: 8px;
                    letter-spacing: 1px;
                    color: rgba(255,255,255,0.3);
                    margin-bottom: 10px;
                }

                .settings-group {
                    margin-bottom: 10px;
                }
                .settings-group-label {
                    font-size: 7px;
                    letter-spacing: 2.5px;
                    color: rgba(255,255,255,0.25);
                    margin-bottom: 4px;
                    padding-bottom: 3px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .settings-toggle-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 5px 4px;
                    cursor: pointer;
                    transition: background 0.15s ease;
                    border: 1px solid transparent;
                }
                .settings-toggle-row:hover {
                    background: rgba(255,255,255,0.03);
                    border-color: rgba(255,255,255,0.06);
                }

                .settings-checkbox {
                    width: 14px;
                    height: 14px;
                    border: 1px solid rgba(255,255,255,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.2s ease;
                }
                .settings-checkbox.active {
                    border-color: #00ff88;
                    box-shadow: 0 0 6px rgba(0,255,136,0.3);
                    background: rgba(0,255,136,0.1);
                }
                .settings-check-inner {
                    width: 6px;
                    height: 6px;
                    background: #00ff88;
                }

                .settings-toggle-label {
                    flex: 1;
                    font-size: 9px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.4);
                    transition: color 0.2s ease;
                }
                .settings-toggle-label.on {
                    color: rgba(255,255,255,0.85);
                }

                .settings-status {
                    font-size: 7px;
                    letter-spacing: 1.5px;
                    padding: 1px 6px;
                    border: 1px solid;
                }
                .settings-status.on {
                    color: #00ff88;
                    border-color: rgba(0,255,136,0.3);
                }
                .settings-status.off {
                    color: rgba(255,255,255,0.25);
                    border-color: rgba(255,255,255,0.1);
                }

                .settings-footer {
                    text-align: center;
                }
                .settings-footer-text {
                    font-size: 7px;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.2);
                }

                /* Scrollbar for settings modal */
                .settings-modal::-webkit-scrollbar { width: 4px; }
                .settings-modal::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
                .settings-modal::-webkit-scrollbar-thumb { background: rgba(230,126,34,0.3); }
                .settings-modal:hover::-webkit-scrollbar-thumb { background: rgba(230,126,34,0.6); }

                /* ═══════ Responsive ═══════ */
                @media (max-width: 900px) {
                    .hud-link {
                        padding: 7px 10px;
                        font-size: 8px;
                        letter-spacing: 1.5px;
                        gap: 3px;
                    }
                    .hud-github-wide .github-handle {
                        display: none;
                    }
                    .layers-label {
                        display: none;
                    }
                }
                @media (max-width: 640px) {
                    .hud-navbar {
                        top: 8px;
                        max-width: 96vw;
                        overflow-x: auto;
                    }
                    .hud-link {
                        padding: 6px 8px;
                        font-size: 7px;
                        letter-spacing: 1px;
                    }
                    .hud-link-bracket { display: none; }
                    .hud-github-wide .github-handle {
                        display: none;
                    }
                    .layers-label {
                        display: none;
                    }
                }
            `}</style>
        </>
    );
};

export default Navbar;
