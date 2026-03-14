import React, { useState, useEffect } from 'react';

const LAYERS = [
    { id: 'aviation', label: 'AVIATION' },
    { id: 'marine', label: 'MARINE' },
    { id: 'conflict', label: 'CONFLICT ZONES' },
    { id: 'military', label: 'MILITARY BASES' },
    { id: 'nuclear', label: 'NUCLEAR SITES' },
    { id: 'notams', label: 'NOTAMS' },
    { id: 'chokepoints', label: 'CHOKEPOINTS' },
    { id: 'pipelines', label: 'PIPELINES' },
    { id: 'cables', label: 'INTERNET CABLES' },
    { id: 'datacenters', label: 'DATA CENTERS' },
    { id: 'satellites', label: 'SATELLITES' },
    { id: 'launch', label: 'LAUNCH SITES' },
    { id: 'weather', label: 'WEATHER' },
    { id: 'disasters', label: 'DISASTERS ZONE' },
];

const DEFAULT_ACTIVE = ['aviation', 'marine', 'conflict', 'military', 'nuclear', 'notams', 'chokepoints'];

const GlobeLayersPanel = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeLayers, setActiveLayers] = useState(DEFAULT_ACTIVE);

    // Dispatch initial state for all layers on mount
    useEffect(() => {
        const t = setTimeout(() => {
            LAYERS.forEach(layer => {
                window.dispatchEvent(new CustomEvent('globeLayerToggle', {
                    detail: { layer: layer.id, active: DEFAULT_ACTIVE.includes(layer.id) }
                }));
            });
        }, 500);
        return () => clearTimeout(t);
    }, []);

    const toggleLayer = (id) => {
        setActiveLayers(prev => {
            const isActive = prev.includes(id);
            const next = isActive ? prev.filter(l => l !== id) : [...prev, id];
            // Dispatch event so map layers can respond
            window.dispatchEvent(new CustomEvent('globeLayerToggle', {
                detail: { layer: id, active: !isActive }
            }));
            return next;
        });
    };

    return (
        <div className="hud-panel" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <span className="hud-corner tl" />
            <span className="hud-corner tr" />
            <span className="hud-corner bl" />
            <span className="hud-corner br" />

            <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hud-dot" style={{ background: '#00ff88' }} />
                    <span className="hud-title">GLOBE LAYERS</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    {isCollapsed ? '[ + ]' : '[ - ]'}
                </span>
            </div>

            {!isCollapsed && (
                <>
                    <div className="hud-divider" />

                    <div className="hud-feed-container" style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px 12px',
                        marginTop: '8px',
                        paddingBottom: '4px',
                        maxHeight: '110px', /* Fit about 5 rows before scrolling */
                        overflowY: 'auto',
                        paddingRight: '6px' /* Space for the scrollbar */
                    }}>
                        {LAYERS.map(layer => (
                            <label
                                key={layer.id}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                onClick={(e) => { e.preventDefault(); toggleLayer(layer.id); }}
                            >
                                <div style={{
                                    width: '12px',
                                    height: '12px',
                                    border: '1px solid ' + (activeLayers.includes(layer.id) ? '#00ff88' : 'rgba(255,255,255,0.3)'),
                                    background: activeLayers.includes(layer.id) ? 'rgba(0, 255, 136, 0.2)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    boxShadow: activeLayers.includes(layer.id) ? '0 0 6px rgba(0, 255, 136, 0.4)' : 'none'
                                }}>
                                    {activeLayers.includes(layer.id) && (
                                        <div style={{ width: '6px', height: '6px', background: '#00ff88' }} />
                                    )}
                                </div>
                                <span style={{
                                    fontSize: '9px',
                                    letterSpacing: '1px',
                                    fontFamily: "'Share Tech Mono', monospace",
                                    color: activeLayers.includes(layer.id) ? '#ffffff' : 'rgba(255,255,255,0.5)',
                                    transition: 'all 0.2s ease',
                                    textShadow: activeLayers.includes(layer.id) ? '0 0 4px rgba(255,255,255,0.4)' : 'none'
                                }}>
                                    {layer.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default GlobeLayersPanel;
