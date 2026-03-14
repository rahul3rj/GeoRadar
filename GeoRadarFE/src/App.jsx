import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Trade from './pages/Trade'
import Market from './pages/Market'
import Tech from './pages/Tech'
import Space from './pages/space'
import Climate from './pages/Climate'
import Navbar from './components/Navbar'
import MobileBlocker from './components/MobileBlocker'

/* ── HUD Logo (top-left, persists across pages) ── */
const HudLogo = () => (
  <>
    <a href="/" className="hud-logo" id="site-logo">
      <span className="hud-logo-corner tl" />
      <span className="hud-logo-corner tr" />
      <span className="hud-logo-corner bl" />
      <span className="hud-logo-corner br" />

      <img src="/Logo_wide.png" alt="GeoRadar" className="hud-logo-img" />
      <div className="hud-logo-text-group">
        <span className="hud-logo-name">GEORADAR</span>
        <span className="hud-logo-sub">TACTICAL SYS</span>
      </div>
    </a>

    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Share+Tech+Mono&display=swap');

      .hud-logo {
        position: fixed;
        top: 16px;
        left: 20px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 12px 6px 6px;
        background: rgba(0, 0, 0, 0.60);
        border: 1px solid rgba(255,255,255,0.12);
        text-decoration: none;
        cursor: pointer;
        transition: border-color 0.25s ease;
      }
      .hud-logo:hover {
        border-color: rgba(230,126,34,0.35);
      }

      .hud-logo-corner {
        position: absolute;
        width: 8px;
        height: 8px;
        pointer-events: none;
      }
      .hud-logo-corner.tl { top:-1px; left:-1px; border-top:1.5px solid rgba(255,255,255,0.5); border-left:1.5px solid rgba(255,255,255,0.5); }
      .hud-logo-corner.tr { top:-1px; right:-1px; border-top:1.5px solid rgba(255,255,255,0.5); border-right:1.5px solid rgba(255,255,255,0.5); }
      .hud-logo-corner.bl { bottom:-1px; left:-1px; border-bottom:1.5px solid rgba(255,255,255,0.5); border-left:1.5px solid rgba(255,255,255,0.5); }
      .hud-logo-corner.br { bottom:-1px; right:-1px; border-bottom:1.5px solid rgba(255,255,255,0.5); border-right:1.5px solid rgba(255,255,255,0.5); }

      .hud-logo-img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        filter: drop-shadow(0 0 4px rgba(230,126,34,0.3));
      }
      .hud-logo-text-group {
        display: flex;
        flex-direction: column;
        gap: 1px;
        border-left: 1px solid rgba(255,255,255,0.10);
        padding-left: 10px;
      }
      .hud-logo-name {
        font-family: 'Orbitron', monospace;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 4px;
        color: rgba(255,255,255,0.85);
        text-shadow: 0 0 8px rgba(230,126,34,0.25);
        line-height: 1.2;
      }
      .hud-logo-sub {
        font-family: 'Share Tech Mono', monospace;
        font-size: 7px;
        letter-spacing: 3px;
        color: rgba(230,126,34,0.45);
        text-transform: uppercase;
        line-height: 1;
      }

      @media (max-width: 640px) {
        .hud-logo {
          top: 10px;
          left: 10px;
          padding: 4px 8px 4px 4px;
          gap: 6px;
        }
        .hud-logo-img { width: 22px; height: 22px; }
        .hud-logo-name { font-size: 10px; letter-spacing: 2px; }
        .hud-logo-sub { font-size: 6px; }
      }
    `}</style>
  </>
)

const App = () => {
  return (
    <BrowserRouter>
      <div className='h-screen w-full bg-zinc-900 overflow-hidden'>
        <MobileBlocker />
        <HudLogo />
        <Navbar />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/trade' element={<Trade />} />
          <Route path='/markets' element={<Market />} />
          <Route path='/tech' element={<Tech />} />
          <Route path='/space' element={<Space />} />
          <Route path='/climate' element={<Climate />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App