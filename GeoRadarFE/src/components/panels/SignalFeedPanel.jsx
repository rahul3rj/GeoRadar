import React, { useState, useEffect, useRef } from 'react';

const SignalFeedPanel = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [feed, setFeed] = useState([
        { id: 1, message: 'Connecting to global signal stream...', severity: 'info', timestamp: Date.now() }
    ]);
    const hoverAudioRef = useRef(null);

    useEffect(() => {
        hoverAudioRef.current = new Audio('/hover.ogg');
        hoverAudioRef.current.volume = 0.6;

        const wsUrl = window.location.hostname === 'localhost'
            ? 'ws://localhost:4000'
            : (import.meta.env.VITE_API_URL || window.location.origin).replace(/^http/, 'ws');
        let ws = null;
        let reconnectTimeout = null;
        let reconnectDelay = 1000; // start at 1s, exponential backoff
        let unmounted = false;

        function connect() {
            if (unmounted) return;
            try {
                ws = new WebSocket(wsUrl);
            } catch {
                scheduleReconnect();
                return;
            }

            ws.onopen = () => {
                reconnectDelay = 1000; // reset backoff on successful connect
                setFeed([{ id: 'init', message: 'Signal feed connected.', severity: 'info', timestamp: Date.now() }]);
            };

            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (payload.event === 'globalSignals') {
                        const signals = payload.data || [];
                        setFeed(signals.slice(0, 20)); // show up to 20

                        signals.forEach(sig => {
                            if (sig.type === 'earthquake' && sig.magnitude >= 3.0) {
                                const alertedKey = `alerted_${sig.id}`;
                                if (!sessionStorage.getItem(alertedKey)) {
                                    sessionStorage.setItem(alertedKey, '1');
                                    const evtMsg = new CustomEvent('severeEarthquake', { detail: sig });
                                    window.dispatchEvent(evtMsg);
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.error("[SignalFeedPanel] Error processing WS message", err);
                }
            };

            ws.onclose = () => {
                if (unmounted) return;
                setFeed(prev => [{ id: 'close', message: 'Connection lost. Retrying...', severity: 'warning', timestamp: Date.now() }, ...prev].slice(0, 20));
                scheduleReconnect();
            };

            ws.onerror = () => {
                // onclose will fire after onerror, so reconnect is handled there
            };
        }

        function scheduleReconnect() {
            if (unmounted) return;
            reconnectTimeout = setTimeout(() => {
                reconnectDelay = Math.min(reconnectDelay * 2, 30000); // cap at 30s
                connect();
            }, reconnectDelay);
        }

        connect();

        return () => {
            unmounted = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) { try { ws.close(); } catch { } }
        };
    }, []);

    return (
        <div className="hud-panel" style={{ height: isCollapsed ? 'auto' : '100%', display: 'flex', flexDirection: 'column' }}>
            <span className="hud-corner tl" />
            <span className="hud-corner tr" />
            <span className="hud-corner bl" />
            <span className="hud-corner br" />

            <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hud-dot" style={{ background: '#00c8ff' }} />
                    <span className="hud-title">GLOBAL SIGNAL FEED</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    {isCollapsed ? '[ + ]' : '[ - ]'}
                </span>
            </div>

            {!isCollapsed && (
                <>
                    <div className="hud-divider" />

                    <div className="hud-feed-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {feed.map((item, idx) => {
                            const ItemWrapper = item.url ? 'a' : 'div';
                            const onHover = () => {
                                if (!hoverAudioRef.current) return;
                                hoverAudioRef.current.currentTime = 0;
                                hoverAudioRef.current.play().catch(() => {});
                            };

                            const wrapperProps = item.url ? {
                                href: item.url,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "hud-feed-item clickable-feed",
                                style: { display: 'flex', alignItems: 'flex-start', gap: '8px', textDecoration: 'none' },
                                onMouseEnter: onHover
                            } : {
                                className: "hud-feed-item",
                                style: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
                                onMouseEnter: onHover
                            };

                            return (
                                <ItemWrapper key={`${item.id}-${idx}`} {...wrapperProps}>
                                    <span className="hud-feed-bullet" style={{
                                        backgroundColor: item.severity === 'critical' ? '#ff3232' : item.severity === 'warning' ? '#e67e22' : '#00c8ff',
                                        marginTop: '2px',
                                        boxShadow: `0 0 4px ${item.severity === 'critical' ? '#ff3232' : item.severity === 'warning' ? '#e67e22' : '#00c8ff'}`,
                                        flexShrink: 0
                                    }}></span>
                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                        <span className="hud-feed-text" style={{ fontSize: '10px', color: item.url ? 'rgba(255,255,255,0.9)' : 'rgba(188, 188, 188, 0.9)', textTransform: 'uppercase', transition: 'color 0.2s' }}>
                                            {item.message}
                                        </span>
                                        <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', fontFamily: "'Share Tech Mono', monospace" }}>
                                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                    </div>
                                    {item.url && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.3)', marginTop: '2px', flexShrink: 0 }} className="external-link-icon">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
                                        </svg>
                                    )}
                                </ItemWrapper>
                            );
                        })}
                    </div>
                </>
            )}
            <style>{`
                .clickable-feed {
                    padding: 6px;
                    margin: -6px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    cursor: pointer;
                }
                .clickable-feed:hover {
                    background: rgba(0, 200, 255, 0.08);
                    box-shadow: inset 0 0 10px rgba(0, 200, 255, 0.05);
                }
                .clickable-feed:hover .external-link-icon {
                    color: rgba(0, 200, 255, 0.8) !important;
                }
                .clickable-feed:hover .hud-feed-text {
                    color: #fff !important;
                    text-shadow: 0 0 4px rgba(0, 200, 255, 0.5);
                }
            `}</style>
        </div>
    );
};

export default SignalFeedPanel;
