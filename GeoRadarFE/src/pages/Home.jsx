import React, { useState, useEffect, useRef, useCallback } from 'react';
import Globe from '../components/Globe';
import AviationLayer from '../components/AviationLayer';
import ConflictLayer from '../components/ConflictLayer';
import MarineLayer from '../components/MarineLayer';
import InfrastructureLayers from '../components/InfrastructureLayers';
import ConflictPanel from '../components/panels/ConflictPanel';
import MilitaryRankingPanel from '../components/panels/MilitaryRankingPanel';
import SignalFeedPanel from '../components/panels/SignalFeedPanel';
import PersonalZonePanel from '../components/panels/PersonalZonePanel';
import LiveIntelPanel from '../components/panels/LiveIntelPanel';
import ExplosionPanel from '../components/panels/ExplosionPanel';
import HumanImpactPanel from '../components/panels/HumanImpactPanel';
import GlobeLayersPanel from '../components/panels/GlobeLayersPanel';
import DetailsPanel from '../components/panels/DetailsPanel';

const Home = () => {
    const [scrollProgress, setScrollProgress] = useState(0);
    const targetProgress = useRef(0);
    const animFrame = useRef(null);

    // Performance warning popup
    const [showPerfWarning, setShowPerfWarning] = useState(() => {
        try {
            return localStorage.getItem('georadar_hide_perf_warning') !== 'true';
        } catch { return true; }
    });
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const dismissPerfWarning = () => {
        if (dontShowAgain) {
            try { localStorage.setItem('georadar_hide_perf_warning', 'true'); } catch {}
        }
        setShowPerfWarning(false);
    };

    // Panel visibility from Settings
    const [panelVis, setPanelVis] = useState(() => {
        try {
            const saved = localStorage.getItem('georadar_panel_settings');
            if (saved) return JSON.parse(saved);
        } catch {}
        return { conflict: true, military: true, signalFeed: true, personalZone: true, liveIntel: true, humanImpact: true, globeLayers: true, explosion: true, aviation: false, marine: false };
    });

    useEffect(() => {
        function handlePanelSettings(e) {
            setPanelVis(e.detail);
        }
        window.addEventListener('panelSettingsChange', handlePanelSettings);
        return () => window.removeEventListener('panelSettingsChange', handlePanelSettings);
    }, []);
    const containerRef = useRef(null);
    const isAnimating = useRef(false);

    // Smooth lerp animation
    const animate = useCallback(() => {
        setScrollProgress(prev => {
            const diff = targetProgress.current - prev;
            if (Math.abs(diff) < 0.001) {
                isAnimating.current = false;
                return targetProgress.current;
            }
            isAnimating.current = true;
            animFrame.current = requestAnimationFrame(animate);
            return prev + diff * 0.1;
        });
    }, []);

    // Wheel handler — implements nested scroll priority:
    // 1. Globe center area → MapLibre zoom/rotate (not intercepted)
    // 2. Scrollable panel content (Signal Feed, right column, Details, Globe Layers)
    //    → scroll panel content FIRST. Only trigger details transition when
    //    the panel's scroll reaches its boundary (top or bottom).
    // 3. Non-scrollable panel area → trigger details transition directly.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Find the nearest scrollable ancestor of an element (within a panel)
        const findScrollableAncestor = (el, panel) => {
            let current = el;
            while (current && current !== panel && current !== container) {
                const style = window.getComputedStyle(current);
                const overflowY = style.overflowY;
                const isScrollable = (overflowY === 'auto' || overflowY === 'scroll');
                // Check if element actually has scrollable content
                if (isScrollable && current.scrollHeight > current.clientHeight + 1) {
                    return current;
                }
                current = current.parentElement;
            }
            // Also check the panel itself
            if (panel) {
                const panelStyle = window.getComputedStyle(panel);
                const panelOverflow = panelStyle.overflowY;
                if ((panelOverflow === 'auto' || panelOverflow === 'scroll') && panel.scrollHeight > panel.clientHeight + 1) {
                    return panel;
                }
            }
            return null;
        };

        // Check if a scrollable element can scroll further in the given direction
        const canScrollInDirection = (el, deltaY) => {
            if (!el) return false;
            const tolerance = 2; // px tolerance for boundary detection
            if (deltaY > 0) {
                // Scrolling DOWN — can we scroll further down?
                return el.scrollTop + el.clientHeight < el.scrollHeight - tolerance;
            } else {
                // Scrolling UP — can we scroll further up?
                return el.scrollTop > tolerance;
            }
        };

        const handleWheel = (e) => {
            // Check if the event originated from a HUD panel, aviation monitor,
            // the right-column scroll container, or the details layer
            const fromPanel = e.target.closest('.hud-panel') || e.target.closest('.aviation-monitor-panel');
            const rightColumnScroller = e.target.closest('.right-col-scroll');
            const fromDetailsLayer = e.target.closest('.details-layer');
            
            // If scrolling on the globe (not on any panel/container), let maplibre handle it
            if (!fromPanel && !rightColumnScroller && !fromDetailsLayer) return;


            // Check if the scroll target is inside a scrollable element within the panel
            const scrollableEl = findScrollableAncestor(e.target, fromPanel) || 
                                  (rightColumnScroller && rightColumnScroller.scrollHeight > rightColumnScroller.clientHeight + 1 ? rightColumnScroller : null);

            // If there's a scrollable element and it can scroll in this direction,
            // let the browser handle the scroll naturally (don't trigger details transition)
            if (scrollableEl && canScrollInDirection(scrollableEl, e.deltaY)) {
                // Don't prevent default — let the panel scroll its own content
                return;
            }

            // Panel's scrollable content has reached its boundary (or panel isn't scrollable)
            // → trigger details panel transition
            e.preventDefault();

            const delta = e.deltaY;
            const sensitivity = 0.0015;

            targetProgress.current = Math.max(0, Math.min(1, targetProgress.current + delta * sensitivity));

            if (!isAnimating.current) {
                isAnimating.current = true;
                animFrame.current = requestAnimationFrame(animate);
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
            if (animFrame.current) cancelAnimationFrame(animFrame.current);
        };
    }, [animate]);


    // Calculate transforms based on progress
    const dashboardTranslateY = -scrollProgress * 100;
    const detailsTranslateY = (1 - scrollProgress) * 100;
    const dashboardOpacity = 1 - scrollProgress * 0.6;
    const dashboardScale = 1 - scrollProgress * 0.03;

    return (
        <div ref={containerRef} className='h-screen w-full bg-zinc-900 overflow-hidden relative'>

            {/* Performance Warning Popup */}
            {showPerfWarning && (
                <div className="perf-warning-overlay">
                    <div className="perf-warning-panel">
                        <span className="hud-corner tl" />
                        <span className="hud-corner tr" />
                        <span className="hud-corner bl" />
                        <span className="hud-corner br" />

                        <div className="perf-warning-icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>

                        <div className="perf-warning-title">PERFORMANCE NOTICE</div>
                        <div className="perf-warning-divider" />
                        <div className="perf-warning-msg">
                            Enabling more than <span style={{ color: '#ffaa00' }}>10 layers</span> may impact rendering performance and frame rate on lower-end hardware. Disable unused layers via the Globe Layers panel for optimal experience.
                        </div>

                        <label className="perf-warning-check">
                            <input
                                type="checkbox"
                                checked={dontShowAgain}
                                onChange={(e) => setDontShowAgain(e.target.checked)}
                            />
                            <span className="perf-check-box" />
                            <span className="perf-check-label">DON'T SHOW THIS AGAIN</span>
                        </label>

                        <button className="perf-warning-btn" onClick={dismissPerfWarning}>
                            GOT IT
                        </button>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════
                LAYER 1 — HUD Background (always behind everything)
                ══════════════════════════════════════════════════ */}
            {/* ══════════════════════════════════════════════════
                LAYER 1 — Globe (z-1)
                Full-screen globe sits BEHIND the panels.
                pointer-events: auto so it receives wheel/click/drag
                when events pass through the panels-layer.
                ══════════════════════════════════════════════════ */}
            <div className='absolute inset-0' style={{
                zIndex: 1,
                transform: `scale(${1 + scrollProgress * 0.05})`,
                opacity: 1 - scrollProgress * 0.4,
                pointerEvents: scrollProgress > 0.5 ? 'none' : 'auto',
            }}>
                <Globe>
                    <AviationLayer showPanel={panelVis.aviation !== false} />
                    {panelVis.conflict !== false && <ConflictLayer />}
                    <MarineLayer showPanel={panelVis.marine !== false} />
                    <InfrastructureLayers />
                </Globe>
            </div>

            {/* ══════════════════════════════════════════════════
                LAYER 2 — Side Panels (z-5)
                pointer-events: none on the layer itself!
                Events in the center gap pass through to the globe.
                Only the individual panels (pointer-events-auto)
                capture events, which trigger the details transition.
                ══════════════════════════════════════════════════ */}
            <div className="panels-layer" style={{
                transform: `translateY(${dashboardTranslateY}vh) scale(${dashboardScale})`,
                opacity: dashboardOpacity,
            }}>
                {/* Left Column Panels */}
                <div className='left-col absolute left-6 top-[72px] bottom-6 w-[420px] flex flex-col gap-4 pointer-events-none'>
                    {panelVis.conflict !== false && (
                    <div className='pointer-events-auto'>
                        <ConflictPanel />
                    </div>
                    )}
                    {panelVis.military !== false && (
                    <div className='pointer-events-auto'>
                        <MilitaryRankingPanel />
                    </div>
                    )}
                    {panelVis.signalFeed !== false && (
                    <div className='pointer-events-auto flex-1 overflow-hidden flex flex-col'>
                        <SignalFeedPanel />
                    </div>
                    )}
                </div>

                {/* Right Column Panels */}
                <div className='right-col absolute right-6 top-[14px] bottom-6 w-[430px] flex flex-col justify-between pointer-events-none'>
                    <div className='right-col-scroll flex flex-col gap-4 h-full overflow-y-auto pointer-events-auto pr-2 pb-2' >
                        {panelVis.personalZone !== false && (
                        <div className='shrink-0'>
                            <PersonalZonePanel />
                        </div>
                        )}
                        {panelVis.liveIntel !== false && (
                        <div className='shrink-0'>
                            <LiveIntelPanel />
                        </div>
                        )}
                        {panelVis.humanImpact !== false && (
                        <div className='shrink-0'>
                            <HumanImpactPanel />
                        </div>
                        )}
                        {panelVis.globeLayers !== false && (
                        <div className='shrink-0'>
                            <GlobeLayersPanel />
                        </div>
                        )}
                    </div>
                </div>

                {/* Bottom Center Panels (Explosion Alert) */}
                <div className='bottom-monitors absolute bottom-[160px] left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center justify-end px-4' style={{ width: 'max-content', zIndex: 2 }}>
                    {panelVis.explosion !== false && (
                    <div className='pointer-events-auto'>
                        <ExplosionPanel />
                    </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════
                LAYER 4 — Details Panel (z-30, highest)
                Slides up from the bottom as user scrolls on panels.
                ══════════════════════════════════════════════════ */}
            <div className="details-layer" style={{
                transform: `translateY(${detailsTranslateY}%)`,
            }}>
                <DetailsPanel progress={scrollProgress} />
            </div>

            {/* Scroll Indicator */}
            <div className="scroll-indicator" style={{
                opacity: scrollProgress < 0.1 ? 1 : 0,
                pointerEvents: 'none',
            }}>
                <div className="scroll-indicator-inner">
                    <div className="scroll-chevron" />
                    <div className="scroll-chevron delay" />
                    <span className="scroll-text">SCROLL FOR DETAILS</span>
                </div>
            </div>

            {/* Back to top hint */}
            <div className="back-indicator" style={{
                opacity: scrollProgress > 0.9 ? 1 : 0,
                pointerEvents: scrollProgress > 0.9 ? 'auto' : 'none',
            }} onClick={() => { targetProgress.current = 0; if (!isAnimating.current) { isAnimating.current = true; animFrame.current = requestAnimationFrame(animate); } }}>
                <div className="scroll-indicator-inner" style={{ transform: 'rotate(180deg)' }}>
                    <div className="scroll-chevron" />
                    <div className="scroll-chevron delay" />
                </div>
                <span className="scroll-text">SCROLL UP OR CLICK TO RETURN</span>
            </div>

            <style>{`
                /* Shared HUD styling */
                .hud-panel {
                    position: relative;
                    background: rgba(0, 0, 0, 0.78);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 12px 16px;
                    font-family: 'Share Tech Mono', monospace;
                    color: rgba(255,255,255,0.85);
                    contain: content; /* Isolate layout/paint from rest of page */
                }
                .hud-corner {
                    position: absolute;
                    width: 8px;
                    height: 8px;
                    pointer-events: none;
                }
                .hud-corner.tl { top: -1px; left: -1px; border-top: 1.5px solid rgba(255,255,255,0.45); border-left: 1.5px solid rgba(255,255,255,0.45); }
                .hud-corner.tr { top: -1px; right: -1px; border-top: 1.5px solid rgba(255,255,255,0.45); border-right: 1.5px solid rgba(255,255,255,0.45); }
                .hud-corner.bl { bottom: -1px; left: -1px; border-bottom: 1.5px solid rgba(255,255,255,0.45); border-left: 1.5px solid rgba(255,255,255,0.45); }
                .hud-corner.br { bottom: -1px; right: -1px; border-bottom: 1.5px solid rgba(255,255,255,0.45); border-right: 1.5px solid rgba(255,255,255,0.45); }

                .hud-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
                .hud-dot { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 6px currentColor; flex-shrink: 0; }
                .hud-title { font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 600; letter-spacing: 2px; color: rgba(255,255,255,0.7); text-transform: uppercase; }
                .hud-divider { width: 100%; height: 1px; background: rgba(255, 255, 255, 0.08); margin: 8px 0; }
                .hud-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 0; }
                .hud-label { font-size: 10px; letter-spacing: 1.5px; color: rgba(255, 255, 255, 0.45); }
                .hud-val { font-size: 11px; letter-spacing: 1px; color: rgba(255, 255, 255, 0.85); text-align: right; }
                
                .hud-table { display: flex; flex-direction: column; width: 100%; }
                
                .hud-feed-container { display: flex; flex-direction: column; gap: 6px; }
                .hud-feed-item { display: flex; align-items: flex-start; gap: 6px; }
                .hud-feed-bullet { width: 4px; height: 4px; margin-top: 4px; flex-shrink: 0; box-shadow: 0 0 4px currentColor; }
                .hud-feed-text { font-size: 9px; letter-spacing: 1px; color: rgba(255,255,255,0.7); line-height: 1.4; text-transform: uppercase; }

                .hud-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
                .hud-tab {
                    flex: 1;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.4);
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    padding: 4px 2px;
                    cursor: pointer;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .hud-tab.active {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                    border-color: rgba(255,255,255,0.4);
                }
                .hud-tab:hover:not(.active) {
                    background: rgba(255,255,255,0.05);
                }
                
                /* Scrollbar styled for hud-panel and containers */
                ::-webkit-scrollbar {
                    width: 4px;
                }
                ::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.5);
                    border-left: 1px solid rgba(255, 255, 255, 0.05);
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                }
                :hover::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.4);
                }

                /* Tactical Scrollbar specifically for Signal Feed Panel */
                .hud-feed-container::-webkit-scrollbar {
                    width: 4px;
                }
                .hud-feed-container::-webkit-scrollbar-track {
                    background: rgba(0, 40, 60, 0.2);
                    border-left: 1px solid rgba(0, 200, 255, 0.1);
                }
                .hud-feed-container::-webkit-scrollbar-thumb {
                    background: rgba(0, 200, 255, 0.4);
                    border-radius: 0px;
                }
                .hud-feed-container:hover::-webkit-scrollbar-thumb {
                    background: rgba(0, 200, 255, 0.8);
                    box-shadow: 0 0 8px rgba(0, 200, 255, 0.6);
                }

                /* ── 3-Layer Z-Index Architecture ── */
                
                /* Layer 2: Side Panels — sits above globe */
                /* pointer-events: none on the layer so center gap events
                   pass through to the globe for zoom/rotate/click */
                .panels-layer {
                    position: absolute;
                    inset: 0;
                    z-index: 5;
                    pointer-events: none;
                    will-change: transform, opacity;
                }

                /* Layer 4: Details Panel */
                .details-layer {
                    position: absolute;
                    top: 60px;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 30;
                    will-change: transform;
                    pointer-events: none;
                }
                .details-layer > * {
                    pointer-events: auto;
                }

                /* ── Scroll Indicator ── */
                .scroll-indicator {
                    position: absolute;
                    bottom: 28px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 40;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    transition: opacity 0.4s ease;
                }
                .scroll-indicator-inner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                }
                .scroll-chevron {
                    width: 16px;
                    height: 16px;
                    border-right: 1.5px solid rgba(255, 170, 0, 0.5);
                    border-bottom: 1.5px solid rgba(255, 170, 0, 0.5);
                    transform: rotate(45deg);
                    animation: chevron-bounce 2s ease-in-out infinite;
                }
                .scroll-chevron.delay {
                    animation-delay: 0.3s;
                    opacity: 0.5;
                }
                .scroll-text {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 3px;
                    color: rgba(255, 170, 0, 0.4);
                    margin-top: 8px;
                }

                @keyframes chevron-bounce {
                    0%, 100% { transform: rotate(45deg) translateY(0); opacity: 0.4; }
                    50% { transform: rotate(45deg) translateY(4px); opacity: 1; }
                }

                /* ── Back Indicator ── */
                .back-indicator {
                    position: absolute;
                    top: 72px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 40;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    transition: opacity 0.4s ease;
                }
                .back-indicator:hover .scroll-text {
                    color: rgba(255, 170, 0, 0.7);
                }

                /* ══════════════════════════════════════════════════
                   LAPTOP RESPONSIVENESS (A+D hybrid)
                   Scale transform + reduced widths/fonts.
                   Only activates ≤1440px — desktop is untouched.
                   ══════════════════════════════════════════════════ */
                @media (max-width: 1600px) {
                    /* Approach D: proportional zoom on side columns
                       (can't use transform on panels-layer since it's set inline by React) */
                    .left-col, .right-col {
                        zoom: 0.92;
                    }

                    /* Approach A: reduce column widths */
                    .left-col {
                        width: 360px !important;
                        left: 12px !important;
                        gap: 10px !important;
                    }
                    .right-col {
                        width: 340px !important;
                        right: 12px !important;
                    }
                    .right-col-scroll {
                        gap: 10px !important;
                    }

                    /* Scale down all HUD panel internals */
                    .hud-panel {
                        padding: 8px 10px !important;
                    }
                    .hud-title {
                        font-size: 8px !important;
                        letter-spacing: 1.5px !important;
                    }
                    .hud-label {
                        font-size: 8px !important;
                    }
                    .hud-val {
                        font-size: 9px !important;
                    }
                    .hud-divider {
                        margin: 5px 0 !important;
                    }
                    .hud-row {
                        padding: 2px 0 !important;
                    }
                    .hud-feed-text {
                        font-size: 8px !important;
                    }

                    /* Bottom monitors — reduce spacing */
                    .bottom-monitors {
                        bottom: 120px !important;
                    }

                    /* Navbar offset + more space below logo */
                    .left-col {
                        top: 78px !important;
                    }
                }

                /* Smaller laptops (13" screens, ~1366px) */
                @media (max-width: 1366px) {
                    .left-col, .right-col {
                        zoom: 0.85;
                    }
                    .left-col {
                        width: 290px !important;
                        left: 8px !important;
                    }
                    .right-col {
                        width: 310px !important;
                        right: 8px !important;
                    }
                    .hud-panel {
                        padding: 6px 8px !important;
                    }
                    .hud-title {
                        font-size: 7px !important;
                    }
                    .hud-label {
                        font-size: 7px !important;
                    }
                    .hud-val {
                        font-size: 8px !important;
                    }
                    .hud-feed-text {
                        font-size: 7px !important;
                    }
                    .bottom-monitors {
                        bottom: 100px !important;
                    }
                }

                /* ═══ Performance Warning Popup ═══ */
                .perf-warning-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(6px);
                    animation: perf-fade-in 0.3s ease;
                }
                .perf-warning-panel {
                    position: relative;
                    width: 380px;
                    background: rgba(8, 10, 14, 0.95);
                    border: 1px solid rgba(255, 170, 0, 0.2);
                    padding: 28px 30px 24px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0;
                    box-shadow: 0 0 40px rgba(255, 170, 0, 0.06), inset 0 0 60px rgba(0,0,0,0.4);
                }
                .perf-warning-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    border: 1px solid rgba(255, 170, 0, 0.25);
                    background: rgba(255, 170, 0, 0.06);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                    box-shadow: 0 0 20px rgba(255, 170, 0, 0.08);
                }
                .perf-warning-title {
                    font-family: 'Orbitron', monospace;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 3px;
                    color: rgba(255, 255, 255, 0.8);
                    margin-bottom: 12px;
                }
                .perf-warning-divider {
                    width: 100%;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255, 170, 0, 0.2), transparent);
                    margin-bottom: 14px;
                }
                .perf-warning-msg {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 11px;
                    letter-spacing: 0.5px;
                    line-height: 1.7;
                    color: rgba(255, 255, 255, 0.5);
                    text-align: center;
                    margin-bottom: 20px;
                }
                .perf-warning-check {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    margin-bottom: 18px;
                    user-select: none;
                }
                .perf-warning-check input {
                    display: none;
                }
                .perf-check-box {
                    width: 14px;
                    height: 14px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.03);
                    position: relative;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }
                .perf-warning-check input:checked + .perf-check-box {
                    border-color: rgba(255, 170, 0, 0.5);
                    background: rgba(255, 170, 0, 0.1);
                }
                .perf-warning-check input:checked + .perf-check-box::after {
                    content: '';
                    position: absolute;
                    top: 2px;
                    left: 4px;
                    width: 4px;
                    height: 7px;
                    border: solid #ffaa00;
                    border-width: 0 1.5px 1.5px 0;
                    transform: rotate(45deg);
                }
                .perf-check-label {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 1.5px;
                    color: rgba(255, 255, 255, 0.35);
                }
                .perf-warning-btn {
                    width: 100%;
                    padding: 10px 0;
                    background: rgba(255, 170, 0, 0.08);
                    border: 1px solid rgba(255, 170, 0, 0.25);
                    color: #ffaa00;
                    font-family: 'Orbitron', monospace;
                    font-size: 10px;
                    font-weight: 600;
                    letter-spacing: 3px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                }
                .perf-warning-btn:hover {
                    background: rgba(255, 170, 0, 0.15);
                    border-color: rgba(255, 170, 0, 0.4);
                    box-shadow: 0 0 15px rgba(255, 170, 0, 0.1);
                }
                @keyframes perf-fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default Home;
