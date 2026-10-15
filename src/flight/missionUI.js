import { FLIGHT_PHASES } from './missionPhysics.js';

// Aerospace Mission Flight HUD & Mobile Touch Flight Controls
export class MissionFlightHUD {
  constructor(options = {}) {
    this.options = options;

    this.dom = {
      container: document.getElementById('flight-hud'),
      phaseBadge: document.getElementById('flight-phase-badge'),
      boosterBadge: document.getElementById('flight-booster-badge'),
      autoBtn: document.getElementById('flight-auto-btn'),
      trackBoosterBtn: document.getElementById('flight-track-booster-btn'),
      camBar: document.getElementById('flight-cam-bar'),

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
      btnYawRight: document.getElementById('flight-btn-yaw-right'),

      // Starship Orbital Space Score Card & Online Player Count
      scoreCard: document.getElementById('flight-score-card'),
      scoreVal: document.getElementById('flight-score-val'),
      scoreApogee: document.getElementById('score-apogee-val'),
      scoreVelocity: document.getElementById('score-velocity-val'),
      scoreBooster: document.getElementById('score-booster-val'),
      scoreNext: document.getElementById('score-next-val'),
      flightOnlineVal: document.getElementById('flight-online-val'),
      roverOnlineVal: document.getElementById('online-players-count')
    };

    this.onlineCount = 43;
    this.lastOnlineUpdate = 0;

    this.initEvents();
  }

