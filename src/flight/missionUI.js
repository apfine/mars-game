import { FLIGHT_PHASES } from './missionPhysics.js';

// Aerospace Mission Flight HUD & Mobile Touch Flight Controls
export class MissionFlightHUD {
  constructor(options = {}) {
    this.options = options;

    this.dom = {
      container: document.getElementById('flight-hud'),
      phaseBadge: document.getElementById('flight-phase-badge'),
      altitudeVal: document.getElementById('flight-alt-val'),
      speedVal: document.getElementById('flight-speed-val'),
      machVal: document.getElementById('flight-mach-val'),
      gforceVal: document.getElementById('flight-gforce-val'),
      downrangeVal: document.getElementById('flight-downrange-val'),

      // Propellant Gauges
      boosterBox: document.getElementById('flight-booster-tank-box'),
      boosterFuelBar: document.getElementById('flight-booster-fuel-bar'),
      boosterFuelVal: document.getElementById('flight-booster-fuel-val'),
      shipFuelBar: document.getElementById('flight-ship-fuel-bar'),
      shipFuelVal: document.getElementById('flight-ship-fuel-val'),

      // Throttle & Heat
      throttleBar: document.getElementById('flight-throttle-bar'),
      throttleVal: document.getElementById('flight-throttle-val'),
      heatContainer: document.getElementById('flight-heat-container'),
      heatBar: document.getElementById('flight-heat-bar'),

      // Buttons & Camera
      stageBtn: document.getElementById('flight-stage-btn'),
      camBtn: document.getElementById('flight-cam-btn'),
      camBadge: document.getElementById('flight-cam-badge'),
      actionPrompt: document.getElementById('flight-action-prompt'),
      exitBtn: document.getElementById('flight-exit-btn'),

      // Throttle buttons
      btnThrottleUp: document.getElementById('flight-btn-throttle-up'),
      btnThrottleDown: document.getElementById('flight-btn-throttle-down'),

      // Mobile cluster
      mobileSteering: document.getElementById('flight-mobile-steering'),
      btnPitchDown: document.getElementById('flight-btn-pitch-down'),
      btnPitchUp: document.getElementById('flight-btn-pitch-up'),
      btnYawLeft: document.getElementById('flight-btn-yaw-left'),
      btnYawRight: document.getElementById('flight-btn-yaw-right')
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

    if (this.dom.camBtn) {
      this.dom.camBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onToggleCamera) this.options.onToggleCamera();
      });
    }

    if (this.dom.exitBtn) {
      this.dom.exitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onExit) this.options.onExit();
      });
    }

    if (this.dom.btnThrottleUp) {
      this.dom.btnThrottleUp.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onThrottleUp) this.options.onThrottleUp();
      });
    }

    if (this.dom.btnThrottleDown) {
      this.dom.btnThrottleDown.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onThrottleDown) this.options.onThrottleDown();
      });
    }

    // Mobile touch steering hold events
    const bindTouchDir = (btn, onActive, onRelease) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('active');
        if (onActive) onActive();
      });
      const end = (e) => {
        btn.classList.remove('active');
        if (onRelease) onRelease();
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
    };

    bindTouchDir(
      this.dom.btnPitchDown,
      () => { if (this.options.onTouchPitch) this.options.onTouchPitch(1); },
      () => { if (this.options.onTouchPitch) this.options.onTouchPitch(0); }
    );
    bindTouchDir(
      this.dom.btnPitchUp,
      () => { if (this.options.onTouchPitch) this.options.onTouchPitch(-1); },
      () => { if (this.options.onTouchPitch) this.options.onTouchPitch(0); }
    );
    bindTouchDir(
      this.dom.btnYawLeft,
      () => { if (this.options.onTouchYaw) this.options.onTouchYaw(-1); },
      () => { if (this.options.onTouchYaw) this.options.onTouchYaw(0); }
    );
    bindTouchDir(
      this.dom.btnYawRight,
      () => { if (this.options.onTouchYaw) this.options.onTouchYaw(1); },
      () => { if (this.options.onTouchYaw) this.options.onTouchYaw(0); }
    );

    window.addEventListener('keydown', (e) => {
      if (this.dom.container && this.dom.container.classList.contains('active')) {
        if (e.code === 'Space') {
          if (this.options.onStage) this.options.onStage();
        }
      }
    });
  }

  notifyCameraMode(modeName) {
    if (this.dom.camBadge) {
      this.dom.camBadge.textContent = `CAM: ${modeName}`;
      this.dom.camBadge.classList.add('pulse');
      setTimeout(() => this.dom.camBadge.classList.remove('pulse'), 600);
    }
  }

  show(visible = true, isMobile = false) {
    if (!this.dom.container) return;
    if (visible) {
      this.dom.container.classList.add('active');
      if (this.dom.mobileSteering) {
        this.dom.mobileSteering.style.display = isMobile ? 'flex' : 'none';
      }
    } else {
      this.dom.container.classList.remove('active');
      if (this.dom.mobileSteering) {
        this.dom.mobileSteering.style.display = 'none';
      }
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
    if (this.dom.gforceVal) {
      this.dom.gforceVal.textContent = `${physics.gForce || 1.0} G`;
    }
    if (this.dom.downrangeVal) {
      this.dom.downrangeVal.textContent = `${physics.downrange || 0.0} km`;
    }

    // 3. Propellant Tanks (LOX + CH4)
    if (this.dom.boosterBox && this.dom.boosterFuelBar && this.dom.boosterFuelVal) {
      const bFuel = Math.max(0, Math.min(100, physics.boosterFuel || 0));
      this.dom.boosterFuelBar.style.width = `${bFuel}%`;
      this.dom.boosterFuelVal.textContent = `${Math.round(bFuel)}%`;
      if (physics.phase === FLIGHT_PHASES.STARSHIP_ASCENT ||
          physics.phase === FLIGHT_PHASES.ORBIT ||
          physics.phase === FLIGHT_PHASES.DEORBIT ||
          physics.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY ||
          physics.phase === FLIGHT_PHASES.BELLYFLOP ||
          physics.phase === FLIGHT_PHASES.LANDING_FLIP ||
          physics.phase === FLIGHT_PHASES.TOUCHDOWN ||
          physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.boosterBox.style.opacity = '0.4';
      } else {
        this.dom.boosterBox.style.opacity = '1.0';
      }
    }

    if (this.dom.shipFuelBar && this.dom.shipFuelVal) {
      const sFuel = Math.max(0, Math.min(100, physics.starshipFuel || 0));
      this.dom.shipFuelBar.style.width = `${sFuel}%`;
      this.dom.shipFuelVal.textContent = `${Math.round(sFuel)}%`;
    }

    // 4. Throttle
    const pct = Math.round(physics.throttle * 100);
    if (this.dom.throttleBar) {
      this.dom.throttleBar.style.width = `${pct}%`;
    }
    if (this.dom.throttleVal) {
      this.dom.throttleVal.textContent = `${pct}%`;
    }

    // 5. Re-entry Heat & Plasma
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

    // 6. Phase Badges & Dynamic Action Prompts
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
      if (physics.boosterFlameout && physics.phase === FLIGHT_PHASES.BOOSTER_ASCENT) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-alert">⚠️ BOOSTER FLAMEOUT // SEPARATE STAGE [SPACE]</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '⚡ HOT STAGE';
      } else if (physics.phase === FLIGHT_PHASES.ON_PAD) {
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
