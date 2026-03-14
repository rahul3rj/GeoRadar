import React, { useState, useEffect, useRef } from 'react';

const ConflictPanel = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const hoverAudioRef = useRef(null);
    const clickAudioRef = useRef(null);
    const [data, setData] = useState({
        conflictCount: 0,
        escalations: 0,
        deEscalations: 0,
        conflictList: [],
        globalStability: 100,
        trend: 'STABLE',
        alertLevel: 'STABLE',
        activeRegions: 0,
        growthRate: '0%'
    });

    useEffect(() => {
        hoverAudioRef.current = new Audio('/hover.ogg');
        hoverAudioRef.current.volume = 0.6;
        clickAudioRef.current = new Audio('/click.mp3');
        clickAudioRef.current.volume = 0.7;

        const controller = new AbortController();

        const fetchConflictData = async () => {
            try {
                const isLocal = window.location.hostname === 'localhost';
                const apiUrl = isLocal ? 'http://localhost:4000/api/conflict-status' : '/api/conflict-status';
                const res = await fetch(apiUrl, { signal: controller.signal });
                if (res.ok) {
                    const json = await res.json();
                    setData({
                        conflictCount: json.conflictCount || 0,
                        escalations: json.escalations || 0,
                        deEscalations: json.deEscalations || 0,
                        conflictList: json.conflictList || [],
                        globalStability: json.globalStability ?? 100,
                        trend: json.trend ? json.trend.toUpperCase() : 'STABLE',
                        alertLevel: json.alertLevel ? json.alertLevel.toUpperCase() : 'STABLE',
                        activeRegions: json.activeRegions || 0,
                        growthRate: json.growthRate || '0%'
                    });
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.error('Failed to fetch conflict data:', e);
            }
        };

        fetchConflictData();
        const intervalId = setInterval(fetchConflictData, 60000); // 60s update
        return () => { controller.abort(); clearInterval(intervalId); };
    }, []);

    // Helper functions for dynamic styling
    const getAlertColor = (level) => {
        if (level === 'CRITICAL') return '#ff3232';
        if (level === 'ELEVATED') return '#ffaa00';
        return '#00ff88';
    };

    const getRiskColor = (score) => {
        if (score < 40) return '#ff3232'; // critical
        if (score <= 70) return '#ffaa00'; // elevated
        return '#00c8ff'; // stable
    };

    const riskColor = getRiskColor(data.globalStability);

    return (
        <div className="hud-panel" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <span className="hud-corner tl" />
            <span className="hud-corner tr" />
            <span className="hud-corner bl" />
            <span className="hud-corner br" />

            <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hud-dot" style={{ background: '#ff3232' }} />
                    <span className="hud-title">ACTIVE CONFLICT MONITOR</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    {isCollapsed ? '[ + ]' : '[ - ]'}
                </span>
            </div>

            {!isCollapsed && (
                <>
                    <div className="hud-divider" style={{ marginBottom: '12px' }} />

                    <div style={{ display: 'flex', gap: '20px' }}>
                        {/* LEFT SIDE: List of conflicts and metrics */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                            <div className="hud-row" style={{ padding: 0 }}>
                                <span className="hud-label">CONFLICTS COUNT</span>
                                <span className="hud-val" style={{ color: '#ff3232' }}>{data.conflictCount}</span>
                            </div>
                            <div className="hud-row" style={{ padding: 0 }}>
                                <span className="hud-label">ESCALATIONS</span>
                                <span className="hud-val" style={{ color: '#ffaa00' }}>{data.escalations}</span>
                            </div>
                            <div className="hud-row" style={{ padding: 0 }}>
                                <span className="hud-label">DE-ESCALATIONS</span>
                                <span className="hud-val" style={{ color: '#00ff88' }}>{data.deEscalations}</span>
                            </div>

                            <div className="hud-divider" style={{ margin: '4px 0' }} />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                                {data.conflictList.length > 0 ? data.conflictList.map((c, i) => (
                                    <div
                                        key={i}
                                        className="conflict-list-item"
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, cursor: 'pointer', padding: '2px 0' }}
                                        onClick={() => {
                                            if (clickAudioRef.current) {
                                                clickAudioRef.current.currentTime = 0;
                                                clickAudioRef.current.play().catch(() => {});
                                            }
                                            if (c.lat && c.lon) {
                                                window.dispatchEvent(new CustomEvent('flyToLocation', { detail: { lat: c.lat, lng: c.lon, zoom: 4 } }));
                                            }
                                        }}
                                        onMouseEnter={() => {
                                            if (!hoverAudioRef.current) return;
                                            hoverAudioRef.current.currentTime = 0;
                                            hoverAudioRef.current.play().catch(() => {});
                                        }}
                                    >
                                        <span style={{ width: '3px', height: '3px', flexShrink: 0, background: c.averageSeverity === 'high' ? '#ff3232' : c.averageSeverity === 'medium' ? '#ffaa00' : '#00c8ff' }}></span>
                                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.region}>{c.region}</span>
                                    </div>
                                )) : (
                                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No active conflicts detected.</span>
                                )}
                            </div>
                        </div>

                        {/* RIGHT SIDE: Compact strategic overview widget */}
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center' }}>
                            <div className="hud-label" style={{ marginBottom: '10px', textAlign: 'center', width: '100%' }}>GLOBAL STABILITY INDEX</div>

                            <div style={{ position: 'relative', width: '70px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                {/* CSS Circle */}
                                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${riskColor}33`, borderTopColor: riskColor, animation: 'spin 3s linear infinite' }}></div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '20px', color: riskColor, fontWeight: 'bold' }}>{data.globalStability}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                                <div className="hud-row" style={{ padding: 0, justifyContent: 'space-between' }}>
                                    <span className="hud-label" style={{ fontSize: '8px' }}>TREND</span>
                                    <span className="hud-val" style={{ fontSize: '9px', color: data.trend === 'UNSTABLE' ? '#ffaa00' : '#00c8ff' }}>{data.trend}</span>
                                </div>
                                <div className="hud-row" style={{ padding: 0, justifyContent: 'space-between' }}>
                                    <span className="hud-label" style={{ fontSize: '8px' }}>ACTIVE REGIONS</span>
                                    <span className="hud-val" style={{ fontSize: '9px' }}>{data.activeRegions}</span>
                                </div>
                                <div className="hud-row" style={{ padding: 0, justifyContent: 'space-between' }}>
                                    <span className="hud-label" style={{ fontSize: '8px' }}>GROWTH RATE</span>
                                    <span className="hud-val" style={{ fontSize: '9px', color: data.growthRate.startsWith('+') ? '#ffaa00' : '#00ff88' }}>{data.growthRate}</span>
                                </div>
                                <div className="hud-row" style={{ padding: 0, justifyContent: 'space-between' }}>
                                    <span className="hud-label" style={{ fontSize: '8px' }}>ALERT LEVEL</span>
                                    <span className="hud-val" style={{ fontSize: '9px', color: getAlertColor(data.alertLevel) }}>{data.alertLevel}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .conflict-list-item {
                    transition: all 0.2s ease;
                    border-radius: 2px;
                    margin: -2px 0;
                    padding: 4px !important;
                }
                .conflict-list-item:hover {
                    background: rgba(0, 200, 255, 0.08);
                    box-shadow: inset 0 0 10px rgba(0, 200, 255, 0.05);
                }
                .conflict-list-item:hover span {
                    color: #fff !important;
                    text-shadow: 0 0 4px rgba(0, 200, 255, 0.5);
                }
            `}</style>
        </div>
    );
};

export default ConflictPanel;
