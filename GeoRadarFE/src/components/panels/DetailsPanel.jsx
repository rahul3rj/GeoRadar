import React, { useState, useEffect } from 'react';

const DetailsPanel = ({ progress }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [conflictData, setConflictData] = useState(null);
    const [newsData, setNewsData] = useState({
        global: [], tech: [], market: [], space: [], climate: [], local: []
    });
    const [osintFeed, setOsintFeed] = useState([]);
    const [userCountryCode, setUserCountryCode] = useState(null);

    // Hardcoded military rankings (used by Forces + Intel tabs)
    const militaryData = {
        rankings: [
            { rank: 1, country: 'USA', score: 0.0741, activeMilitary: 1388100, reserveMilitary: 844950, totalAircraft: 13247 },
            { rank: 2, country: 'RUSSIA', score: 0.0791, activeMilitary: 1150000, reserveMilitary: 2000000, totalAircraft: 4173 },
            { rank: 3, country: 'CHINA', score: 0.0919, activeMilitary: 2035000, reserveMilitary: 510000, totalAircraft: 3260 },
            { rank: 4, country: 'INDIA', score: 0.1346, activeMilitary: 1455550, reserveMilitary: 1155000, totalAircraft: 2296 },
            { rank: 5, country: 'S. KOREA', score: 0.1642, activeMilitary: 555000, reserveMilitary: 3100000, totalAircraft: 1595 },
            { rank: 6, country: 'FRANCE', score: 0.1798, activeMilitary: 205000, reserveMilitary: 35000, totalAircraft: 1055 },
            { rank: 7, country: 'JAPAN', score: 0.1876, activeMilitary: 247150, reserveMilitary: 56000, totalAircraft: 1459 },
            { rank: 8, country: 'UK', score: 0.1881, activeMilitary: 148500, reserveMilitary: 37100, totalAircraft: 693 },
            { rank: 9, country: 'TURKEY', score: 0.1975, activeMilitary: 355200, reserveMilitary: 378700, totalAircraft: 1065 },
            { rank: 10, country: 'ITALY', score: 0.2211, activeMilitary: 165500, reserveMilitary: 18300, totalAircraft: 862 },
        ]
    };

    // Fetch conflict data
    useEffect(() => {
        const controller = new AbortController();
        const fetchData = async () => {
            try {
                const isLocal = window.location.hostname === 'localhost';
                const base = isLocal ? 'http://localhost:4000' : '';

                const conflictRes = await fetch(`${base}/api/conflict-status`, { signal: controller.signal });
                if (conflictRes.ok) {
                    const cData = await conflictRes.json();
                    setConflictData(cData);
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.error('DetailsPanel fetch error:', e);
            }
        };
        fetchData();
        return () => controller.abort();
    }, []);

    // Get user's country code via geolocation (cached in localStorage to avoid repeated Nominatim calls)
    useEffect(() => {
        // Check localStorage cache first
        const cached = localStorage.getItem('georadar_user_country_code');
        if (cached) {
            setUserCountryCode(cached);
            return;
        }
        if (!('geolocation' in navigator)) return;
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const { latitude, longitude } = pos.coords;
                const revRes = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=5&addressdetails=1`
                );
                const revJson = await revRes.json();
                const iso2 = revJson.address?.country_code?.toUpperCase() || null;
                if (iso2) {
                    setUserCountryCode(iso2);
                    localStorage.setItem('georadar_user_country_code', iso2);
                }
            } catch (e) {
                console.error('Geolocation reverse lookup failed:', e);
            }
        }, () => {}, { timeout: 10000 });
    }, []);

    // Fetch news + OSINT data
    useEffect(() => {
        const isLocal = window.location.hostname === 'localhost';
        const base = isLocal ? 'http://localhost:4000' : '';
        let cancelled = false;

        const fetchNews = async () => {
            try {
                const categories = ['global', 'tech', 'market', 'space', 'climate'];
                const results = await Promise.all(
                    categories.map(cat =>
                        fetch(`${base}/api/news/${cat}`)
                            .then(r => r.ok ? r.json() : { items: [] })
                            .catch(() => ({ items: [] }))
                    )
                );
                if (cancelled) return;
                const newData = {};
                categories.forEach((cat, i) => { newData[cat] = results[i].items || []; });

                if (userCountryCode) {
                    try {
                        const localRes = await fetch(`${base}/api/news/local?countryCode=${userCountryCode}`);
                        const localJson = localRes.ok ? await localRes.json() : { items: [] };
                        newData.local = localJson.items || [];
                    } catch { newData.local = []; }
                }

                if (!cancelled) setNewsData(prev => ({ ...prev, ...newData }));
            } catch (e) {
                console.error('News fetch error:', e);
            }
        };

        const fetchOsint = async () => {
            try {
                const res = await fetch(`${base}/api/osint-feed`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setOsintFeed(data.posts || []);
                }
            } catch (e) {
                console.error('OSINT feed fetch error:', e);
            }
        };

        fetchNews();
        fetchOsint();

        const newsInterval = setInterval(fetchNews, 60000);
        const osintInterval = setInterval(fetchOsint, 60000);
        return () => { cancelled = true; clearInterval(newsInterval); clearInterval(osintInterval); };
    }, [userCountryCode]);

    const tabs = [
        { id: 'overview', label: 'STRATEGIC OVERVIEW' },
        // Hidden for now — will be updated in the future
        // { id: 'conflicts', label: 'CONFLICT ANALYSIS' },
        // { id: 'forces', label: 'FORCE DISPOSITION' },
        // { id: 'intel', label: 'INTELLIGENCE BRIEF' },
    ];

    // Time-ago helper
    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        if (isNaN(diff) || diff < 0) return '';
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'NOW';
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h`;
        return `${Math.floor(hrs / 24)}d`;
    };

    // Reusable news feed card
    const renderNewsFeedCard = (title, dotColor, items, maxH = '220px') => (
        <div className="details-card">
            <div className="details-card-header">
                <span className="hud-dot" style={{ background: dotColor }} />
                <span className="details-card-title">{title}</span>
                <span className="news-count-badge">{items.length}</span>
            </div>
            <div className="hud-divider" />
            <div className="news-card-body" style={{ maxHeight: maxH }}>
                {items.length === 0 && (
                    <span className="news-empty">AWAITING DATA FEED...</span>
                )}
                {items.map((item, i) => (
                    <a key={item.url ? `${title}-${item.url}` : `${title}-${i}`} href={item.url || '#'} target="_blank" rel="noopener noreferrer"
                       className="news-feed-item">
                        <div className="news-feed-item-row">
                            <span className="news-feed-source">{item.source || ''}</span>
                            <span className="news-feed-time">{timeAgo(item.pubDate)}</span>
                        </div>
                        <span className="news-feed-title">{item.title || ''}</span>
                    </a>
                ))}
            </div>
        </div>
    );

    // OSINT X Feed card
    const renderOsintCard = () => (
        <div className="details-card">
            <div className="details-card-header">
                <span className="hud-dot" style={{ background: '#ff3232' }} />
                <span className="details-card-title">OSINT X FEED</span>
                <span className="news-count-badge" style={{ borderColor: 'rgba(255,50,50,0.3)', color: '#ff3232' }}>
                    {osintFeed.length}
                </span>
            </div>
            <div className="hud-divider" />
            <div className="news-card-body" style={{ maxHeight: '220px' }}>
                {osintFeed.length === 0 && (
                    <span className="news-empty">AWAITING OSINT FEED...</span>
                )}
                {osintFeed.map((post, i) => (
                    <a key={post.post_id || i} href={post.source_url || '#'} target="_blank" rel="noopener noreferrer"
                       className="news-feed-item osint-post-item">
                        <div className="osint-post-header">
                            <span className="osint-account">@{post.account}</span>
                            <span className="news-feed-time">{timeAgo(post.created_at)}</span>
                        </div>
                        <span className="osint-post-text">{post.text}</span>
                        {(post.images?.length > 0 || post.videos?.length > 0) && (
                            <div className="osint-media-row">
                                {post.images?.length > 0 && (
                                    <span className="osint-media-badge">[{post.images.length} IMG]</span>
                                )}
                                {post.videos?.length > 0 && (
                                    <span className="osint-media-badge">[{post.videos.length} VID]</span>
                                )}
                            </div>
                        )}
                    </a>
                ))}
            </div>
        </div>
    );

    const renderOverview = () => (
        <div className="details-overview-grid">
            {/* Row 1: Threat Assessment | Regional Breakdown */}
            <div className="details-card ov-threat">
                <div className="details-card-header">
                    <span className="hud-dot" style={{ background: '#ff3232' }} />
                    <span className="details-card-title">GLOBAL THREAT ASSESSMENT</span>
                </div>
                <div className="hud-divider" />
                <div className="details-card-body">
                    <div className="threat-meter">
                        <div className="threat-bar">
                            <div className="threat-fill" style={{ width: `${100 - (conflictData?.globalStability ?? 65)}%` }} />
                        </div>
                        <div className="threat-labels">
                            <span>LOW</span>
                            <span>MODERATE</span>
                            <span>HIGH</span>
                            <span>CRITICAL</span>
                        </div>
                    </div>
                    <div className="details-stats-row">
                        <div className="details-stat">
                            <span className="details-stat-value" style={{ color: '#ff3232' }}>
                                {conflictData?.conflictCount ?? 0}
                            </span>
                            <span className="details-stat-label">ACTIVE CONFLICTS</span>
                        </div>
                        <div className="details-stat">
                            <span className="details-stat-value" style={{ color: '#ffaa00' }}>
                                {conflictData?.escalations ?? 0}
                            </span>
                            <span className="details-stat-label">ESCALATIONS</span>
                        </div>
                        <div className="details-stat">
                            <span className="details-stat-value" style={{ color: '#00ff88' }}>
                                {conflictData?.deEscalations ?? 0}
                            </span>
                            <span className="details-stat-label">DE-ESCALATIONS</span>
                        </div>
                        <div className="details-stat">
                            <span className="details-stat-value" style={{ color: '#00c8ff' }}>
                                {conflictData?.globalStability ?? '--'}
                            </span>
                            <span className="details-stat-label">STABILITY INDEX</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="details-card ov-regional">
                <div className="details-card-header">
                    <span className="hud-dot" style={{ background: '#00c8ff' }} />
                    <span className="details-card-title">REGIONAL BREAKDOWN</span>
                </div>
                <div className="hud-divider" />
                <div className="details-card-body">
                    <div className="region-list">
                        {(conflictData?.conflictList || []).slice(0, 8).map((c, i) => (
                            <div key={i} className="region-item">
                                <div className="region-item-left">
                                    <span className="region-severity-dot" style={{
                                        background: c.averageSeverity === 'high' ? '#ff3232' :
                                            c.averageSeverity === 'medium' ? '#ffaa00' : '#00c8ff'
                                    }} />
                                    <span className="region-name">{c.region}</span>
                                </div>
                                <div className="region-item-right">
                                    <span className="region-severity" style={{
                                        color: c.averageSeverity === 'high' ? '#ff3232' :
                                            c.averageSeverity === 'medium' ? '#ffaa00' : '#00c8ff'
                                    }}>
                                        {(c.averageSeverity || 'LOW').toUpperCase()}
                                    </span>
                                    <span className="region-events">{c.events || c.eventCount || 0} EVENTS</span>
                                </div>
                            </div>
                        ))}
                        {(!conflictData?.conflictList || conflictData.conflictList.length === 0) && (
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                                No active regional conflicts detected.
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 2: Global News | Local News | OSINT X Feed */}
            <div className="ov-global-news">
                {renderNewsFeedCard('GLOBAL NEWS', '#00c8ff', newsData.global)}
            </div>
            <div className="ov-local-news">
                {renderNewsFeedCard(
                    `LOCAL NEWS${userCountryCode ? ` // ${userCountryCode}` : ''}`,
                    '#ffaa00',
                    newsData.local
                )}
            </div>
            <div className="ov-osint">
                {renderOsintCard()}
            </div>

            {/* Row 3: Tech | Market | Space | Climate */}
            <div className="ov-tech">
                {renderNewsFeedCard('TECH', '#00ff88', newsData.tech, '180px')}
            </div>
            <div className="ov-market">
                {renderNewsFeedCard('MARKET', '#ffaa00', newsData.market, '180px')}
            </div>
            <div className="ov-space">
                {renderNewsFeedCard('SPACE', '#a050ff', newsData.space, '180px')}
            </div>
            <div className="ov-climate">
                {renderNewsFeedCard('CLIMATE / DISASTER', '#ff3232', newsData.climate, '180px')}
            </div>
        </div>
    );

    const renderConflicts = () => (
        <div className="details-single-card">
            <div className="details-card-header">
                <span className="hud-dot" style={{ background: '#ff3232' }} />
                <span className="details-card-title">DETAILED CONFLICT ANALYSIS</span>
            </div>
            <div className="hud-divider" />
            <div className="details-card-body">
                <div className="conflict-detail-list">
                    {(conflictData?.conflictList || []).map((c, i) => (
                        <div key={i} className="conflict-detail-item">
                            <div className="conflict-detail-header">
                                <span className="region-severity-dot" style={{
                                    background: c.averageSeverity === 'high' ? '#ff3232' :
                                        c.averageSeverity === 'medium' ? '#ffaa00' : '#00c8ff',
                                    width: '6px', height: '6px'
                                }} />
                                <span className="conflict-region-name">{c.region}</span>
                                <span className="conflict-event-count">{c.events || c.eventCount || 0} EVENTS</span>
                            </div>
                            <div className="conflict-detail-body">
                                <div className="hud-row">
                                    <span className="hud-label">SEVERITY</span>
                                    <span className="hud-val" style={{
                                        color: c.averageSeverity === 'high' ? '#ff3232' :
                                            c.averageSeverity === 'medium' ? '#ffaa00' : '#00c8ff'
                                    }}>
                                        {(c.averageSeverity || 'LOW').toUpperCase()}
                                    </span>
                                </div>
                                <div className="hud-row">
                                    <span className="hud-label">FATALITIES</span>
                                    <span className="hud-val">{c.fatalities?.toLocaleString() ?? 'N/A'}</span>
                                </div>
                                <div className="hud-row">
                                    <span className="hud-label">STATUS</span>
                                    <span className="hud-val" style={{ color: '#ffaa00' }}>ACTIVE</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!conflictData?.conflictList || conflictData.conflictList.length === 0) && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '11px', letterSpacing: '2px' }}>
                            NO ACTIVE CONFLICT DATA AVAILABLE
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderForces = () => (
        <div className="details-single-card">
            <div className="details-card-header">
                <span className="hud-dot" style={{ background: '#ffaa00' }} />
                <span className="details-card-title">GLOBAL FORCE DISPOSITION</span>
            </div>
            <div className="hud-divider" />
            <div className="details-card-body">
                <div className="force-detail-table">
                    <div className="force-detail-header">
                        <span style={{ width: '50px' }}>RANK</span>
                        <span style={{ flex: 1 }}>NATION</span>
                        <span style={{ width: '100px', textAlign: 'right' }}>PWR INDEX</span>
                        <span style={{ width: '120px', textAlign: 'right' }}>ACTIVE PERSONNEL</span>
                        <span style={{ width: '100px', textAlign: 'right' }}>RESERVE</span>
                        <span style={{ width: '80px', textAlign: 'right' }}>AIRCRAFT</span>
                    </div>
                    {(militaryData?.rankings || []).slice(0, 15).map((m, i) => (
                        <div key={i} className="force-detail-row">
                            <span style={{ width: '50px', color: i < 3 ? '#ffaa00' : 'rgba(255,255,255,0.6)' }}>#{i + 1}</span>
                            <span style={{ flex: 1, color: 'rgba(255,255,255,0.9)' }}>{m.country}</span>
                            <span style={{ width: '100px', textAlign: 'right', color: '#00c8ff' }}>{m.score?.toFixed(4) ?? '--'}</span>
                            <span style={{ width: '120px', textAlign: 'right' }}>{m.activeMilitary?.toLocaleString() ?? '--'}</span>
                            <span style={{ width: '100px', textAlign: 'right' }}>{m.reserveMilitary?.toLocaleString() ?? '--'}</span>
                            <span style={{ width: '80px', textAlign: 'right' }}>{m.totalAircraft?.toLocaleString() ?? '--'}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderIntel = () => (
        <div className="details-grid">
            <div className="details-card" style={{ gridColumn: '1 / -1' }}>
                <div className="details-card-header">
                    <span className="hud-dot" style={{ background: '#00c8ff' }} />
                    <span className="details-card-title">INTELLIGENCE BRIEFING</span>
                </div>
                <div className="hud-divider" />
                <div className="details-card-body">
                    <div className="intel-summary">
                        <div className="intel-item">
                            <span className="intel-time">CURRENT SESSION</span>
                            <span className="intel-text">
                                GeoRadar Tactical System is actively monitoring {conflictData?.conflictCount ?? 0} conflict zones
                                across {conflictData?.activeRegions ?? 0} regions. Global stability index
                                at {conflictData?.globalStability ?? '--'}/100.
                                {conflictData?.trend === 'UNSTABLE' ? ' Situation assessed as UNSTABLE — heightened vigilance recommended.' :
                                 ' Current trajectory assessed as STABLE.'}
                            </span>
                        </div>
                        <div className="hud-divider" />
                        <div className="intel-item">
                            <span className="intel-time">FORCE POSTURE</span>
                            <span className="intel-text">
                                Monitoring {militaryData?.rankings?.length ?? 0} national military forces.
                                Top-ranked force: {militaryData?.rankings?.[0]?.country ?? 'N/A'}
                                (PWR Index: {militaryData?.rankings?.[0]?.score?.toFixed(4) ?? '--'}).
                                Combined global active military personnel estimated
                                at {militaryData?.rankings?.reduce((sum, r) => sum + (r.activeMilitary || 0), 0).toLocaleString() ?? 'N/A'}.
                            </span>
                        </div>
                        <div className="hud-divider" />
                        <div className="intel-item">
                            <span className="intel-time">SYSTEM STATUS</span>
                            <span className="intel-text">
                                All primary monitoring subsystems operational. Satellite uplink nominal.
                                Signal intelligence feeds active. Aviation and maritime tracking engaged.
                                Seismic monitoring array online. Next scheduled data refresh in 60 seconds.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div className="details-panel-wrapper" style={{
                opacity: progress > 0.05 ? 1 : 0,
                pointerEvents: progress > 0.3 ? 'auto' : 'none',
            }}>
                <div className="hud-panel details-panel">
                    <span className="hud-corner tl" />
                    <span className="hud-corner tr" />
                    <span className="hud-corner bl" />
                    <span className="hud-corner br" />

                    {/* Header */}
                    <div className="details-panel-header">
                        <div className="hud-header" style={{ marginBottom: 0 }}>
                            <span className="hud-dot" style={{ background: '#00c8ff' }} />
                            <span className="hud-title" style={{ fontSize: '12px', letterSpacing: '3px' }}>
                                STRATEGIC COMMAND CENTER
                            </span>
                        </div>
                        <div className="details-panel-status">
                            <span className="status-badge live">● LIVE</span>
                            <span className="status-badge">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC</span>
                        </div>
                    </div>

                    <div className="hud-divider" style={{ margin: '10px 0' }} />

                    {/* Tabs */}
                    <div className="details-tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`details-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="details-content">
                        {activeTab === 'overview' && renderOverview()}
                        {activeTab === 'conflicts' && renderConflicts()}
                        {activeTab === 'forces' && renderForces()}
                        {activeTab === 'intel' && renderIntel()}
                    </div>
                </div>
            </div>

            <style>{`
                .details-panel-wrapper {
                    width: 100%;
                    height: 100%;
                    padding: 20px 40px 30px;
                    box-sizing: border-box;
                    transition: opacity 0.3s ease;
                }

                .details-panel {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    background: rgba(0, 0, 0, 0.72) !important;
                    border: 1px solid rgba(255, 255, 255, 0.12) !important;
                    backdrop-filter: blur(8px) !important;
                }

                .details-panel-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .details-panel-status {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .status-badge {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.4);
                    padding: 3px 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .status-badge.live {
                    color: #00ff88;
                    border-color: rgba(0,255,136,0.2);
                    animation: av-blink 2s ease-in-out infinite;
                }

                .details-tabs {
                    display: flex;
                    gap: 2px;
                    margin-bottom: 12px;
                }

                .details-tab {
                    flex: 1;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.35);
                    font-family: 'Orbitron', monospace;
                    font-size: 8px;
                    font-weight: 600;
                    padding: 8px 4px;
                    cursor: pointer;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    transition: all 0.25s ease;
                }
                .details-tab:hover:not(.active) {
                    background: rgba(255,255,255,0.03);
                    color: rgba(255,255,255,0.5);
                }
                .details-tab.active {
                    background: rgba(255, 170, 0, 0.08);
                    color: #ffaa00;
                    border-color: rgba(255, 170, 0, 0.3);
                    box-shadow: 0 0 12px rgba(255, 170, 0, 0.1);
                }

                .details-content {
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding-right: 4px;
                }

                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }

                /* ═══ Overview 12-column grid ═══ */
                .details-overview-grid {
                    display: grid;
                    gap: 10px;
                    grid-template-columns: repeat(12, 1fr);
                }
                .ov-threat { grid-column: span 6; }
                .ov-regional { grid-column: span 6; }
                .ov-global-news { grid-column: span 4; }
                .ov-local-news { grid-column: span 4; }
                .ov-osint { grid-column: span 4; }
                .ov-tech { grid-column: span 3; }
                .ov-market { grid-column: span 3; }
                .ov-space { grid-column: span 3; }
                .ov-climate { grid-column: span 3; }

                .details-card, .details-single-card {
                    background: rgba(255,255,255,0.02);
                    border: 1px solid rgba(255,255,255,0.06);
                    padding: 14px 16px;
                }

                .details-single-card {
                    width: 100%;
                }

                .details-card-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 6px;
                }

                .details-card-title {
                    font-family: 'Orbitron', monospace;
                    font-size: 9px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.6);
                }

                .details-card-body {
                    padding-top: 6px;
                }

                /* ═══ News Feed Styles ═══ */
                .news-count-badge {
                    margin-left: auto;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 1px;
                    color: rgba(0,200,255,0.6);
                    border: 1px solid rgba(0,200,255,0.15);
                    padding: 1px 5px;
                    line-height: 1.3;
                }

                .news-card-body {
                    padding-top: 4px;
                    overflow-y: auto;
                    overflow-x: hidden;
                }

                .news-card-body::-webkit-scrollbar {
                    width: 2px;
                }
                .news-card-body::-webkit-scrollbar-track {
                    background: transparent;
                }
                .news-card-body::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.08);
                }

                .news-empty {
                    display: block;
                    padding: 20px 0;
                    text-align: center;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.15);
                }

                .news-feed-item {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    padding: 7px 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    text-decoration: none;
                    transition: background 0.2s;
                    cursor: pointer;
                }
                .news-feed-item:hover {
                    background: rgba(0, 200, 255, 0.04);
                }
                .news-feed-item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .news-feed-source {
                    font-family: 'Orbitron', monospace;
                    font-size: 7px;
                    font-weight: 600;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.3);
                    text-transform: uppercase;
                }
                .news-feed-title {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    letter-spacing: 0.3px;
                    color: rgba(255,255,255,0.72);
                    line-height: 1.35;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .news-feed-time {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 1px;
                    color: rgba(255,255,255,0.2);
                    flex-shrink: 0;
                }

                /* ═══ OSINT Post Styles ═══ */
                .osint-post-item {
                    border-left: 2px solid rgba(255, 50, 50, 0.25);
                    padding-left: 10px !important;
                }
                .osint-post-item:hover {
                    background: rgba(255, 50, 50, 0.03);
                    border-left-color: rgba(255, 50, 50, 0.5);
                }
                .osint-post-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .osint-account {
                    font-family: 'Orbitron', monospace;
                    font-size: 8px;
                    font-weight: 600;
                    letter-spacing: 1px;
                    color: #ff3232;
                }
                .osint-post-text {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    letter-spacing: 0.3px;
                    color: rgba(255,255,255,0.65);
                    line-height: 1.35;
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .osint-media-row {
                    display: flex;
                    gap: 6px;
                    margin-top: 2px;
                }
                .osint-media-badge {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 7px;
                    letter-spacing: 1px;
                    color: rgba(0, 200, 255, 0.45);
                    border: 1px solid rgba(0, 200, 255, 0.1);
                    padding: 1px 4px;
                }

                /* Threat Meter */
                .threat-meter {
                    margin-bottom: 16px;
                }
                .threat-bar {
                    width: 100%;
                    height: 4px;
                    background: rgba(255,255,255,0.06);
                    margin-bottom: 4px;
                    position: relative;
                    overflow: hidden;
                }
                .threat-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00ff88, #ffaa00, #ff3232);
                    transition: width 1s ease;
                }
                .threat-labels {
                    display: flex;
                    justify-content: space-between;
                    font-size: 7px;
                    letter-spacing: 1px;
                    color: rgba(255,255,255,0.25);
                    font-family: 'Share Tech Mono', monospace;
                }

                /* Stats Row */
                .details-stats-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                }
                .details-stat {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    padding: 8px 4px;
                    border: 1px solid rgba(255,255,255,0.04);
                    background: rgba(0,0,0,0.3);
                }
                .details-stat-value {
                    font-family: 'Orbitron', monospace;
                    font-size: 18px;
                    font-weight: 700;
                }
                .details-stat-label {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 7px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.35);
                    text-align: center;
                }

                /* Region List */
                .region-list {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .region-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 6px 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    transition: background 0.2s;
                }
                .region-item:hover {
                    background: rgba(255,255,255,0.03);
                }
                .region-item-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .region-severity-dot {
                    width: 4px;
                    height: 4px;
                    flex-shrink: 0;
                }
                .region-name {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.8);
                    text-transform: uppercase;
                }
                .region-item-right {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .region-severity, .region-events {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 1px;
                }
                .region-events {
                    color: rgba(255,255,255,0.35);
                }

                /* Force Table */
                .force-table {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .force-table-header {
                    display: grid;
                    grid-template-columns: 50px 1fr 90px 100px;
                    padding: 6px 8px;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.3);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .force-table-row {
                    display: grid;
                    grid-template-columns: 50px 1fr 90px 100px;
                    padding: 5px 8px;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    letter-spacing: 1px;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    transition: background 0.2s;
                }
                .force-table-row:hover {
                    background: rgba(255,255,255,0.03);
                }
                .force-rank { color: #ffaa00; }
                .force-nation { color: rgba(255,255,255,0.85); text-transform: uppercase; }
                .force-index { color: #00c8ff; text-align: right; }
                .force-personnel { color: rgba(255,255,255,0.5); text-align: right; }

                /* Status Grid */
                .status-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }
                .status-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.04);
                    background: rgba(0,0,0,0.3);
                }
                .status-indicator {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .status-indicator.active { background: #00ff88; box-shadow: 0 0 6px #00ff88; }
                .status-indicator.warning { background: #ffaa00; box-shadow: 0 0 6px #ffaa00; }
                .status-name {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 1.5px;
                    color: rgba(255,255,255,0.5);
                    flex: 1;
                }
                .status-value {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 1px;
                }
                .status-value.online { color: #00ff88; }
                .status-value.warning-text { color: #ffaa00; }

                /* Conflict Detail */
                .conflict-detail-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .conflict-detail-item {
                    border: 1px solid rgba(255,255,255,0.05);
                    background: rgba(0,0,0,0.2);
                    padding: 12px 14px;
                }
                .conflict-detail-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .conflict-region-name {
                    font-family: 'Orbitron', monospace;
                    font-size: 10px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.85);
                    text-transform: uppercase;
                    flex: 1;
                }
                .conflict-event-count {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 1px;
                    color: rgba(255,255,255,0.35);
                }
                .conflict-detail-body {
                    padding-left: 16px;
                    border-left: 1px solid rgba(255,255,255,0.06);
                }

                /* Force Detail Table */
                .force-detail-table {
                    display: flex;
                    flex-direction: column;
                }
                .force-detail-header {
                    display: flex;
                    padding: 8px 12px;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.25);
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .force-detail-row {
                    display: flex;
                    padding: 7px 12px;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    letter-spacing: 1px;
                    color: rgba(255,255,255,0.5);
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    transition: background 0.2s;
                }
                .force-detail-row:hover {
                    background: rgba(0, 200, 255, 0.03);
                }

                /* Intel */
                .intel-summary {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .intel-item {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding: 8px 0;
                }
                .intel-time {
                    font-family: 'Orbitron', monospace;
                    font-size: 9px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: #00c8ff;
                }
                .intel-text {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 10px;
                    letter-spacing: 0.8px;
                    color: rgba(255,255,255,0.6);
                    line-height: 1.6;
                }

                @keyframes av-blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
            `}</style>
        </>
    );
};

export default DetailsPanel;
