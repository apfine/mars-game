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
    getPresenceClient();

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 92) return prev + Math.floor(Math.random() * 12 + 6);
        return prev;
      });
    }, 75);

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
      {/* Glassmorphic Loading Screen */}
      {loading && (
        <div
          id="mars-loading-screen"
          className={`loading-screen-overlay ${loadingFade ? 'fade-out' : ''}`}
          onClick={dismissLoading}
          onTouchStart={dismissLoading}
          aria-live="polite"
        >
          <div className="loading-card" onClick={(e) => e.stopPropagation()}>
            <div className="loading-radar">
              <div className="radar-sweep"></div>
              <div className="radar-core"></div>
              <div className="radar-ring r1"></div>
              <div className="radar-ring r2"></div>
            </div>

            <div className="loading-title-box">
              <h1 className="loading-title">STARBASE MARS</h1>
              <div className="loading-badge">OLYMPUS EXPEDITION // FLIGHT & ROVER SIMULATOR</div>
            </div>

            <p className="loading-coords">
              DRIVE ROVER TO LAUNCH PAD · PRESS [E] TO WALK · CLICK PHYSICAL PAD BUTTON TO LAUNCH
            </p>

            <div className="loading-bar-wrap">
              <div className="loading-bar-fill" style={{ width: `${progress}%` }}>
                <span className="loading-bar-flare"></span>
              </div>
            </div>

            <div className="loading-status-row">
              <span className="loading-status-txt">{statusText}</span>
              <span className="loading-pct">{progress}%</span>
            </div>

            <div className="loading-hint-footer">
              <div className="hint-pill"><span className="key-chip">WASD</span> Drive / Walk</div>
              <div className="hint-pill"><span className="key-chip">E</span> Exit / Board Rover</div>
              <div className="hint-pill"><span className="key-chip">CLICK / F</span> Press Launch Button</div>
              <div className="hint-pill"><span className="key-chip">DRAG</span> 360° Gimbal</div>
            </div>

            <button
              className="loading-enter-btn"
              onClick={dismissLoading}
              aria-label="Enter Simulation"
            >
              ENTER SIMULATION
            </button>
          </div>
        </div>
      )}

      <div id="canvas-container" ref={containerRef} />

      {/* Permanent Live Online Players Counter Badge */}
      <div id="live-players-badge" className="spx-live-badge" title="Active engineers online in real-time">
        <span className="live-dot-pulse"></span>
        <span className="live-txt">LIVE PLAYERS</span>
        <span id="online-players-count" className="live-num">1</span>
      </div>

      {/* =========================================================
          ROVER & FIRST-PERSON WALKING HUD (SpaceX Glassmorphic UI)
          ========================================================= */}
      <div id="hud-layer" className="spx-hud-layer">
        {/* Top Glassmorphic Bar */}
        <div className="spx-top-bar">
          <div className="spx-top-left">
            <div id="rover-mode-badge" className="flight-phase-badge">
              ROVER // STARBASE APPROACH
            </div>
            {/* Rover Camera Switcher Dropdown */}
            <div className="spx-dropdown" id="rover-cam-dropdown">
              <button className="hud-pill-btn spx-dropdown-trigger" id="rover-cam-btn" aria-label="Rover Camera Menu">
                <span className="dropdown-icon">📷</span>
                <span id="rover-cam-current">CHASE</span>
                <span className="dropdown-arrow">▾</span>
              </button>
              <div className="spx-dropdown-menu" id="rover-cam-menu">
                <button className="dropdown-item active" data-rcam="0">📷 CHASE (THIRD-PERSON)</button>
                <button className="dropdown-item" data-rcam="1">🧑‍🚀 COCKPIT (FIRST-PERSON)</button>
                <button className="dropdown-item" data-rcam="2">🪐 ORBIT (FREE-LOOK)</button>
              </div>
            </div>
            <div id="rover-cam-bar" style={{ display: 'none' }}></div>
          </div>

          <div className="spx-top-right">
            <button
              id="rover-speed-btn"
              className="hud-pill-btn flight-speed-btn"
              aria-label="Time Speed"
              title="Cycle Simulation Time Speed (1x / 2x / 4x / 8x)"
            >
              1X
            </button>
            <button
              id="rover-walk-btn"
              className="hud-pill-btn walk-toggle-btn"
              aria-label="Exit or Board Rover"
              title="Exit Rover to Walk on Foot (Key E)"
            >
              WALK [E]
            </button>
            {/* Rover Tools Dropdown */}
            <div className="spx-dropdown" id="rover-actions-dropdown">
              <button className="hud-pill-btn spx-dropdown-trigger" id="rover-actions-btn" aria-label="Rover Options">
                <span className="dropdown-icon">⚙️</span>
                <span>OPTIONS</span>
                <span className="dropdown-arrow">▾</span>
              </button>
              <div className="spx-dropdown-menu" id="rover-actions-menu">
                <button id="rover-roadster-btn" className="dropdown-item roadster-toggle-btn">🏎️ TESLA ROADSTER</button>
                <button id="map-btn" className="dropdown-item">🗺️ EXPEDITION MAP [M]</button>
                <button id="esc-btn" className="dropdown-item">⚙️ SYSTEM SETTINGS</button>
              </div>
            </div>
          </div>
        </div>

        {/* 360° Gimbal Optics Bar for Rover & Walking Cameras */}
        <div id="rover-gimbal-bar" className="spx-gimbal-bar">
          <span className="gimbal-lbl">360° GIMBAL</span>
          <div className="gimbal-pad-btns">
            <button id="rover-gimbal-left" className="gimbal-btn" aria-label="Pan Left">◀</button>
            <button id="rover-gimbal-up" className="gimbal-btn" aria-label="Tilt Up">▲</button>
            <button id="rover-gimbal-down" className="gimbal-btn" aria-label="Tilt Down">▼</button>
            <button id="rover-gimbal-right" className="gimbal-btn" aria-label="Pan Right">▶</button>
            <button id="rover-gimbal-reset" className="gimbal-reset-btn" aria-label="Center Gimbal">CENTER</button>
          </div>
        </div>

        {/* First-Person Walking Reticle (Visible only while walking on foot) */}
        <div id="walk-reticle" className="walk-reticle" style={{ display: 'none' }}>
          <span className="reticle-ring"></span>
          <span className="reticle-dot"></span>
        </div>

        {/* Physical Launch Control Pedestal Proximity Banner */}
        <div id="pad-launch-prompt" className="flight-action-prompt" style={{ display: 'none' }}></div>

        {/* Minimap Radar */}
        <canvas id="minimap" width="260" height="260" aria-label="Minimap"></canvas>

        {/* 3D Waypoint Projector Badges */}
        <div id="waypoint-badges"></div>

        {/* Unified SpaceX Glassmorphic Bottom Broadcast Bar for Rover & Walking */}
        <div className="spx-broadcast-bar rover-broadcast-bar">
          {/* Left Wing: ROVER DRIVETRAIN / EVA SUIT TELEMETRY */}
          <div className="spx-wing spx-booster-wing">
            <div className="spx-engine-graphic" title="Rover 4x4 Electric Drivetrain">
              <svg viewBox="0 0 84 84" className="spx-raptor-svg">
                <circle cx="42" cy="42" r="40" className="raptor-housing-ring" />
                <rect x="29" y="18" width="26" height="48" rx="6" className="rover-chassis-svg" />
                <rect x="17" y="20" width="9" height="16" rx="3" className="raptor-nozzle active" />
                <rect x="58" y="20" width="9" height="16" rx="3" className="raptor-nozzle active" />
                <rect x="17" y="48" width="9" height="16" rx="3" className="raptor-nozzle active" />
                <rect x="58" y="48" width="9" height="16" rx="3" className="raptor-nozzle active" />
              </svg>
            </div>

            <div className="spx-telemetry-col">
              <div className="spx-stage-header">
                <span id="rover-left-title" className="spx-stage-title">MARS ROVER</span>
                <span id="speed-ms-val" className="spx-stage-sub">0.0 M/S · 0.38G</span>
              </div>
              <div className="spx-metrics-row">
                <div className="spx-metric">
                  <span className="spx-metric-lbl">SPEED</span>
                  <div className="spx-metric-val-wrap">
                    <span id="speed-val" className="spx-metric-num">0</span>
                    <span className="spx-metric-unit">KM/H</span>
                  </div>
                </div>
                <div className="spx-metric">
                  <span className="spx-metric-lbl">ELEVATION</span>
                  <div className="spx-metric-val-wrap">
                    <span id="sci-elev-val" className="spx-metric-num">0</span>
                    <span className="spx-metric-unit">M</span>
                  </div>
                </div>
              </div>
              <div className="spx-prop-stack">
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">GN₂</span>
                  <div className="spx-prop-track">
                    <div id="nitro-fill" className="spx-prop-fill lox-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">VEL</span>
                  <div className="spx-prop-track">
                    <div id="speed-bar" className="spx-prop-fill ch4-fill" style={{ width: '0%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Bridge: Walk / Board / Physical Pad Launch Trigger & Starbase Distance */}
          <div className="spx-center-bridge">
            <div className="spx-action-row">
              <button id="rover-primary-action-btn" className="flight-stage-btn" aria-label="Exit or Board Rover">
                EXIT ROVER [E]
              </button>
              <button
                id="pad-physical-launch-btn"
                className="flight-stage-btn physical-pad-btn"
                style={{ display: 'none' }}
                aria-label="Press Physical Launch Button"
              >
                PRESS LAUNCH BUTTON [F]
              </button>
            </div>

            <div id="met-clock" className="spx-mission-clock">T+ 00:00:00</div>

            <div className="spx-pad-locator" id="starbase-locator-pill">
              <span className="locator-dot"></span>
              <span id="starbase-dist-val" className="locator-txt">STARBASE PAD: 190m NE</span>
            </div>
          </div>

          {/* Right Wing: INERTIAL ATTITUDE, G-FORCE & NAVIGATION */}
          <div className="spx-wing spx-ship-wing">
            <div className="spx-telemetry-col">
              <div className="spx-stage-header">
                <span className="spx-stage-title">NAVIGATION</span>
                <span id="rover-gyro-val" className="spx-stage-sub">PITCH 0° · ROLL 0°</span>
              </div>
              <div className="spx-metrics-row">
                <div className="spx-metric">
                  <span className="spx-metric-lbl">AZIMUTH</span>
                  <div className="spx-metric-val-wrap">
                    <span id="rover-heading-val" className="spx-metric-num">045°</span>
                    <span className="spx-metric-unit">NE</span>
                  </div>
                </div>
                <div className="spx-metric">
                  <span className="spx-metric-lbl">ODOMETER</span>
                  <div className="spx-metric-val-wrap">
                    <span id="rover-odom-val" className="spx-metric-num">0</span>
                    <span className="spx-metric-unit">M</span>
                  </div>
                </div>
              </div>
              <div className="spx-prop-stack">
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">RTG</span>
                  <div className="spx-prop-track">
                    <div className="spx-prop-fill lox-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div className="spx-prop-row">
                  <span className="spx-prop-lbl">O₂</span>
                  <div className="spx-prop-track">
                    <div className="spx-prop-fill ch4-fill" style={{ width: '98%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Touch Controls for Rover & Walking */}
        <div id="mobile-controls" style={{ display: 'none' }}>
          <div className="touch-cluster left-cluster">
            <button id="btn-left" className="touch-btn steer-btn" aria-label="Steer Left">◀</button>
            <button id="btn-right" className="touch-btn steer-btn" aria-label="Steer Right">▶</button>
          </div>

          <div className="touch-cluster right-cluster">
            <button id="btn-gas" className="touch-btn pedal-btn gas-btn" aria-label="Forward">▲</button>
            <button id="btn-brake" className="touch-btn pedal-btn brake-btn" aria-label="Reverse">▼</button>
          </div>

          <div className="touch-action-bar">
            <button id="btn-nitro" className="touch-pill-btn nitro-pill" aria-label="Boost">BOOST</button>
            <button id="btn-handbrake" className="touch-pill-btn" aria-label="Brake">BRAKE</button>
            <button id="btn-walk-mobile" className="touch-pill-btn" aria-label="Walk">WALK</button>
          </div>
        </div>
      </div>

      {/* =========================================================
          STARSHIP FLIGHT HUD (SpaceX Glassmorphic Broadcast UI)
          ========================================================= */}
      <div id="flight-hud" className="flight-hud-layer">
        {/* Top Glassmorphic Bar */}
        <div className="spx-top-bar">
          <div className="spx-top-left">
            <div id="flight-phase-badge" className="flight-phase-badge">STARBASE // PAD AWAITING LAUNCH</div>
            {/* Camera Dropdown Menu with 📷 Icon */}
            <div className="spx-dropdown" id="flight-cam-dropdown">
              <button className="hud-pill-btn spx-dropdown-trigger" id="flight-cam-btn" aria-label="Camera Options">
                <span className="dropdown-icon">📷</span>
                <span id="flight-cam-current">SHIP</span>
                <span className="dropdown-arrow">▾</span>
              </button>
              <div className="spx-dropdown-menu" id="flight-cam-menu">
                <button className="dropdown-item active" data-cam="CHASE">📷 SHIP (CHASE)</button>
                <button className="dropdown-item" id="flight-track-booster-btn" data-cam="BOOSTER_CAM">🚀 BOOSTER TRACK</button>
                <button className="dropdown-item" data-cam="COCKPIT">🧑‍🚀 COCKPIT</button>
                <button className="dropdown-item" data-cam="TOWER_CAM">🗼 MECHAZILLA TOWER</button>
                <button className="dropdown-item" data-cam="GROUND_CAM">🔭 GROUND TRACKER</button>
                <button className="dropdown-item" data-cam="FREE_ORBIT">🪐 ORBIT FREE-LOOK</button>
              </div>
            </div>
            {/* Hidden hook for backward compatibility */}
            <div id="flight-cam-bar" style={{ display: 'none' }}></div>
          </div>

          <div className="spx-top-right">
            {/* Mission & Destination Dropdown */}
            <div className="spx-dropdown" id="flight-mission-dropdown">
              <button className="hud-pill-btn spx-dropdown-trigger" id="flight-mission-btn" aria-label="Mission Profile & Destination">
                <span className="dropdown-icon">🎯</span>
                <span id="flight-dest-current">DEST: EARTH</span>
                <span className="dropdown-arrow">▾</span>
              </button>
              <div className="spx-dropdown-menu" id="flight-mission-menu">
                <div className="dropdown-section-header">DESTINATION</div>
                <button className="dropdown-item" data-dest="EARTH">🌍 EARTH STARBASE</button>
                <button className="dropdown-item" data-dest="MARS">🔴 MARS STARBASE</button>
                <div className="dropdown-section-header">FLIGHT PROFILE</div>
                <button className="dropdown-item active traj-opt-btn" data-traj="ORBITAL">🛰️ ORBITAL (88 KM)</button>
                <button className="dropdown-item traj-opt-btn" data-traj="SUBORBITAL">🎯 SUBORBITAL (50 KM)</button>
              </div>
            </div>
            <div id="flight-dest-switch" style={{ display: 'none' }}></div>
            <div id="flight-traj-switch" style={{ display: 'none' }}></div>

            <button id="flight-speed-btn" className="hud-pill-btn flight-speed-btn" aria-label="Time Speed" title="Cycle Simulation Speed (1x / 2x / 4x / 8x / 100x / 1000x)">
              1X
            </button>
            <button id="flight-auto-btn" className="hud-pill-btn flight-auto-btn active" aria-label="Toggle Auto or Manual Control">
              AUTO
            </button>

            {/* Actions Dropdown */}
            <div className="spx-dropdown" id="flight-actions-dropdown">
              <button className="hud-pill-btn spx-dropdown-trigger" id="flight-actions-btn" aria-label="Flight Actions">
                <span className="dropdown-icon">⚙️</span>
                <span>ACTIONS</span>
                <span className="dropdown-arrow">▾</span>
              </button>
              <div className="spx-dropdown-menu" id="flight-actions-menu">
                <button className="dropdown-item" id="flight-reset-btn">🔄 RESET TO PAD</button>
                <button className="dropdown-item" id="flight-hide-ui-btn">👁️ TOGGLE HUD [H]</button>
                <button className="dropdown-item" id="flight-roadster-btn">🏎️ TESLA ROADSTER</button>
                <button className="dropdown-item" id="flight-exit-btn">🧑‍🚀 RETURN TO EVA</button>
              </div>
            </div>
          </div>
        </div>

        {/* Interplanetary transfer, local deorbit, roadster and yard ops */}
        <div className="flight-ops-bar">
          <button id="flight-transfer-btn" className="flight-ops-btn" title="Transfer to the selected planet">
            TRANSFER · EARTH
          </button>
          <button id="flight-deorbit-btn" className="flight-ops-btn" title="Deorbit and recover at the local Starbase">
            DEORBIT
          </button>
          <button id="flight-roadster-btn" className="flight-ops-btn roadster-btn" title="Toggle the flying Tesla Roadster">
            ROADSTER
          </button>
          <span id="flight-ops-status" className="flight-ops-status"></span>
        </div>

        {/* Pre-Space Trajectory Decision Prompt */}
        <div id="flight-trajectory-prompt" className="spx-trajectory-prompt" style={{ display: 'none' }}>
          <span className="traj-prompt-lbl">APPROACHING SPACE INSERTION // SELECT PROFILE</span>
          <div className="traj-prompt-actions">
            <button className="traj-prompt-btn active" data-traj="ORBITAL">ORBITAL INSERTION (88 KM)</button>
            <button className="traj-prompt-btn" data-traj="SUBORBITAL">SUBORBITAL RTLS CATCH (50 KM)</button>
          </div>
        </div>

        {/* Universal 360° Gimbal Control Bar (Active across ALL Flight Cameras) */}
        <div id="flight-gimbal-bar" className="spx-gimbal-bar">
          <span className="gimbal-lbl">360° GIMBAL</span>
          <div className="gimbal-pad-btns">
            <button id="gimbal-left" className="gimbal-btn" aria-label="Pan Left">◀</button>
            <button id="gimbal-up" className="gimbal-btn" aria-label="Tilt Up">▲</button>
            <button id="gimbal-down" className="gimbal-btn" aria-label="Tilt Down">▼</button>
            <button id="gimbal-right" className="gimbal-btn" aria-label="Pan Right">▶</button>
            <button id="gimbal-reset" className="gimbal-reset-btn" aria-label="Reset Gimbal">CENTER</button>
          </div>
        </div>

        {/* Subtle Mission Callout Prompt */}
        <div id="flight-action-prompt" className="flight-action-prompt"></div>

        {/* Compact Orbital Insertion Banner */}
        <div id="flight-score-card" className="flight-score-card" style={{ display: 'none' }}>
          <div className="score-card-inner">
            <div className="score-header">
              <span className="score-badge">SECO // ORBITAL INSERTION</span>
              <h2 id="flight-score-title" className="score-title">LOW MARS ORBIT ACHIEVED</h2>
            </div>
            <div className="score-main-value">
              <span className="score-num" id="flight-score-val">15,420</span>
              <span className="score-pts">PTS</span>
            </div>
            <div className="score-metrics-grid">
              <div className="metric-box">
                <span className="metric-lbl">APOGEE</span>
                <span className="metric-val" id="score-apogee-val">88.4 km</span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">VELOCITY</span>
                <span className="metric-val" id="score-velocity-val">3,300 m/s</span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">BOOSTER CATCH</span>
                <span className="metric-val highlight" id="score-booster-val">TOWER CAUGHT</span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">NEXT PHASE</span>
                <span className="metric-val" id="score-next-val">ATMOSPHERIC ENTRY</span>
              </div>
            </div>
          </div>
        </div>

        {/* SpaceX Broadcast Bottom Telemetry Bar */}
        <div className="spx-broadcast-bar">
          {/* Left Wing: SUPER HEAVY BOOSTER (33 Raptors + Telemetry + LOX/CH4) */}
          <div className="spx-wing spx-booster-wing" id="flight-booster-tank-box">
            <div className="spx-engine-graphic" id="spx-booster-engines" title="Super Heavy 33 Raptor Cluster">
              <svg viewBox="0 0 84 84" className="spx-raptor-svg">
                <circle cx="42" cy="42" r="40" className="raptor-housing-ring" />
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
                    <span className="spx-metric-unit">M/S</span>
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

          {/* Center Bridge: Primary Action, Full Manual Overrides, Mission Clock & Timeline */}
          <div className="spx-center-bridge">
            <div className="spx-action-row">
              <button id="flight-stage-btn" className="flight-stage-btn" aria-label="Primary Launch or Stage Action">
                LAUNCH
              </button>

              {/* Full Manual Mode Controls (Active anytime when AUTO: OFF) */}
              <div id="flight-manual-controls" className="spx-manual-controls" style={{ display: 'none' }}>
                <button id="flight-btn-throttle-down" className="spx-thr-btn" aria-label="Throttle Down">-THR</button>
                <div className="spx-thr-readout">
                  <span className="spx-thr-lbl">THR</span>
                  <span id="flight-throttle-val" className="spx-thr-val">0%</span>
                </div>
                <button id="flight-btn-throttle-up" className="spx-thr-btn" aria-label="Throttle Up">+THR</button>
                <button id="flight-btn-stage-now" className="spx-thr-btn" title="Hot-Stage Separate Booster">STAGE</button>
                <button id="flight-btn-legs" className="spx-thr-btn" title="Deploy/Retract Landing Legs (Key G)">LEGS</button>
                <button id="flight-btn-cargo" className="spx-thr-btn" title="Open/Close Cargo Bay (Key B)">CARGO</button>
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

          {/* Right Wing: STARSHIP (Strict Physics Velocity M/S + Altitude KM + IMU G-Force + 6 Raptors) */}
          <div className="spx-wing spx-ship-wing">
            <div className="spx-telemetry-col">
              <div className="spx-stage-header">
                <span className="spx-stage-title">STARSHIP</span>
                <span id="spx-ship-tag" className="spx-stage-sub">MACH 0.00 · 0.38G</span>
              </div>
              <div className="spx-metrics-row">
                <div className="spx-metric">
                  <span className="spx-metric-lbl">SPEED</span>
                  <div className="spx-metric-val-wrap">
                    <span id="flight-speed-val" className="spx-metric-num">0</span>
                    <span className="spx-metric-unit">M/S</span>
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

        {/* Attitude Steering D-Pad for Manual Flight Mode */}
        <div id="flight-mobile-steering" className="flight-mobile-steering" style={{ display: 'none' }}>
          <div className="flight-touch-dpad">
            <button id="flight-btn-pitch-down" className="touch-btn flight-dir-btn" aria-label="Pitch Nose Up">▲</button>
            <div className="flight-dpad-middle">
              <button id="flight-btn-yaw-left" className="touch-btn flight-dir-btn" aria-label="Yaw Left">◀</button>
              <button id="flight-btn-yaw-right" className="touch-btn flight-dir-btn" aria-label="Yaw Right">▶</button>
            </div>
            <button id="flight-btn-pitch-up" className="touch-btn flight-dir-btn" aria-label="Pitch Nose Down">▼</button>
          </div>
        </div>

        {/* SpaceX-style semicircular attitude director: pitch ladder + bank. */}
        <div id="flight-attitude-gauge" className="flight-attitude-gauge" aria-label="Vehicle attitude indicator">
          <div className="att-gauge-head">
            <span>ATTITUDE</span>
            <span id="att-gauge-mode">LVLH</span>
          </div>
          <div className="att-dial">
            <div id="att-horizon" className="att-horizon">
              <div className="att-sky"></div>
              <div className="att-ground"></div>
              <div className="att-ladder">
                <span className="att-line l1"></span>
                <span className="att-line l2"></span>
                <span className="att-line l3"></span>
                <span className="att-line l4"></span>
                <span className="att-line l5"></span>
              </div>
              <span className="att-horizon-line"></span>
            </div>
            <div className="att-bank-tick t1"></div>
            <div className="att-bank-tick t2"></div>
            <div className="att-bank-tick t3"></div>
            <div id="att-roll-pointer" className="att-roll-pointer"></div>
            <div className="att-reticle">⌖</div>
          </div>
          <div className="att-readouts">
            <span>P <b id="att-pitch-val">90°</b></span>
            <span>R <b id="att-roll-val">0°</b></span>
            <span>Y <b id="att-yaw-val">0°</b></span>
            <span>VS <b id="att-vs-val">0</b></span>
          </div>
        </div>
      </div>

      {/* Full Expedition Map Modal */}
      <div id="map-modal" className="modal-backdrop">
        <div className="modal-card map-card">
          <div className="modal-header">
            <h2>STARBASE & MARS EXPEDITION MAP</h2>
            <button id="close-map" className="close-btn">&times;</button>
          </div>
          <canvas id="map-full" width="760" height="760"></canvas>
          <div className="modal-footer">
            <p>Cyan: Starbase & Landmarks · Drive Rover to Starbase (1400, 1150) & walk to Launch Pedestal</p>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <div id="settings-modal" className="modal-backdrop">
        <div className="modal-card">
          <div className="modal-header">
            <h2>SIMULATION SETTINGS</h2>
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
                <option value="Safe">Safe Render (Compatibility / No Black Screen)</option>
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
              <button id="btn-reset-pos" className="btn-action">Reset Rover to Starbase Approach</button>
            </div>
          </div>
          <div className="modal-footer">
            <p>Mars Surface & Orbital Flight Simulation · Glassmorphic Telemetry</p>
          </div>
        </div>
      </div>
    </>
  );
}
