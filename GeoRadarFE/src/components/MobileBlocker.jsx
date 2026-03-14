import React, { useState, useEffect } from 'react';

const MobileBlocker = () => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        function checkMobile() {
            // Check both screen width AND touch capability for robust detection
            const smallScreen = window.innerWidth <= 768;
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            setIsMobile(smallScreen && isTouchDevice);
        }
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!isMobile) return null;

    return (
        <>
            <div className="mobile-blocker-overlay" id="mobile-blocker">
                <div className="mobile-blocker-content">
                    {/* Warning icon */}
                    <div className="mb-icon-ring">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3232" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>

                    {/* Corner brackets */}
                    <span className="mb-corner tl" />
                    <span className="mb-corner tr" />
                    <span className="mb-corner bl" />
                    <span className="mb-corner br" />

                    {/* Header */}
                    <div className="mb-header">
                        <span className="mb-dot" />
                        <span className="mb-title">ACCESS RESTRICTED</span>
                    </div>

                    <div className="mb-divider" />

                    {/* Message */}
                    <p className="mb-message">
                        GeoRadar Tactical System requires a<br />
                        <span className="mb-highlight">desktop or PC display</span><br />
                        for full operational capability.
                    </p>

                    <div className="mb-divider" />

                    {/* Device info */}
                    <div className="mb-row">
                        <span className="mb-label">DEVICE STATUS</span>
                        <span className="mb-val mb-red">INCOMPATIBLE</span>
                    </div>
                    <div className="mb-row">
                        <span className="mb-label">MIN. DISPLAY</span>
                        <span className="mb-val">769px WIDTH</span>
                    </div>
                    <div className="mb-row">
                        <span className="mb-label">RECOMMENDED</span>
                        <span className="mb-val">1920×1080</span>
                    </div>

                    <div className="mb-divider" />

                    <p className="mb-footer">
                        ⚠ SWITCH TO A DESKTOP BROWSER TO PROCEED
                    </p>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;500;700&display=swap');

                .mobile-blocker-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    padding: 24px;
                    animation: mbFadeIn 0.5s ease-out;
                }

                @keyframes mbFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .mobile-blocker-content {
                    position: relative;
                    max-width: 340px;
                    width: 100%;
                    padding: 28px 24px;
                    background: rgba(10, 10, 15, 0.95);
                    border: 1px solid rgba(255, 50, 50, 0.25);
                    font-family: 'Share Tech Mono', monospace;
                    text-align: center;
                    animation: mbSlideUp 0.5s ease-out;
                    box-shadow:
                        0 0 30px rgba(255, 50, 50, 0.08),
                        inset 0 0 40px rgba(255, 50, 50, 0.03);
                }

                @keyframes mbSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                /* Corner brackets */
                .mb-corner {
                    position: absolute;
                    width: 12px;
                    height: 12px;
                    pointer-events: none;
                }
                .mb-corner.tl { top: -1px; left: -1px; border-top: 2px solid rgba(255, 50, 50, 0.7); border-left: 2px solid rgba(255, 50, 50, 0.7); }
                .mb-corner.tr { top: -1px; right: -1px; border-top: 2px solid rgba(255, 50, 50, 0.7); border-right: 2px solid rgba(255, 50, 50, 0.7); }
                .mb-corner.bl { bottom: -1px; left: -1px; border-bottom: 2px solid rgba(255, 50, 50, 0.7); border-left: 2px solid rgba(255, 50, 50, 0.7); }
                .mb-corner.br { bottom: -1px; right: -1px; border-bottom: 2px solid rgba(255, 50, 50, 0.7); border-right: 2px solid rgba(255, 50, 50, 0.7); }

                /* Warning icon ring */
                .mb-icon-ring {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    border: 1.5px solid rgba(255, 50, 50, 0.3);
                    margin-bottom: 20px;
                    animation: mbPulse 3s ease-in-out infinite;
                    box-shadow: 0 0 20px rgba(255, 50, 50, 0.1);
                }

                @keyframes mbPulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(255, 50, 50, 0.1); border-color: rgba(255, 50, 50, 0.3); }
                    50% { box-shadow: 0 0 30px rgba(255, 50, 50, 0.2); border-color: rgba(255, 50, 50, 0.5); }
                }

                /* Header */
                .mb-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .mb-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: #ff3232;
                    box-shadow: 0 0 8px #ff3232;
                    animation: mbBlink 1.5s ease-in-out infinite;
                }
                @keyframes mbBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                .mb-title {
                    font-family: 'Orbitron', monospace;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 3px;
                    color: rgba(255, 50, 50, 0.9);
                    text-shadow: 0 0 10px rgba(255, 50, 50, 0.3);
                }

                .mb-divider {
                    width: 100%;
                    height: 1px;
                    background: rgba(255, 255, 255, 0.06);
                    margin: 14px 0;
                }

                .mb-message {
                    font-size: 12px;
                    line-height: 1.8;
                    color: rgba(255, 255, 255, 0.65);
                    letter-spacing: 0.8px;
                    margin: 0;
                }
                .mb-highlight {
                    color: rgba(255, 255, 255, 0.95);
                    font-weight: bold;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                    text-shadow: 0 0 6px rgba(255, 255, 255, 0.15);
                }

                .mb-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 4px 0;
                }
                .mb-label {
                    font-size: 9px;
                    letter-spacing: 1.5px;
                    color: rgba(255, 255, 255, 0.35);
                }
                .mb-val {
                    font-size: 9px;
                    letter-spacing: 1px;
                    color: rgba(255, 255, 255, 0.7);
                }
                .mb-red {
                    color: #ff3232;
                    text-shadow: 0 0 4px rgba(255, 50, 50, 0.3);
                }

                .mb-footer {
                    font-size: 10px;
                    letter-spacing: 1.5px;
                    color: rgba(255, 170, 0, 0.7);
                    margin: 0;
                    animation: mbBlink 2s ease-in-out infinite;
                }
            `}</style>
        </>
    );
};

export default MobileBlocker;
