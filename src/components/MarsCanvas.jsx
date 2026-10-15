'use client';

import { useEffect, useRef } from 'react';

export default function MarsCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    let engine = null;
    let isMounted = true;

    import('../game/engine.js').then(({ MarsGameEngine }) => {
      if (isMounted && containerRef.current) {
        // Clear any previous canvas children
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
        engine = new MarsGameEngine(containerRef.current);
      }
    });

    return () => {
      isMounted = false;
      if (engine) {
        engine.destroy();
      }
    };
  }, []);

  return (
    <>
      <div id="canvas-container" ref={containerRef} />

      {/* HUD & UI Layer */}
      <div id="hud-layer">
        {/* Top-Left Branding */}
        <div className="top-left-brand">
          <span className="brand-text">DUNES</span>
          <span className="sub-brand">RED PLANET EXPEDITION</span>
        </div>

        {/* Top-Right Settings & Actions */}
        <div className="top-right-bar">
          <button id="launch-mission-btn" className="hud-pill-btn launch-pill" aria-label="Launch Starship Mission">
            <span>🚀 Mission</span>
          </button>
          <button id="map-btn" className="hud-pill-btn" aria-label="Map">
            <span>Map</span>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
          </button>
          <button id="esc-btn" className="hud-pill-btn" aria-label="Settings">
            <span>Esc</span>
            <svg className="gear-icon" viewBox="0 0 24 24" width="16" height="16">
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

        {/* Bottom Center Telemetry & Speedometer */}
        <div className="bottom-center-telemetry">
          {/* Nitro Thruster Gauge */}
          <div className="nitro-container">
            <div className="nitro-label">NITRO <span id="nitro-pct">100%</span></div>
            <div className="nitro-track">
              <div id="nitro-fill" className="nitro-fill" style={{ width: '100%' }}></div>
            </div>
          </div>

          {/* Main Speedometer */}
          <div className="speedometer">
            <div className="speed-number"><span id="speed-val">0</span> <span className="speed-unit">km/h</span></div>
            <div className="speed-bar-container">
              <div id="speed-bar" className="speed-bar"></div>
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

      {/* Starship Aerospace Flight HUD */}
      <div id="flight-hud" className="flight-hud-layer">
        <div className="flight-top-panel">
          <div id="flight-phase-badge" className="flight-phase-badge">PRE-LAUNCH // STARBASE OLM</div>
          <button id="flight-exit-btn" className="hud-pill-btn flight-exit-btn" aria-label="Exit to Rover">✕ Exit to Rover</button>
        </div>

        <div id="flight-action-prompt" className="flight-action-prompt"></div>

        {/* Telemetry Ribbons */}
        <div className="flight-telemetry-panel">
          <div className="flight-gauge">
            <span className="gauge-label">ALTITUDE</span>
            <span id="flight-alt-val" className="gauge-val">0 m</span>
          </div>
          <div className="flight-gauge">
            <span className="gauge-label">VELOCITY</span>
            <span id="flight-speed-val" className="gauge-val">0 km/h</span>
          </div>
          <div className="flight-gauge">
            <span className="gauge-label">AIRSPEED</span>
            <span id="flight-mach-val" className="gauge-val">Mach 0.0</span>
          </div>
        </div>

        {/* Re-entry Plasma Thermal Gauge (Ref Image 2) */}
        <div id="flight-heat-container" className="flight-heat-container" style={{ display: 'none' }}>
          <div className="heat-label">🔥 HYPERSONIC RE-ENTRY PLASMA // SHIELD TEMP</div>
          <div className="heat-track">
            <div id="flight-heat-bar" className="heat-fill" style={{ width: '0%' }}></div>
          </div>
        </div>

        {/* Throttle Bar & Staging Button */}
        <div className="flight-bottom-controls">
          <div className="flight-throttle-box">
            <span className="throttle-label">RAPTOR THRUST</span>
            <div className="flight-throttle-track">
              <div id="flight-throttle-bar" className="flight-throttle-fill" style={{ width: '0%' }}></div>
            </div>
          </div>
          <button id="flight-stage-btn" className="flight-stage-btn" aria-label="Rocket Stage Trigger">🚀 IGNITE</button>
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
