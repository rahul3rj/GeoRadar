import React, { useState, useEffect } from 'react';

const ExplosionPanel = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [event, setEvent] = useState(null);

    useEffect(() => {
        const handleSevereEarthquake = async (e) => {
            const detail = e.detail;
            const lat = detail.coordinates[1];
            const lon = detail.coordinates[0];

            // Set initial state to show it while it resolves proper location
            setEvent({
                location: 'LOCATING...',
                magnitude: detail.magnitude.toFixed(1),
                confidence: detail.confidence || 'High',
                timestamp: new Date(detail.timestamp).toISOString(),
                lat: lat,
                lon: lon,
            });

            try {
                // Reverse geocoding to get City, Country
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
                if (res.ok) {
                    const data = await res.json();
                    const address = data.address;
                    if (address) {
                        const city = address.city || address.town || address.village || address.county || address.state || '';
                        const country = address.country || '';
                        const formattedLoc = [city, country].filter(Boolean).join(', ');

                        setEvent(prev => prev ? { ...prev, location: formattedLoc || detail.location } : null);
                    } else {
                        setEvent(prev => prev ? { ...prev, location: detail.location } : null);
                    }
                } else {
                    setEvent(prev => prev ? { ...prev, location: detail.location } : null);
                }
            } catch (err) {
                console.error("Reverse geocoding failed:", err);
                setEvent(prev => prev ? { ...prev, location: detail.location } : null);
            }
        };

        window.addEventListener('severeEarthquake', handleSevereEarthquake);
        return () => window.removeEventListener('severeEarthquake', handleSevereEarthquake);
    }, []);

    const handleFocus = () => {
        if (!event) return;
        // Trigger globe camera focus
        const eventMsg = new CustomEvent('focusGlobe', { detail: { lat: event.lat, lon: event.lon } });
        window.dispatchEvent(eventMsg);
    };

    if (!event) return null; // hide panel if no event

    return (
        <div className="hud-panel" style={{ cursor: 'pointer', minWidth: '350px' }} onClick={handleFocus}>
            <span className="hud-corner tl" />
            <span className="hud-corner tr" />
            <span className="hud-corner bl" />
            <span className="hud-corner br" />

            <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hud-dot" style={{ background: '#ff3232', animation: 'av-blink 1s ease-in-out infinite' }} />
                    <span className="hud-title" style={{ color: '#ff3232' }}>SEVERE SEISMIC EVENT</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    {isCollapsed ? '[ + ]' : '[ - ]'}
                </span>
            </div>

            {!isCollapsed && (
                <>
                    <div className="hud-divider" />

                    <div style={{ display: 'flex', gap: '32px' }}>
                        <div style={{ flex: 1 }}>
                            <div className="hud-row">
                                <span className="hud-label">LOC</span>
                                <span className="hud-val">{event.location}</span>
                            </div>
                            <div className="hud-row">
                                <span className="hud-label">MAG</span>
                                <span className="hud-val" style={{ color: '#ff3232' }}>{event.magnitude} Richter</span>
                            </div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className="hud-row">
                                <span className="hud-label">CONF.</span>
                                <span className="hud-val">{event.confidence}</span>
                            </div>
                            <div className="hud-row">
                                <span className="hud-label">TIME</span>
                                <span className="hud-val">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style>{`
                @keyframes av-blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
            `}</style>
        </div>
    );
};

export default ExplosionPanel;
