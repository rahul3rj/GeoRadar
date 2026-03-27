import React, { useState, useEffect } from 'react';

const HumanImpactPanel = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [impactData, setImpactData] = useState({
        conflictCasualties: '-',
        disasterCasualties: '-',
        activeSirens: '-',
        humanitarianAlerts: '-'
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const isLocal = window.location.hostname === 'localhost';
                const apiUrl = isLocal ? 'http://localhost:4000/api/human-impact' : '/api/human-impact';
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('API failed');
                const data = await res.json();
                setImpactData({
                    ...data
                });
            } catch (err) {
                console.error('Human Impact API Error:', err);
                // Fallback to - if failed as requested
                setImpactData({
                    conflictCasualties: '-',
                    disasterCasualties: '-',
                    activeSirens: '-',
                    humanitarianAlerts: '-'
                });
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, []);
    return (
        <div className="hud-panel" style={{ width: '100%' }}>
            <span className="hud-corner tl" />
            <span className="hud-corner tr" />
            <span className="hud-corner bl" />
            <span className="hud-corner br" />

            <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hud-dot" style={{ background: '#a050ff' }} />
                    <span className="hud-title">HUMAN IMPACT</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    {isCollapsed ? '[ + ]' : '[ - ]'}
                </span>
            </div>

            {!isCollapsed && (
                <>
                    <div className="hud-divider" />

                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{
                            flex: '0 0 100px',
                            height: '100px',
                            border: '1px solid rgba(255,255,255,0.12)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                            overflow: 'hidden',
                            background: 'rgba(0,0,0,0.3)'
                        }}>
                            <video
                                src="/human_pro.mp4"
                                autoPlay
                                loop
                                muted
                                playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85, filter: 'invert(100%)' }}
                            />
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                            <div className="hud-row" style={{ padding: '1px 0' }}>
                                <span className="hud-label">CONFLICT CASUALTIES (24H)</span>
                                <span className="hud-val" style={{ color: '#ffaa00' }}>{impactData.conflictCasualties}</span>
                            </div>
                            <div className="hud-row" style={{ padding: '1px 0' }}>
                                <span className="hud-label">DISASTER CASUALTIES (24H)</span>
                                <span className="hud-val" style={{ color: '#00c8ff' }}>{impactData.disasterCasualties}</span>
                            </div>
                            <div className="hud-row" style={{ padding: '1px 0' }}>
                                <span className="hud-label">ACTIVE SIRENS</span>
                                <span className="hud-val" style={{ color: impactData.activeSirens !== '0' && impactData.activeSirens !== '-' ? '#ff3232' : '#00c8ff', animation: impactData.activeSirens !== '0' && impactData.activeSirens !== '-' ? 'siren-pulse 1.5s ease-in-out infinite' : 'none' }}>{impactData.activeSirens}</span>
                            </div>
                            <div className="hud-row" style={{ padding: '1px 0' }}>
                                <span className="hud-label">HUMANITARIAN ALERTS</span>
                                <span className="hud-val" style={{ color: '#00ff88' }}>{impactData.humanitarianAlerts}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style>{`
                @keyframes spin {
                    0% { transform: rotateY(0deg); }
                    100% { transform: rotateY(360deg); }
                }
                @keyframes siren-pulse {
                    0%, 100% { opacity: 1; text-shadow: 0 0 6px rgba(255,50,50,0.6); }
                    50% { opacity: 0.5; text-shadow: 0 0 12px rgba(255,50,50,0.9); }
                }
            `}</style>
        </div>
    );
};

export default HumanImpactPanel;
