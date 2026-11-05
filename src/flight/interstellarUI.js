// ============================================================================
// INTERSTELLAR MISSION CONTROL GLASSMORPHIC HUD
// Recreates the scientific telemetry, dual relativistic clocks,
// stage sequence stepper, Doppler asymmetry controls, and system overview.
// ============================================================================

export class InterstellarUI {
  constructor(simulation, options = {}) {
    this.simulation = simulation;
    this.options = options;
    this.visible = false;

    this.dom = {};
    this._createDOM();
    this._bindEvents();

    if (typeof window !== 'undefined') {
      window.__interstellarUI = this;
    }
  }

  _formatTime(seconds) {
    const totalSec = Math.max(0, Math.floor(seconds));
    const secInYear = 365.25 * 86400;
    const years = Math.floor(totalSec / secInYear);
    const remAfterYear = totalSec % secInYear;
    const days = Math.floor(remAfterYear / 86400);
    const remAfterDay = remAfterYear % 86400;
    const hours = Math.floor(remAfterDay / 3600);
    const remAfterHour = remAfterDay % 3600;
    const mins = Math.floor(remAfterHour / 60);
    const secs = remAfterHour % 60;

    const pad = (n) => String(n).padStart(2, '0');
    return `${years}y ${String(days).padStart(3, '0')}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }

  _createDOM() {
    let container = document.getElementById('interstellar-hud');
    if (!container) {
      container = document.createElement('div');
      container.id = 'interstellar-hud';
      container.className = 'interstellar-hud-layer';
      container.style.display = 'none';
      document.body.appendChild(container);
    }

    container.innerHTML = `
      <!-- TOP GLASSMORPHIC CONTROL BAR -->
      <div class="interstellar-top-bar">
        <div class="interstellar-top-left">
          <div class="interstellar-brand">
            <span class="interstellar-icon">✦</span>
            <span class="interstellar-brand-title">INTERSTELLAR EXPEDITION</span>
            <span id="interstellar-phase-badge" class="interstellar-badge">STAGE 1 / 13</span>
          </div>
          <div class="interstellar-stage-titles">
            <h1 id="interstellar-stage-title" class="interstellar-title">EARTH ORBIT</h1>
            <div id="interstellar-stage-sub" class="interstellar-subtitle">DEPARTURE POINT // REFERENCE ZERO</div>
          </div>
        </div>

        <div class="interstellar-top-right">
          <button id="int-btn-prev" class="hud-pill-btn" title="Previous Stage [Left Arrow]">◀ PREV</button>
          <button id="int-btn-pause" class="hud-pill-btn" title="Pause / Resume [Space]">⏸ PAUSE</button>
          <button id="int-btn-next" class="hud-pill-btn" title="Next Stage [Right Arrow]">NEXT ▶</button>
          <button id="int-btn-overview" class="hud-pill-btn" title="System Overview Orrery [O]">🪐 ORRERY</button>
          <button id="int-btn-doppler" class="hud-pill-btn" title="Toggle Doppler Asymmetry [D]">✨ DOPPLER: OFF</button>
          <button id="int-btn-lore" class="hud-pill-btn" title="Toggle Physics & Lore Telemetry">📘 PHYSICS</button>
          <button id="int-btn-exit" class="hud-pill-btn btn-danger" title="Exit Interstellar Simulation">✖ EXIT</button>
        </div>
      </div>

      <!-- SCIENCE & PHYSICS TELEMETRY DRAWER -->
      <div id="interstellar-lore-drawer" class="interstellar-drawer" style="display: none;">
        <div class="drawer-header">
          <span class="drawer-tag" id="drawer-lore-type">ESTABLISHED ASTROPHYSICS</span>
          <span class="drawer-close" id="drawer-close-btn">✕</span>
        </div>
        <p id="drawer-stage-summary" class="drawer-summary"></p>
        <div class="drawer-physics-box">
          <strong class="physics-label">METRIC & PHYSICS NOTE:</strong>
          <p id="drawer-physics-note" class="drawer-note"></p>
        </div>
        <div class="drawer-kerr-specs">
          <div class="spec-item">
            <span class="spec-label">BLACK HOLE MASS</span>
            <span class="spec-val">100,000,000 M☉</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">HORIZON RADIUS (rg)</span>
            <span class="spec-val">1.477 × 10¹¹ m (~0.987 AU)</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">KERR SPIN PARAMETER</span>
            <span class="spec-val">a* = 0.99999999</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">MILLER SURFACE GRAVITY</span>
            <span class="spec-val">1.3g (12.75 m/s²)</span>
          </div>
        </div>
      </div>

      <!-- CENTER NOTIFICATION BANNER (e.g. 1 TICK = 1 DAY) -->
      <div id="interstellar-tick-banner" class="interstellar-tick-banner" style="display: none;">
        <span class="pulse-dot"></span>
        <span class="pulse-txt">1 ACOUSTIC TICK = 1 FULL EARTH DAY ELAPSED</span>
      </div>

      <!-- BOTTOM RELATIVISTIC DUAL-CLOCK BROADCAST BAR -->
      <div class="interstellar-clock-bar">
        <!-- Traveler Proper Time (tau) -->
        <div class="clock-card traveler-card">
          <div class="clock-label">
            <span class="clock-dot traveler-dot"></span>
            <span>TRAVELER PROPER TIME (τ)</span>
            <span class="clock-note">LOCAL OBSERVER</span>
          </div>
          <div id="int-traveler-time" class="clock-digits">0y 000d 00:00:00</div>
          <div class="clock-sub">Time experienced inside the spacecraft</div>
        </div>

        <!-- Relativistic Dilation Gauge (Center Dial) -->
        <div class="dilation-dial-card">
          <div class="dial-title">TIME DILATION FACTOR</div>
          <div class="dial-value-row">
            <span id="int-dilation-val" class="dial-num">1.00</span>
            <span class="dial-unit">×</span>
          </div>
          <div id="int-dilation-ratio" class="dial-ratio">1 HR = 1 HR ON EARTH</div>
          <div class="dilation-bar-track">
            <div id="int-dilation-bar" class="dilation-bar-fill" style="width: 0.1%;"></div>
          </div>
        </div>

        <!-- Earth Coordinate Time (t) -->
        <div class="clock-card earth-card">
          <div class="clock-label">
            <span class="clock-dot earth-dot"></span>
            <span>EARTH TIME ELAPSED (t)</span>
            <span class="clock-note">MINKOWSKI REFERENCE</span>
          </div>
          <div id="int-earth-time" class="clock-digits">0y 000d 00:00:00</div>
          <div class="clock-sub">Elapsed coordinate time on Earth</div>
        </div>
      </div>
    `;

    this.dom = {
      container,
      badge: document.getElementById('interstellar-phase-badge'),
      title: document.getElementById('interstellar-stage-title'),
      subtitle: document.getElementById('interstellar-stage-sub'),
      btnPrev: document.getElementById('int-btn-prev'),
      btnNext: document.getElementById('int-btn-next'),
      btnPause: document.getElementById('int-btn-pause'),
      btnOverview: document.getElementById('int-btn-overview'),
      btnDoppler: document.getElementById('int-btn-doppler'),
      btnLore: document.getElementById('int-btn-lore'),
      btnExit: document.getElementById('int-btn-exit'),

      drawer: document.getElementById('interstellar-lore-drawer'),
      drawerClose: document.getElementById('drawer-close-btn'),
      drawerTag: document.getElementById('drawer-lore-type'),
      drawerSummary: document.getElementById('drawer-stage-summary'),
      drawerPhysics: document.getElementById('drawer-physics-note'),

      tickBanner: document.getElementById('interstellar-tick-banner'),

      travelerClock: document.getElementById('int-traveler-time'),
      earthClock: document.getElementById('int-earth-time'),
      dilationVal: document.getElementById('int-dilation-val'),
      dilationRatio: document.getElementById('int-dilation-ratio'),
      dilationBar: document.getElementById('int-dilation-bar')
    };
  }

  _bindEvents() {
    this.dom.btnPrev?.addEventListener('click', () => this.simulation.prevStage());
    this.dom.btnNext?.addEventListener('click', () => this.simulation.nextStage());
    this.dom.btnPause?.addEventListener('click', () => {
      const isPaused = this.simulation.togglePause();
      if (this.dom.btnPause) {
        this.dom.btnPause.textContent = isPaused ? '▶ RESUME' : '⏸ PAUSE';
      }
    });

    this.dom.btnOverview?.addEventListener('click', () => {
      const active = this.simulation.toggleSystemOverview();
      this.dom.btnOverview?.classList.toggle('active', active);
    });

    this.dom.btnDoppler?.addEventListener('click', () => {
      const enabled = this.simulation.toggleDopplerAsymmetry();
      if (this.dom.btnDoppler) {
        this.dom.btnDoppler.textContent = enabled ? '✨ DOPPLER: ON' : '✨ DOPPLER: OFF';
        this.dom.btnDoppler.classList.toggle('active', enabled);
      }
    });

    this.dom.btnLore?.addEventListener('click', () => {
      if (this.dom.drawer) {
        const isOpen = this.dom.drawer.style.display !== 'none';
        this.dom.drawer.style.display = isOpen ? 'none' : 'block';
        this.dom.btnLore.classList.toggle('active', !isOpen);
      }
    });

    this.dom.drawerClose?.addEventListener('click', () => {
      if (this.dom.drawer) this.dom.drawer.style.display = 'none';
      this.dom.btnLore?.classList.remove('active');
    });

    this.dom.btnExit?.addEventListener('click', () => {
      this.simulation.stop();
      this.hide();
      this.simulation.engine.setMode?.('starship');
    });

    // Keyboard shortcuts
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (!this.visible) return;
        if (e.key === 'ArrowRight' || e.key === 'KeyN') {
          this.simulation.nextStage();
        } else if (e.key === 'ArrowLeft' || e.key === 'KeyP') {
          this.simulation.prevStage();
        } else if (e.code === 'Space') {
          e.preventDefault();
          const paused = this.simulation.togglePause();
          if (this.dom.btnPause) this.dom.btnPause.textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
        } else if (e.key === 'KeyO' || e.key === 'o') {
          const active = this.simulation.toggleSystemOverview();
          this.dom.btnOverview?.classList.toggle('active', active);
        } else if (e.key === 'KeyD' || e.key === 'd') {
          const enabled = this.simulation.toggleDopplerAsymmetry();
          if (this.dom.btnDoppler) {
            this.dom.btnDoppler.textContent = enabled ? '✨ DOPPLER: ON' : '✨ DOPPLER: OFF';
            this.dom.btnDoppler.classList.toggle('active', enabled);
          }
        }
      });
    }
  }

  show() {
    this.visible = true;
    if (this.dom.container) this.dom.container.style.display = 'block';
  }

  hide() {
    this.visible = false;
    if (this.dom.container) this.dom.container.style.display = 'none';
  }

  notifyStageChanged(stage, stageIndex) {
    if (!this.dom.title) return;
    this.dom.badge.textContent = `STAGE ${stage.number} / 13`;
    this.dom.title.textContent = stage.title;
    this.dom.subtitle.textContent = stage.subtitle;

    if (this.dom.drawerTag) this.dom.drawerTag.textContent = stage.loreType;
    if (this.dom.drawerSummary) this.dom.drawerSummary.textContent = stage.summary;
    if (this.dom.drawerPhysics) this.dom.drawerPhysics.textContent = stage.physicsNote;

    const onMillerWater = stage.id === 'WATER_LANDING' || stage.id === 'WAVE_DISCOVERY' || stage.id === 'WAVE_ENCOUNTER';
    if (this.dom.tickBanner) {
      this.dom.tickBanner.style.display = onMillerWater ? 'flex' : 'none';
    }
  }

  updateTelemetry(data) {
    if (!this.visible) return;

    if (this.dom.travelerClock) {
      this.dom.travelerClock.textContent = this._formatTime(data.travelerTimeSec);
    }
    if (this.dom.earthClock) {
      this.dom.earthClock.textContent = this._formatTime(data.earthTimeSec);
    }

    const d = data.dilation || 1.0;
    if (this.dom.dilationVal) {
      if (d >= 1000) {
        this.dom.dilationVal.textContent = Math.round(d).toLocaleString();
      } else {
        this.dom.dilationVal.textContent = d.toFixed(2);
      }
    }

    if (this.dom.dilationRatio) {
      if (d > 50000) {
        this.dom.dilationRatio.textContent = '1 HR = 7.00 YRS ON EARTH (61,320×)';
      } else if (d > 1000) {
        const daysPerMin = (d / 1440).toFixed(1);
        this.dom.dilationRatio.textContent = `1 MIN = ~${daysPerMin} DAYS ON EARTH`;
      } else if (d > 1.05) {
        this.dom.dilationRatio.textContent = `GRAVITATIONAL TIME DILATION: ${d.toFixed(2)}×`;
      } else {
        this.dom.dilationRatio.textContent = '1 HR = 1 HR ON EARTH (1.00×)';
      }
    }

    if (this.dom.dilationBar) {
      // Logarithmic scaling for dial bar
      const logMin = Math.log10(1);
      const logMax = Math.log10(61320);
      const logVal = Math.log10(Math.max(1, d));
      const pct = Math.min(100, Math.max(1, (logVal / logMax) * 100));
      this.dom.dilationBar.style.width = `${pct}%`;
    }
  }
}
