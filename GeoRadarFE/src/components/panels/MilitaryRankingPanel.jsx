import React, { useState } from 'react';

const rankings = [
    { rank: 1, country: 'USA', score: 0.0741 },
    { rank: 2, country: 'RUS', score: 0.0791 },
    { rank: 3, country: 'CHN', score: 0.0919 },
    { rank: 4, country: 'IND', score: 0.1346 },
    { rank: 5, country: 'KOR', score: 0.1642 },
    { rank: 6, country: 'FRA', score: 0.1798 },
    { rank: 7, country: 'JPN', score: 0.1876 },
    { rank: 8, country: 'GBR', score: 0.1881 },
    { rank: 9, country: 'TUR', score: 0.1975 },
    { rank: 10, country: 'ITA', score: 0.2211 },
];

const MilitaryRankingPanel = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [hoveredNode, setHoveredNode] = useState(null);

    // 420px total container width, chart area is slightly smaller to fit smoothly inside
    const width = 380;
    const height = 140;
    const paddingX = 30;
    const paddingTop = 15;
    const paddingBottom = 25;

    const maxScore = 0.25;

    const getX = (index) => paddingX + (index * ((width - paddingX * 2) / (rankings.length - 1)));
    const getY = (score) => height - paddingBottom - (score / maxScore) * (height - paddingTop - paddingBottom);

    const points = rankings.map((r, i) => [getX(i), getY(r.score)]);

    let pathD = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
        const cp1x = points[i - 1][0] + (points[i][0] - points[i - 1][0]) / 3;
        const cp1y = points[i - 1][1];
        const cp2x = points[i][0] - (points[i][0] - points[i - 1][0]) / 3;
        const cp2y = points[i][1];
        pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i][0]} ${points[i][1]}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1][0]} ${height - paddingBottom} L ${points[0][0]} ${height - paddingBottom} Z`;

    return (
        <div className="hud-panel" style={{ width: '100%' }}>
            <span className="hud-corner tl" />
            <span className="hud-corner tr" />
            <span className="hud-corner bl" />
            <span className="hud-corner br" />

            <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hud-dot" style={{ background: '#ffffff' }} />
                    <span className="hud-title">MILITARY POWER (PWR IDX)</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    {isCollapsed ? '[ + ]' : '[ - ]'}
                </span>
            </div>

            {!isCollapsed && (
                <>
                    <div className="hud-divider" />

                    <div style={{ padding: '10px 0', position: 'relative' }}>
                        <svg viewBox={`0 0 ${width} ${height + 20}`} width="100%" style={{ overflow: 'visible', zIndex: 1, position: 'relative' }}>
                            <defs>
                                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgba(255, 255, 255, 0.2)" />
                                    <stop offset="100%" stopColor="rgba(255, 255, 255, 0.0)" />
                                </linearGradient>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Y-axis labels & horizontal grid lines */}
                            {[0, 0.1, 0.2].map((val) => {
                                const yPos = getY(val);
                                return (
                                    <g key={`y-${val}`}>
                                        <text x={paddingX - 10} y={yPos + 4} fill="#666" fontSize="10" textAnchor="end" fontFamily="monospace">
                                            {val}
                                        </text>
                                        <line
                                            x1={paddingX}
                                            y1={yPos}
                                            x2={width - paddingX + 15}
                                            y2={yPos}
                                            stroke="rgba(255,255,255,0.05)"
                                            strokeWidth="1"
                                        />
                                    </g>
                                );
                            })}

                            {/* Filled Area */}
                            <path
                                d={areaD}
                                fill="url(#areaGradient)"
                            />

                            {/* Main Smooth Curve */}
                            <path
                                d={pathD}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth="1.2"
                                filter="url(#glow)"
                                vectorEffect="non-scaling-stroke"
                            />

                            {/* Data Points & X-axis labels */}
                            {points.map((pt, i) => (
                                <g
                                    key={rankings[i].country}
                                    onMouseEnter={() => setHoveredNode(i)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <circle
                                        cx={pt[0]}
                                        cy={pt[1]}
                                        r="3.5"
                                        fill="#222"
                                        stroke="#ffffff"
                                        strokeWidth="1.5"
                                        filter="url(#glow)"
                                    />
                                    {/* Inner dot */}
                                    <circle
                                        cx={pt[0]}
                                        cy={pt[1]}
                                        r="1.5"
                                        fill="#e0e0e0"
                                    />
                                    <text
                                        x={pt[0]}
                                        y={height - paddingBottom + 18}
                                        fill="#a0a0a0"
                                        fontSize="9"
                                        textAnchor="middle"
                                        fontFamily="monospace"
                                        letterSpacing="1"
                                    >
                                        {rankings[i].country}
                                    </text>
                                </g>
                            ))}

                            {/* Bottom axis line */}
                            <line
                                x1={paddingX}
                                y1={height - paddingBottom}
                                x2={width - paddingX + 15}
                                y2={height - paddingBottom}
                                stroke="rgba(255,255,255,0.4)"
                                strokeWidth="1"
                            />

                            {/* X bottom sub-ruler ticks matching the image aesthetics */}
                            {Array.from({ length: 28 }).map((_, i) => {
                                const step = (width - paddingX * 2 + 15) / 27;
                                return (
                                    <line
                                        key={`tick-${i}`}
                                        x1={paddingX + i * step}
                                        y1={height - paddingBottom}
                                        x2={paddingX + i * step}
                                        y2={height - paddingBottom + (i % 3 === 0 ? 5 : 2)}
                                        stroke="rgba(255,255,255,0.2)"
                                        strokeWidth="1"
                                    />
                                );
                            })}
                        </svg>

                        {hoveredNode !== null && (
                            <div style={{
                                position: 'absolute',
                                left: `${points[hoveredNode][0]}px`,
                                top: `${points[hoveredNode][1] - 8}px`,
                                transform: 'translate(-50%, -100%)',
                                background: 'rgba(5, 5, 5, 0.95)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                padding: '6px 10px',
                                borderRadius: '2px',
                                pointerEvents: 'none',
                                zIndex: 10,
                                whiteSpace: 'nowrap',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
                                color: '#fff',
                                fontFamily: 'monospace',
                                fontSize: '9px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px'
                            }}>
                                <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '10px' }}>
                                    <span style={{ color: '#888', marginRight: '4px' }}>#{rankings[hoveredNode].rank}</span>
                                    {rankings[hoveredNode].country}
                                </div>
                                <div style={{ color: '#aaa', marginTop: '2px' }}>
                                    PWR IDX: <span style={{ color: '#00ff88' }}>{rankings[hoveredNode].score.toFixed(4)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default MilitaryRankingPanel;
