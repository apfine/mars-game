'use client';

import { useEffect, useRef, useState } from 'react';
import { getPresenceClient } from '../utils/presenceClient.js';

export default function MarsCanvas() {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingFade, setLoadingFade] = useState(false);
  const [progress, setProgress] = useState(12);
  const [statusText, setStatusText] = useState('ESTABLISHING SATELLITE UPLINK...');

  const dismissLoading = () => {
    setLoadingFade(true);
    setTimeout(() => setLoading(false), 500);
  };

  useEffect(() => {
    let engine = null;
    let isMounted = true;
    const presence = getPresenceClient();

    // Fast simulated progress increments (0-95% in ~800ms)
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 92) return prev + Math.floor(Math.random() * 12 + 6);
        return prev;
      });
    }, 75);

    // Safety timeout: ensure loading screen NEVER blocks user for more than 1.4s
    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        clearInterval(timer);
        setProgress(100);
        setStatusText('EXPEDITION SYSTEMS OPERATIONAL');
        dismissLoading();
      }
    }, 1400);

    import('../game/engine.js').then(({ MarsGameEngine }) => {
      if (!isMounted || !containerRef.current) return;

      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }

      engine = new MarsGameEngine(containerRef.current, {
        onProgress: (pct, msg) => {
          if (!isMounted) return;
          setProgress((p) => Math.max(p, pct));
          if (msg) setStatusText(msg);
        },
        onLoaded: () => {
          if (!isMounted) return;
          clearInterval(timer);
          clearTimeout(safetyTimeout);
          setProgress(100);
          setStatusText('EXPEDITION SYSTEMS OPERATIONAL');
          setTimeout(() => {
            if (isMounted) dismissLoading();
          }, 200);
        }
      });
    }).catch((err) => {
      console.error('Engine initialization error:', err);
      clearInterval(timer);
      clearTimeout(safetyTimeout);
      dismissLoading();
    });

    return () => {
      isMounted = false;
      clearInterval(timer);
      clearTimeout(safetyTimeout);
      if (engine) {
        engine.destroy();
      }
    };
  }, []);

  return (
    <>
      {/* Cinematic Martian Loading Screen */}
      {loading && (
        <div
          id="mars-loading-screen"
          className={`loading-screen-overlay ${loadingFade ? 'fade-out' : ''}`}
          onClick={dismissLoading}
          onTouchStart={dismissLoading}
          aria-live="polite"
        >
          <div className="loading-card" onClick={(e) => e.stopPropagation()}>
            {/* Animated Mars Radar Pulse */}
            <div className="loading-radar">
              <div className="radar-sweep"></div>
              <div className="radar-core"></div>
              <div className="radar-ring r1"></div>
              <div className="radar-ring r2"></div>
            </div>

            <div className="loading-title-box">
              <h1 className="loading-title">DUNES</h1>
              <div className="loading-badge">RED PLANET EXPEDITION</div>
            </div>

            <p className="loading-coords">
              SECTOR: 18.65°N, 226.20°E // OLYMPUS MONS CALDERA // 0.020 kg/m³ CO₂
            </p>

            {/* Glowing Amber Progress Bar */}
            <div className="loading-bar-wrap">
              <div className="loading-bar-fill" style={{ width: `${progress}%` }}>
                <span className="loading-bar-flare"></span>
              </div>
            </div>

            <div className="loading-status-row">
              <span className="loading-status-txt">{statusText}</span>
              <span className="loading-pct">{progress}%</span>
            </div>

            {/* Expedition Quick-Start Hints & Instant Launch Button */}
            <div className="loading-hint-footer">
              <div className="hint-pill"><span className="key-chip">WASD</span> Drive Rover</div>
              <div className="hint-pill"><span className="key-chip">T</span> Starship Mission</div>
              <div className="hint-pill"><span className="key-chip">G</span> Expedition Map</div>
              <div className="hint-pill"><span className="key-chip">SPACE</span> Drift / Stage</div>
            </div>

            <button
              className="loading-enter-btn"
              onClick={dismissLoading}
              aria-label="Enter Simulation"
            >
              🚀 ENTER EXPEDITION
            </button>
          </div>
        </div>
      )}

      <div id="canvas-container" ref={containerRef} />

      {/* HUD & UI Layer */}
      <div id="hud-layer">
        {/* Top-Left Scientific Mission Branding */}
        <div className="top-left-brand scientific-brand">
          <div className="mission-tag-row">
            <span className="mission-agency">NASA-JPL // SPX</span>
            <span className="mission-dot">·</span>
            <span className="mission-name">ARES-VI EXPEDITION</span>
            <span className="sys-status-badge">SYS NOMINAL</span>
          </div>
          <div className="brand-main-row">
            <span className="brand-text">MARS TELEMETRY</span>
          </div>
          <div className="scientific-sub-telemetry">
            <span id="sol-clock" className="sol-chip">SOL 492 · LMST 14:38:22</span>
            <span className="telemetry-pipe">|</span>
            <span id="met-clock" className="met-chip">MET +00:00:00.0</span>
          </div>
        </div>

        {/* Top-Center Scientific Planetary Environmental Ribbon */}
        <div className="top-center-scientific-bar">
          <div className="sci-chip">
            <span className="sci-lbl">COORDS</span>
            <span id="sci-coords-val" className="sci-val">18.42°N 226.05°W</span>
          </div>
          <div className="sci-chip">
            <span className="sci-lbl">ELEV (MOLA)</span>
            <span id="sci-elev-val" className="sci-val">-1,420 m</span>
          </div>
          <div className="sci-chip">
            <span className="sci-lbl">ATM. PRESS</span>
            <span id="sci-press-val" className="sci-val">0.636 kPa</span>
          </div>
          <div className="sci-chip">
            <span className="sci-lbl">SURF TEMP</span>
            <span id="sci-temp-val" className="sci-val">-62.4°C</span>
          </div>
          <div className="sci-chip hide-mobile">
            <span className="sci-lbl">RAD FLUX</span>
            <span id="sci-rad-val" className="sci-val">0.24 mSv/d</span>
          </div>
        </div>

        {/* Top-Right Settings & Actions */}
        <div className="top-right-bar">
          <div className="online-pill scientific-online-pill" id="online-counter-pill" title="Deep Space Network Canberra 70m Dish">
            <span className="online-dot"></span>
            <span id="online-count-val" className="online-count-num">1</span>
            <span className="online-lbl">ONLINE</span>
            <span className="dsn-carrier-badge">DSN-43</span>
            <span className="dsn-rtt-val" id="telemetry-rtt-val">24ms</span>
          </div>
          <button id="launch-mission-btn" className="hud-pill-btn launch-pill scientific-btn" aria-label="Launch Starship Mission">
            <span>🚀 STARSHIP</span>
          </button>
          <button id="map-btn" className="hud-pill-btn scientific-btn" aria-label="Map">
            <span>MAP</span>
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
          </button>
          <button id="esc-btn" className="hud-pill-btn scientific-btn" aria-label="Settings">
            <span>SYS</span>
            <svg className="gear-icon" viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>

        {/* Minimap radar display */}
        <canvas id="minimap" width="300" height="300" aria-label="Minimap"></canvas>

        {/* 3D Waypoint Projector Badges */}
        <div id="waypoint-badges"></div>

        {/* Bottom Left Desktop Hints */}
        <div className="bottom-left-hints">
          <div className="hint-row"><span className="key-label">Drive:</span> WASD / arrow keys</div>
          <div className="hint-row"><span className="key-label">Launch Starship:</span> T</div>
          <div className="hint-row"><span className="key-label">Expedition Map:</span> G</div>
          <div className="hint-row"><span className="key-label">Assist:</span> R</div>
          <div className="hint-row"><span className="key-label">Nitro:</span> Shift / N</div>
          <div className="hint-row"><span className="key-label">Handbrake:</span> Space</div>
          <div className="hint-row"><span className="key-label">Camera:</span> C</div>
          <div className="hint-row"><span className="key-label">Mark place:</span> M</div>
          <div className="hint-row"><span className="key-label">Headlights:</span> L</div>
        </div>

        {/* Bottom Center Scientific Telemetry & Diagnostics Dashboard */}
        <div className="bottom-center-telemetry scientific-dashboard">
          {/* Scientific Vehicle Diagnostics Bar */}
          <div className="rover-diagnostics-bar">
            <div className="diag-chip">
              <span className="diag-lbl">ATTITUDE</span>
              <span id="rover-gyro-val" className="diag-val">PITCH +0.0° · ROLL +0.0°</span>
            </div>
            <div className="diag-chip">
              <span className="diag-lbl">AZIMUTH</span>
              <span id="rover-heading-val" className="diag-val">000° N</span>
            </div>
            <div className="diag-chip">
              <span className="diag-lbl">ODOMETER</span>
              <span id="rover-odom-val" className="diag-val">0 m</span>
            </div>
            <div className="diag-chip hide-mobile">
              <span className="diag-lbl">POWER</span>
              <span className="diag-val highlight-green">RTG 110 W · 28.4 V</span>
            </div>
          </div>

          <div className="telemetry-gauges-row">
            {/* Cold Gas Thruster Gauge */}
            <div className="nitro-container scientific-gauge-box">
              <div className="nitro-label">COLD GAS GN₂ <span id="nitro-pct">100%</span> · 240 bar</div>
              <div className="nitro-track">
                <div id="nitro-fill" className="nitro-fill" style={{ width: '100%' }}></div>
              </div>
            </div>

            {/* Scientific Main Speedometer */}
            <div className="speedometer scientific-speedometer">
              <div className="speed-number">
                <span id="speed-val" className="speed-digits">0</span>
                <span className="speed-unit">km/h</span>
                <span className="speed-sub-unit" id="speed-ms-val">0.0 m/s</span>
              </div>
              <div className="speed-bar-container">
                <div id="speed-bar" className="speed-bar"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile On-Screen Touch Controls */}
        <div id="mobile-controls" style={{ display: 'none' }}>
          <div className="touch-cluster left-cluster">
            <button id="btn-left" className="touch-btn steer-btn" aria-label="Steer Left">◀</button>
            <button id="btn-right" className="touch-btn steer-btn" aria-label="Steer Right">▶</button>
          </div>

          <div className="touch-cluster right-cluster">
            <button id="btn-gas" className="touch-btn pedal-btn gas-btn" aria-label="Accelerate">▲ GAS</button>
            <button id="btn-brake" className="touch-btn pedal-btn brake-btn" aria-label="Brake/Reverse">▼ REV</button>
          </div>

          <div className="touch-action-bar">
            <button id="btn-nitro" className="touch-pill-btn nitro-pill" aria-label="Nitro Boost">⚡ NITRO</button>
            <button id="btn-handbrake" className="touch-pill-btn" aria-label="Handbrake">🛑 DRIFT</button>
            <button id="btn-assist" className="touch-pill-btn" aria-label="Assist Right">⟲ ASSIST</button>
            <button id="btn-cam" className="touch-pill-btn" aria-label="Switch Camera">📹 CAM</button>
            <button id="btn-mark" className="touch-pill-btn" aria-label="Mark Beacon">📍 MARK</button>
          </div>
        </div>
      </div>

      {/* SpaceX Starship Broadcast HUD */}
      <div id="flight-hud" className="flight-hud-layer">
        {/* Minimal Top Broadcast Bar */}
        <div className="spx-top-bar">
          <div className="spx-top-left">
            <div id="flight-phase-badge" className="flight-phase-badge">STARBASE // PAD AWAITING LAUNCH</div>
            <div id="flight-booster-badge" className="flight-booster-badge" style={{ display: 'none' }}>BOOSTER: ATTACHED</div>
            <div className="flight-online-badge" title="Starbase Telemetry Link">
              <span className="online-dot"></span>
              <span id="flight-online-val" className="online-count-num">1</span>
              <span className="online-lbl">LIVE</span>
            </div>
          </div>

          {/* Camera Switcher Pills */}
          <div className="flight-cam-bar" id="flight-cam-bar">
            <button className="cam-tab-btn active" data-cam="CHASE">🚀 SHIP CAM</button>
            <button className="cam-tab-btn" data-cam="BOOSTER_CAM">🎯 BOOSTER CAM</button>
            <button className="cam-tab-btn" data-cam="GROUND_CAM">🎥 GROUND CAM</button>
            <button className="cam-tab-btn" data-cam="TOWER_CAM">🗼 TOWER CAM</button>
            <button className="cam-tab-btn" data-cam="COCKPIT">COCKPIT</button>
            <button className="cam-tab-btn" data-cam="FREE_ORBIT">ORBIT</button>
          </div>

          <div className="spx-top-right">
            <button id="flight-track-booster-btn" className="hud-pill-btn flight-booster-btn" aria-label="Track Booster Return">
              🎯 TRACK BOOSTER
            </button>
            <button id="flight-auto-btn" className="hud-pill-btn flight-auto-btn active" aria-label="Toggle Auto Mission">
              AUTO: ON
            </button>
            <button id="flight-reset-btn" className="hud-pill-btn flight-reset-btn" aria-label="Reset to Launch Pad">
              ↺ PAD
            </button>
            <button id="flight-exit-btn" className="hud-pill-btn flight-exit-btn" aria-label="Exit to Rover">
              ✕ EXIT
            </button>
          </div>
        </div>

        {/* 360° Gimbal Control Bar (Visible in Ground Cam & Tower Cam) */}
        <div id="flight-gimbal-bar" className="spx-gimbal-bar" style={{ display: 'none' }}>
          <span className="gimbal-lbl">🎥 360° GIMBAL VIEW (DRAG SCREEN OR PAN)</span>
          <div className="gimbal-pad-btns">
            <button id="gimbal-left" className="gimbal-btn" aria-label="Pan Left">◀</button>
            <button id="gimbal-up" className="gimbal-btn" aria-label="Tilt Up">▲</button>
            <button id="gimbal-down" className="gimbal-btn" aria-label="Tilt Down">▼</button>
            <button id="gimbal-right" className="gimbal-btn" aria-label="Pan Right">▶</button>
            <button id="gimbal-reset" className="gimbal-reset-btn" aria-label="Reset Gimbal">CENTER PAD</button>
          </div>
        </div>

        {/* Subtle Mission Callout Prompt */}
        <div id="flight-action-prompt" className="flight-action-prompt"></div>

        {/* Compact Orbital Insertion Banner */}
        <div id="flight-score-card" className="flight-score-card" style={{ display: 'none' }}>
          <div className="score-card-inner">
            <div className="score-header">
              <span className="score-badge">SECO // ORBITAL INSERTION</span>
              <h2 className="score-title">LOW MARS ORBIT ACHIEVED</h2>
            </div>
            <div className="score-main-value">
              <span className="score-num" id="flight-score-val">15,420</span>
              <span className="score-pts">PTS</span>
            </div>
            <div className="score-metrics-grid">
              <div className="metric-box">
                <span className="metric-lbl">APOGEE</span>
                <span className="metric-val" id="score-apogee-val">102.4 km</span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">VELOCITY</span>
                <span className="metric-val" id="score-velocity-val">3,380 m/s</span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">BOOSTER CATCH</span>
                <span className="metric-val highlight" id="score-booster-val">MECHAZILLA CAUGHT! 🥢</span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">NEXT PHASE</span>
                <span className="metric-val" id="score-next-val">ATMOSPHERIC ENTRY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Authentic SpaceX Broadcast Bottom Telemetry Overlay */}
        <div className="spx-broadcast-bar">
          {/* Left Wing: SUPER HEAVY BOOSTER (33 Raptors + Telemetry + LOX/CH4) */}
          <div className="spx-wing spx-booster-wing" id="flight-booster-tank-box">
            <div className="spx-engine-graphic" id="spx-booster-engines" title="Super Heavy 33 Raptor Cluster">
              <svg viewBox="0 0 84 84" className="spx-raptor-svg">
                <circle cx="42" cy="42" r="40" className="raptor-housing-ring" />
                {/* Outer Ring: 20 Raptors */}
                {Array.from({ length: 20 }).map((_, i) => {
                  const a = (i * 18 - 90) * (Math.PI / 180);
                  return (
                    <circle
                      key={`bo-${i}`}
                      cx={(42 + Math.cos(a) * 33).toFixed(2)}
                      cy={(42 + Math.sin(a) * 33).toFixed(2)}
                      r="3.2"
                      className="raptor-nozzle raptor-outer"
                    />
                  );
                })}
                {/* Middle Ring: 10 Raptors */}
                {Array.from({ length: 10 }).map((_, i) => {
                  const a = (i * 36 - 90) * (Math.PI / 180);
                  return (
                    <circle
                      key={`bm-${i}`}
                      cx={(42 + Math.cos(a) * 19.5).toFixed(2)}
                      cy={(42 + Math.sin(a) * 19.5).toFixed(2)}
                      r="3.8"
                      className="raptor-nozzle raptor-mid"
                    />
                  );
                })}
                {/* Center Cluster: 3 Raptors */}
                {Array.from({ length: 3 }).map((_, i) => {
                  const a = (i * 120 - 90) * (Math.PI / 180);
                  return (
                    <circle
                      key={`bc-${i}`}
                      cx={(42 + Math.cos(a) * 7.2).toFixed(2)}
                      cy={(42 + Math.sin(a) * 7.2).toFixed(2)}
                      r="4.2"
                      className="raptor-nozzle raptor-center"
                    />
                  );
                })}
              </svg>
            </div>

            <div className="spx-telemetry-col">
              <div className="spx-stage-header">
                <span className="spx-stage-title">SUPER HEAVY</span>
                <span id="spx-booster-tag" className="spx-stage-sub">ON PAD</span>
              </div>
              <div className="spx-metrics-row">
                <div className="spx-metric">
                  <span className="spx-metric-lbl">SPEED</span>
                  <div className="spx-metric-val-wrap">
                    <span id="spx-booster-speed" className="spx-metric-num">0</span>
                    <span className="spx-metric-unit">KM/H</span>
                  </div>
                </div>
                <div className="spx-metric">
                  <span className="spx-metric-lbl">ALTITUDE</span>
                  <div className="spx-metric-val-wrap">
                    <span id="spx-booster-alt" className="spx-metric-num">0.0</span>
                    <span className="spx-metric-unit">KM</span>
                  </div>
                </div>
              </div>
              <div className="spx-prop-stack">
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">LOX</span>
                  <div className="spx-prop-track">
                    <div id="flight-booster-fuel-bar" className="spx-prop-fill lox-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">CH₄</span>
                  <div className="spx-prop-track">
                    <div id="spx-booster-ch4-bar" className="spx-prop-fill ch4-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Bridge: Primary Launch/Stage Button, T+ Mission Clock & Timeline */}
          <div className="spx-center-bridge">
            <div className="spx-action-row">
              <button id="flight-stage-btn" className="flight-stage-btn" aria-label="Primary Launch or Stage Action">
                🚀 LAUNCH
              </button>

              {/* Manual Throttle Controls (Shown when AUTO: OFF) */}
              <div id="flight-manual-controls" className="spx-manual-controls" style={{ display: 'none' }}>
                <button id="flight-btn-throttle-down" className="spx-thr-btn" aria-label="Throttle Down">-THR</button>
                <div className="spx-thr-readout">
                  <span className="spx-thr-lbl">THR</span>
                  <span id="flight-throttle-val" className="spx-thr-val">0%</span>
                </div>
                <button id="flight-btn-throttle-up" className="spx-thr-btn" aria-label="Throttle Up">+THR</button>
              </div>
            </div>

            <div id="spx-mission-clock" className="spx-mission-clock">T- 00:00:00</div>

            <div className="spx-timeline" id="spx-timeline">
              <div className="spx-tl-step" data-step="LIFTOFF">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">LIFTOFF</span>
              </div>
              <div className="spx-tl-step" data-step="MAXQ">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">MAX-Q</span>
              </div>
              <div className="spx-tl-step" data-step="STAGE">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">MECO</span>
              </div>
              <div className="spx-tl-step" data-step="CATCH">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">CATCH</span>
              </div>
              <div className="spx-tl-step" data-step="ORBIT">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">SECO</span>
              </div>
              <div className="spx-tl-step" data-step="ENTRY">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">ENTRY</span>
              </div>
              <div className="spx-tl-step" data-step="LANDING">
                <span className="spx-tl-dot"></span>
                <span className="spx-tl-txt">LANDING</span>
              </div>
            </div>
          </div>

          {/* Right Wing: STARSHIP (Telemetry + LOX/CH4 + 6 Raptors) */}
          <div className="spx-wing spx-ship-wing">
            <div className="spx-telemetry-col">
              <div className="spx-stage-header">
                <span className="spx-stage-title">STARSHIP</span>
                <span id="spx-ship-tag" className="spx-stage-sub">MACH 0.0 · 1.0G</span>
              </div>
              <div className="spx-metrics-row">
                <div className="spx-metric">
                  <span className="spx-metric-lbl">SPEED</span>
                  <div className="spx-metric-val-wrap">
                    <span id="flight-speed-val" className="spx-metric-num">0</span>
                    <span className="spx-metric-unit">KM/H</span>
                  </div>
                </div>
                <div className="spx-metric">
                  <span className="spx-metric-lbl">ALTITUDE</span>
                  <div className="spx-metric-val-wrap">
                    <span id="flight-alt-val" className="spx-metric-num">0.0</span>
                    <span className="spx-metric-unit">KM</span>
                  </div>
                </div>
              </div>
              <div className="spx-prop-stack">
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">LOX</span>
                  <div className="spx-prop-track">
                    <div id="flight-ship-fuel-bar" className="spx-prop-fill lox-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">CH₄</span>
                  <div className="spx-prop-track">
                    <div id="spx-ship-ch4-bar" className="spx-prop-fill ch4-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </div>
              {/* Re-entry Plasma Thermal Bar (Visible only during Hypersonic Entry) */}
              <div id="flight-heat-container" className="spx-heat-row" style={{ display: 'none' }}>
                <span className="spx-heat-lbl">TPS PLASMA</span>
                <div className="spx-prop-track">
                  <div id="flight-heat-bar" className="spx-prop-fill heat-fill" style={{ width: '0%' }}></div>
                </div>
              </div>
            </div>

            <div className="spx-engine-graphic" id="spx-ship-engines" title="Starship 6 Raptor Cluster (3 RVac + 3 Sea-Level)">
              <svg viewBox="0 0 84 84" className="spx-raptor-svg">
                <circle cx="42" cy="42" r="40" className="raptor-housing-ring" />
                {/* Outer 3 Vacuum Raptors (RVac) */}
                {Array.from({ length: 3 }).map((_, i) => {
                  const a = (i * 120 + 30) * (Math.PI / 180);
                  return (
                    <circle
                      key={`sv-${i}`}
                      cx={(42 + Math.cos(a) * 23).toFixed(2)}
                      cy={(42 + Math.sin(a) * 23).toFixed(2)}
                      r="10.2"
                      className="raptor-nozzle ship-raptor-vac"
                    />
                  );
                })}
                {/* Center 3 Sea-Level Raptors */}
                {Array.from({ length: 3 }).map((_, i) => {
                  const a = (i * 120 - 90) * (Math.PI / 180);
                  return (
                    <circle
                      key={`ss-${i}`}
                      cx={(42 + Math.cos(a) * 9.5).toFixed(2)}
                      cy={(42 + Math.sin(a) * 9.5).toFixed(2)}
                      r="5.6"
                      className="raptor-nozzle ship-raptor-sl"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Mobile On-Screen Flight Steering Cluster (Shown in Manual Mode or Touch) */}
        <div id="flight-mobile-steering" className="flight-mobile-steering" style={{ display: 'none' }}>
          <div className="flight-touch-dpad">
            <button id="flight-btn-pitch-down" className="touch-btn flight-dir-btn" aria-label="Pitch Down">▲</button>
            <div className="flight-dpad-middle">
              <button id="flight-btn-yaw-left" className="touch-btn flight-dir-btn" aria-label="Yaw Left">◀</button>
              <button id="flight-btn-yaw-right" className="touch-btn flight-dir-btn" aria-label="Yaw Right">▶</button>
            </div>
            <button id="flight-btn-pitch-up" className="touch-btn flight-dir-btn" aria-label="Pitch Up">▼</button>
          </div>
        </div>
      </div>

      {/* Full Expedition Map Modal */}
      <div id="map-modal" className="modal-backdrop">
        <div className="modal-card map-card">
          <div className="modal-header">
            <h2>EXPEDITION MAP</h2>
            <button id="close-map" className="close-btn">&times;</button>
          </div>
          <canvas id="map-full" width="760" height="760"></canvas>
          <div className="modal-footer">
            <p>Cyan: Monuments & Starbase · Orange: User Beacons · Press G or Esc to close</p>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <div id="settings-modal" className="modal-backdrop">
        <div className="modal-card">
          <div className="modal-header">
            <h2>MARS EXPEDITION SETTINGS</h2>
            <button id="close-settings" className="close-btn">&times;</button>
          </div>
          <div className="modal-body">
            <div className="setting-item">
              <label htmlFor="quality-select">Graphics Quality</label>
              <select id="quality-select" defaultValue="High">
                <option value="Ultra">Ultra (High Shadow & Particles)</option>
                <option value="High">High (Optimized PC)</option>
                <option value="Medium">Medium (Balanced Mobile/PC)</option>
                <option value="Low">Low (Maximum Mobile FPS)</option>
              </select>
            </div>

            <div className="setting-item">
              <label htmlFor="toggle-grid">Surveyor Topographical Grid</label>
              <input type="checkbox" id="toggle-grid" />
            </div>

            <div className="setting-item">
              <label htmlFor="toggle-audio">Audio Synthesizer FX</label>
              <input type="checkbox" id="toggle-audio" defaultChecked />
            </div>

            <div className="setting-item">
              <label>Emergency Recovery</label>
              <button id="btn-reset-pos" className="btn-action">Reset Rover to Coordinates (0,0)</button>
            </div>
          </div>
          <div className="modal-footer">
            <p>Mars Surface Simulation · Atmosphere: CO₂ / Dust Haze · DUNES</p>
          </div>
        </div>
      </div>
    </>
  );
}
