import React, { useState, useEffect, useRef } from "react";

const TABS = ["News", "World Cameras", "Disaster Feeds"];

const SOURCES = {
  News: [
    {
      label: "Bloomberg",
      url: "https://www.youtube.com/embed/iEpJwprxDdk?autoplay=1&mute=1",
    },
    {
      label: "BBC World",
      url: "https://www.youtube.com/embed/rnTdXKgeEM0?autoplay=1&mute=1",
    },
    {
      label: "Al Jazeera",
      url: "https://www.youtube.com/embed/gCNeDWCI0vo?autoplay=1&mute=1",
    },
    {
      label: "Firstpost",
      url: "https://www.youtube.com/embed/EqBUxIi8wjA?autoplay=1&mute=1",
    },
    {
      label: "DW",
      url: "https://www.youtube.com/embed/LuKwFajn37U?autoplay=1&mute=1",
    },
    {
      label: "France 24",
      url: "https://www.youtube.com/embed/l8PMl7tUDIE?autoplay=1&mute=1",
    },
  ],
  "World Cameras": [
    {
      label: "Middle East",
      url: "https://www.youtube.com/embed/4E-iFtUM2kk?autoplay=1&mute=1",
    },
    {
      label: "Ukraine",
      url: "https://www.youtube.com/embed/_oGw-YRuez8?autoplay=1&mute=1",
    },
    {
      label: "Times Square",
      url: "https://www.youtube.com/embed/rnXIjl_Rzy4?autoplay=1&mute=1",
    },
    {
      label: "Tokyo City",
      url: "https://www.youtube.com/embed/_k-5U7IeK8g?autoplay=1&mute=1",
    },
    {
      label: "Taipei",
      url: "https://www.youtube.com/embed/z_fY1pj1VBw?autoplay=1&mute=1",
    },
  ],
  "Disaster Feeds": [
    {
      label: "GDACS Updates",
      url: "https://www.youtube.com/embed/wOXmOFvI9EI?autoplay=1&mute=1",
    },
    {
      label: "Weather Radar",
      url: "https://www.youtube.com/embed/gM4OvyQOzn8?autoplay=1&mute=1",
    },
    {
      label: "Earthquake Monitor",
      url: "https://www.youtube.com/embed/eAkCy1K9TKA?autoplay=1&mute=1",
    },
  ],
};

const INITIAL_STREAMS = Object.fromEntries(
  Object.entries(SOURCES).map(([tab, list]) => [tab, list[0]?.url]),
);

const LiveIntelPanel = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [activeStreams, setActiveStreams] = useState(INITIAL_STREAMS);
  const [openDropdown, setOpenDropdown] = useState(null);
  const tabsRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (!tabsRef.current) return;
      if (!tabsRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <div className="hud-panel" style={{ width: "100%" }}>
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />

      <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="hud-dot" style={{ background: "#a050ff" }} />
          <span className="hud-title">LIVE INTEL</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
          {isCollapsed ? '[ + ]' : '[ - ]'}
        </span>
      </div>

      {!isCollapsed && (
        <>
          <div className="hud-divider" />

          <div className="hud-tabs" style={{ display: "flex" }} ref={tabsRef}>
            {TABS.map((tab) => (
              <div
                key={tab}
                className={`hud-tab-wrap ${activeTab === tab ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  marginRight: "6px",
                  flex: 1,
                }}
              >
                <button
                  className={`hud-tab ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <span style={{ flex: 1, textAlign: "center" }}>{tab}</span>
                  <span
                    className="hud-drop-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdown((prev) => (prev === tab ? null : tab));
                    }}
                    aria-label="Select source"
                    style={{
                      width: "16px",
                      height: "16px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "2px",
                      background: "rgba(0,0,0,0.6)",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: "9px",
                      lineHeight: 1,
                      cursor: "pointer",
                      transition: "all 160ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
                      e.currentTarget.style.color = "#fff";
                      e.currentTarget.style.background = "rgba(45, 12, 67, 0.6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.75)";
                      e.currentTarget.style.background = "rgba(0,0,0,0.6)";
                    }}
                  >
                    ▼
                  </span>
                </button>
                {openDropdown === tab && (
                  <div
                    className="hud-dropdown"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: "2px",
                      zIndex: 50,
                      background: "rgba(0,0,0,0.82)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      padding: "6px 8px",
                      minWidth: "160px",
                    }}
                  >
                    <span className="hud-corner tl" />
                    <span className="hud-corner tr" />
                    <span className="hud-corner bl" />
                    <span className="hud-corner br" />
                    {(SOURCES[tab] || []).map((ch) => (
                      <button
                        key={ch.label}
                        className="hud-drop-item"
                        onClick={() => {
                          setActiveStreams((s) => ({ ...s, [tab]: ch.url }));
                          setOpenDropdown(null);
                          setActiveTab(tab);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          color: "rgba(255,255,255,0.85)",
                          fontSize: "10px",
                          letterSpacing: "1px",
                          padding: "4px 2px",
                          cursor: "pointer",
                        }}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hud-video-container">
            <iframe
              width="100%"
              height="220"
              src={activeStreams[activeTab]}
              title="Live Stream"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            ></iframe>
          </div>
        </>
      )}
      <style>{`
                .hud-dropdown { backdrop-filter: blur(4px); }
            `}</style>
    </div>
  );
};

export default LiveIntelPanel;
