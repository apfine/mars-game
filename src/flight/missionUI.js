import { FLIGHT_PHASES } from './missionPhysics.js';

// Aerospace Mission Flight HUD & Mobile Touch Flight Controls
export class MissionFlightHUD {
  constructor(options = {}) {
    this.options = options;
    this.container = document.getElementById('flight-hud');

    this.dom = {
      container: document.getElementById('flight-hud'),
      phaseBadge: document.getElementById('flight-phase-badge'),
      altitudeVal: document.getElementById('flight-alt-val'),
      speedVal: document.getElementById('flight-speed-val'),
      machVal: document.getElementById('flight-mach-val'),
      throttleBar: document.getElementById('flight-throttle-bar'),
      heatContainer: document.getElementById('flight-heat-container'),
      heatBar: document.getElementById('flight-heat-bar'),
      stageBtn: document.getElementById('flight-stage-btn'),
      actionPrompt: document.getElementById('flight-action-prompt'),
      exitBtn: document.getElementById('flight-exit-btn')
    };

    this.initEvents();
  }

  initEvents() {
    if (this.dom.stageBtn) {
      this.dom.stageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onStage) this.options.onStage();
      });
    }

    if (this.dom.exitBtn) {
      this.dom.exitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onExit) this.options.onExit();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.dom.container && this.dom.container.classList.contains('active')) {
        if (e.code === 'Space') {
          if (this.options.onStage) this.options.onStage();
        }
      }
    });
  }

  show(visible = true) {
    if (!this.dom.container) return;
    if (visible) {
      this.dom.container.classList.add('active');
    } else {
      this.dom.container.classList.remove('active');
    }
  }

  update(physics) {
    if (!this.dom.container || !this.dom.container.classList.contains('active')) return;

    // 1. Altitude
    const alt = Math.max(0, physics.altitude);
    if (this.dom.altitudeVal) {
      if (alt >= 1000) {
        this.dom.altitudeVal.textContent = `${(alt / 1000).toFixed(1)} km`;
      } else {
        this.dom.altitudeVal.textContent = `${Math.round(alt)} m`;
      }
    }

    // 2. Speed & Mach
    if (this.dom.speedVal) {
      const speedKmh = Math.round(physics.speed * 3.6);
      this.dom.speedVal.textContent = `${speedKmh} km/h`;
    }
    if (this.dom.machVal) {
      this.dom.machVal.textContent = `Mach ${physics.mach}`;
    }

    // 3. Throttle
    if (this.dom.throttleBar) {
      this.dom.throttleBar.style.width = `${Math.round(physics.throttle * 100)}%`;
    }

    // 4. Re-entry Heat & Plasma
    if (this.dom.heatContainer && this.dom.heatBar) {
      if (physics.heat > 0.05) {
        this.dom.heatContainer.style.display = 'block';
        this.dom.heatBar.style.width = `${Math.round(physics.heat * 100)}%`;
        const tempC = Math.round(200 + physics.heat * 1450);
        this.dom.heatBar.setAttribute('data-temp', `${tempC}°C`);
      } else {
        this.dom.heatContainer.style.display = 'none';
      }
    }

    // 5. Phase Badges & Dynamic Action Prompts
    if (this.dom.phaseBadge) {
      const titles = {
        [FLIGHT_PHASES.ON_PAD]: 'PRE-LAUNCH // STARBASE OLM',
        [FLIGHT_PHASES.COUNTDOWN]: 'T-MINUS COUNTDOWN // IGNITION',
        [FLIGHT_PHASES.BOOSTER_ASCENT]: 'STAGE 1: 33 RAPTOR ASCENT',
        [FLIGHT_PHASES.HOT_STAGING]: 'HOT-STAGING INTERSTAGE FIRING',
        [FLIGHT_PHASES.STARSHIP_ASCENT]: 'STAGE 2: STARSHIP VACUUM ASCENT',
        [FLIGHT_PHASES.ORBIT]: 'LOW MARS ORBIT INSERTION',
        [FLIGHT_PHASES.DEORBIT]: 'RETROGRADE DEORBIT BURN',
        [FLIGHT_PHASES.HYPERSONIC_ENTRY]: 'HYPERSONIC RE-ENTRY PLASMA',
        [FLIGHT_PHASES.BELLYFLOP]: 'ATMOSPHERIC BELLY-FLOP SKYDIVE',
        [FLIGHT_PHASES.LANDING_FLIP]: 'RAPTOR LANDING FLIP MANEUVER',
        [FLIGHT_PHASES.TOUCHDOWN]: 'FINAL TOUCHDOWN CUSHION',
        [FLIGHT_PHASES.LANDED]: 'MISSION SUCCESSFUL // TOUCHDOWN'
      };
      this.dom.phaseBadge.textContent = titles[physics.phase] || physics.phase;
    }

    if (this.dom.actionPrompt) {
      if (physics.phase === FLIGHT_PHASES.ON_PAD) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-text">PRESS [SPACE] OR TAP LAUNCH TO IGNITE 33 RAPTORS</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '🚀 IGNITE';
      } else if (physics.phase === FLIGHT_PHASES.BOOSTER_ASCENT && physics.altitude > 18000) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-alert">READY FOR HOT-STAGING // PRESS [SPACE]</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '⚡ HOT STAGE';
      } else if (physics.phase === FLIGHT_PHASES.HOT_STAGING) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-alert">HOT-STAGING IN PROGRESS</span>`;
      } else if (physics.phase === FLIGHT_PHASES.ORBIT) {
        this.dom.actionPrompt.innerHTML = `<span>ORBIT REACHED // PRESS [SPACE] TO INITIATE DEORBIT & RE-ENTRY</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '🔥 DEORBIT';
      } else if (physics.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-magenta">HYPERSONIC PLASMA SHEATH // USE A/D & W/S TO TRIM FLAPS</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.style.display = 'none';
      } else if (physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-green">STARSHIP TOUCHDOWN COMPLETE // READY FOR SURFACE EXPEDITION</span>`;
        if (this.dom.stageBtn) {
          this.dom.stageBtn.style.display = 'inline-block';
          this.dom.stageBtn.textContent = '🚗 DRIVE ROVER';
        }
      } else {
        this.dom.actionPrompt.textContent = '';
      }
    }
  }
}
