'use client';

import { useEffect, useRef } from 'react';

export default function MarsCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    let engine = null;

    import('../game/engine.js').then(({ MarsGameEngine }) => {
      if (containerRef.current) {
        engine = new MarsGameEngine(containerRef.current);
      }
    });

    return () => {
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
          <span className="brand-text">drune.io</span>
          <span className="sub-brand">MARS EXPEDITION</span>
        </div>

        {/* Top-Right Settings Gear */}
        <div className="top-right-bar">
          <button id="esc-btn" className="hud-pill-btn" aria-label="Settings">
            <span>Esc</span>
            <svg className="gear-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>

        {/* 3D Waypoint Projector Badges */}
        <div id="waypoint-badges"></div>

        {/* Bottom Left Desktop Hints */}
        <div className="bottom-left-hints">
          <div className="hint-row"><span className="key-label">Drive:</span> WASD / arrow keys</div>
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
              <label htmlFor="toggle-grid">Surveyor Topo Grid (drune style)</label>
              <input type="checkbox" id="toggle-grid" defaultChecked />
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
            <p>Mars Gravity: 3.72 m/s² · Atmosphere: CO₂ / Dust Haze · drune.io inspired</p>
          </div>
        </div>
      </div>
    </>
  );
}