  initEvents() {
    if (this.dom.stageBtn) {
      this.dom.stageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onStage) this.options.onStage();
      });
    }

    if (this.dom.autoBtn) {
      this.dom.autoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onToggleAutoMission) this.options.onToggleAutoMission();
      });
    }

    if (this.dom.trackBoosterBtn) {
      this.dom.trackBoosterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onToggleBoosterTracking) this.options.onToggleBoosterTracking();
      });
    }

    if (this.dom.camBar) {
      const tabs = this.dom.camBar.querySelectorAll('.cam-tab-btn');
      tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const cam = tab.getAttribute('data-cam');
          if (cam && this.options.onSelectCamera) {
            this.options.onSelectCamera(cam);
          }
        });
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
    if (this.dom.camBar) {
      const tabs = this.dom.camBar.querySelectorAll('.cam-tab-btn');
      tabs.forEach(tab => {
        if (tab.getAttribute('data-cam') === modeName) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
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
      if (this.dom.scoreCard) {
        this.dom.scoreCard.style.display = 'none';
      }
    }
  }

  update(physics) {
    if (!this.dom.container || !this.dom.container.classList.contains('active')) return;

    // 0. Live Online Explorer Fluctuation
    const now = performance.now();
    if (!this.lastOnlineUpdate || now - this.lastOnlineUpdate > 12000) {
      this.lastOnlineUpdate = now;
      const delta = (Math.random() > 0.48 ? 1 : -1) * (Math.random() < 0.25 ? 2 : 1);
      this.onlineCount = Math.max(39, Math.min(52, (this.onlineCount || 43) + delta));
      if (this.dom.flightOnlineVal) this.dom.flightOnlineVal.textContent = this.onlineCount;
      if (this.dom.roverOnlineVal) this.dom.roverOnlineVal.textContent = this.onlineCount;
    }

    // 1. Altitude
    const alt = Math.max(0, physics.altitude);
    if (this.dom.altitudeVal) {
      if (alt >= 1000) {
        this.dom.altitudeVal.textContent = `${(alt / 1000).toFixed(1)} km`;
      } else {
        this.dom.altitudeVal.textContent = `${Math.round(alt)} m`;
      }
    }

    // 1.1 Starship Orbital Space Score Card (User Request)
    if (this.dom.scoreCard) {
      if (physics.phase === FLIGHT_PHASES.ORBIT) {
        this.dom.scoreCard.style.display = 'block';
        if (this.dom.scoreVal) {
          const score = physics.starshipScore || 15420;
          this.dom.scoreVal.textContent = score.toLocaleString();
        }
        if (this.dom.scoreApogee) {
          this.dom.scoreApogee.textContent = `${(alt / 1000).toFixed(1)} km`;
        }
        if (this.dom.scoreVelocity) {
          this.dom.scoreVelocity.textContent = `${Math.round(physics.speed)} m/s`;
        }
        if (this.dom.scoreBooster) {
          const isCaught = physics.boosterState === 'CAUGHT';
          this.dom.scoreBooster.textContent = isCaught ? 'MECHAZILLA CAUGHT! 🥢' : (physics.boosterState || 'RECOVERED');
        }
        if (this.dom.scoreNext) {
          this.dom.scoreNext.textContent = 'CLOUD RE-ENTRY // SKYDIVE';
        }
      } else {
        this.dom.scoreCard.style.display = 'none';
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

    // 6. Auto Mission Button State
    if (this.dom.autoBtn) {
      if (physics.autoMission) {
        this.dom.autoBtn.textContent = '🎬 AUTO: ON';
        this.dom.autoBtn.classList.add('active');
      } else {
        this.dom.autoBtn.textContent = '🎮 AUTO: OFF';
        this.dom.autoBtn.classList.remove('active');
      }
    }

    // 7. Booster State Badge & Track Button (Flight 5 Mechazilla Catch)
    if (this.dom.boosterBadge) {
      if (physics.boosterState && physics.boosterState !== 'ATTACHED') {
        this.dom.boosterBadge.style.display = 'inline-block';
        const boosterTitles = {
          BOOSTBACK: 'BOOSTER: BOOSTBACK BURN 🔥',
          DESCENT: 'BOOSTER: GRID FIN GLIDE 🪂',
          APPROACH: 'BOOSTER: CHOPSTICK APPROACH 🥢',
          CAUGHT: 'BOOSTER: MECHAZILLA CAUGHT! 🥢🚀'
        };
        this.dom.boosterBadge.textContent = boosterTitles[physics.boosterState] || `BOOSTER: ${physics.boosterState}`;
        if (physics.boosterState === 'CAUGHT') {
          this.dom.boosterBadge.classList.add('caught');
        } else {
          this.dom.boosterBadge.classList.remove('caught');
        }
      } else {
        this.dom.boosterBadge.style.display = 'none';
      }
    }

    if (this.dom.trackBoosterBtn) {
      if (physics.boosterState && physics.boosterState !== 'ATTACHED') {
        this.dom.trackBoosterBtn.style.display = 'inline-block';
        this.dom.trackBoosterBtn.textContent = physics.boosterTracking ? '🚀 TRACK SHIP' : '🎯 TRACK BOOSTER';
        if (physics.boosterTracking) {
          this.dom.trackBoosterBtn.classList.add('active');
        } else {
          this.dom.trackBoosterBtn.classList.remove('active');
        }
      } else {
        this.dom.trackBoosterBtn.style.display = 'none';
      }
    }

    // 8. Phase Badges & Dynamic Action Prompts
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
        this.dom.actionPrompt.innerHTML = `<span class="glow-text">PRESS [SPACE] OR TAP 'IGNITE' TO LAUNCH (AUTO-PILOT ACTIVE)</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '🚀 IGNITE';
      } else if (physics.phase === FLIGHT_PHASES.BOOSTER_ASCENT && physics.altitude > 18000) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-alert">APPROACHING HOT-STAGING AT 22 KM // SEPARATION IMMINENT</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '⚡ HOT STAGE';
      } else if (physics.phase === FLIGHT_PHASES.HOT_STAGING) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-alert">HOT-STAGING IN PROGRESS // 6 RAPTORS IGNITED</span>`;
      } else if (physics.phase === FLIGHT_PHASES.STARSHIP_ASCENT) {
        if (physics.boosterState === 'APPROACH' || physics.boosterState === 'CAUGHT') {
          this.dom.actionPrompt.innerHTML = `<span class="glow-alert">🥢 MECHAZILLA TOWER CATCH IN PROGRESS // SWITCH TO TOWER OR GROUND CAM</span>`;
        } else {
          this.dom.actionPrompt.innerHTML = `<span class="glow-text">ASCENDING TO MARS ORBIT // BOOSTER RETURNING TO STARBASE</span>`;
        }
      } else if (physics.phase === FLIGHT_PHASES.ORBIT) {
        this.dom.actionPrompt.innerHTML = `<span>ORBIT INSERTION ACHIEVED // AUTO DEORBIT SEQUENCE ARMED</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.textContent = '🔥 DEORBIT';
      } else if (physics.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-magenta">HYPERSONIC IONIZATION PLASMA // 4 FLAPS TRIMMING BELLY-FLOP</span>`;
        if (this.dom.stageBtn) this.dom.stageBtn.style.display = 'none';
      } else if (physics.phase === FLIGHT_PHASES.BELLYFLOP) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-magenta">SUBSONIC SKYDIVE AT 80 M/S // PREPARING LANDING FLIP</span>`;
      } else if (physics.phase === FLIGHT_PHASES.LANDING_FLIP) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-alert">🔥 3 RAPTORS FIRING // RAPID VERTICAL LANDING FLIP</span>`;
      } else if (physics.phase === FLIGHT_PHASES.TOUCHDOWN) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-green">LANDING LEGS DEPLOYED // SOFT TOUCHDOWN CUSHION</span>`;
      } else if (physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.actionPrompt.innerHTML = `<span class="glow-green">TOUCHDOWN SUCCESSFUL // GULLWING DOORS OPEN // CARGO CRANE LOWERED</span>`;
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
