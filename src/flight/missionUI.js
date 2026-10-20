import { FLIGHT_PHASES } from './missionPhysics.js';

// SpaceX Glassmorphic Broadcast Flight HUD & Universal 360° Gimbal / Manual Controls
export class MissionFlightHUD {
  constructor(options = {}) {
    this.options = options;
    this.currentCamMode = 'CHASE';

    this.dom = {
      container: document.getElementById('flight-hud'),
      phaseBadge: document.getElementById('flight-phase-badge'),
      autoBtn: document.getElementById('flight-auto-btn'),
      trackBoosterBtn: document.getElementById('flight-track-booster-btn'),
      resetBtn: document.getElementById('flight-reset-btn'),
      camBar: document.getElementById('flight-cam-bar'),
      trajSwitch: document.getElementById('flight-traj-switch'),
      trajectoryPrompt: document.getElementById('flight-trajectory-prompt'),
      destSwitch: document.getElementById('flight-dest-switch'),
      transferBtn: document.getElementById('flight-transfer-btn'),
      deorbitBtn: document.getElementById('flight-deorbit-btn'),
      roadsterBtn: document.getElementById('flight-roadster-btn'),
      opsStatus: document.getElementById('flight-ops-status'),

      // Universal 360° Gimbal Bar (Active on ALL Cameras)
      gimbalBar: document.getElementById('flight-gimbal-bar'),
      gimbalLeft: document.getElementById('gimbal-left'),
      gimbalRight: document.getElementById('gimbal-right'),
      gimbalUp: document.getElementById('gimbal-up'),
      gimbalDown: document.getElementById('gimbal-down'),
      gimbalReset: document.getElementById('gimbal-reset'),

      // Super Heavy Booster Wing
      boosterBox: document.getElementById('flight-booster-tank-box'),
      boosterEngines: document.getElementById('spx-booster-engines'),
      boosterTag: document.getElementById('spx-booster-tag'),
      boosterSpeedVal: document.getElementById('spx-booster-speed'),
      boosterAltVal: document.getElementById('spx-booster-alt'),
      boosterFuelBar: document.getElementById('flight-booster-fuel-bar'),
      boosterCh4Bar: document.getElementById('spx-booster-ch4-bar'),

      // Center Bridge: Clock, Timeline, Primary Action & Unrestricted Manual Overrides
      missionClock: document.getElementById('spx-mission-clock'),
      timeline: document.getElementById('spx-timeline'),
      stageBtn: document.getElementById('flight-stage-btn'),
      manualControls: document.getElementById('flight-manual-controls'),
      throttleVal: document.getElementById('flight-throttle-val'),
      btnThrottleUp: document.getElementById('flight-btn-throttle-up'),
      btnThrottleDown: document.getElementById('flight-btn-throttle-down'),
      btnStageNow: document.getElementById('flight-btn-stage-now'),
      btnLegs: document.getElementById('flight-btn-legs'),
      btnCargo: document.getElementById('flight-btn-cargo'),

      // Starship Wing
      shipEngines: document.getElementById('spx-ship-engines'),
      shipTag: document.getElementById('spx-ship-tag'),
      speedVal: document.getElementById('flight-speed-val'),
      altitudeVal: document.getElementById('flight-alt-val'),
      shipFuelBar: document.getElementById('flight-ship-fuel-bar'),
      shipCh4Bar: document.getElementById('spx-ship-ch4-bar'),
      heatContainer: document.getElementById('flight-heat-container'),
      heatBar: document.getElementById('flight-heat-bar'),

      // Prompts & Exit
      actionPrompt: document.getElementById('flight-action-prompt'),
      exitBtn: document.getElementById('flight-exit-btn'),

      // Attitude D-Pad
      mobileSteering: document.getElementById('flight-mobile-steering'),
      btnPitchDown: document.getElementById('flight-btn-pitch-down'),
      btnPitchUp: document.getElementById('flight-btn-pitch-up'),
      btnYawLeft: document.getElementById('flight-btn-yaw-left'),
      btnYawRight: document.getElementById('flight-btn-yaw-right'),

      // Starship Orbital Score Card
      scoreCard: document.getElementById('flight-score-card'),
      scoreVal: document.getElementById('flight-score-val'),
      scoreApogee: document.getElementById('score-apogee-val'),
      scoreVelocity: document.getElementById('score-velocity-val'),
      scoreBooster: document.getElementById('score-booster-val'),
      scoreNext: document.getElementById('score-next-val')
    };

    this.isMobile = false;
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

    if (this.dom.resetBtn) {
      this.dom.resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onResetMission) this.options.onResetMission();
      });
    }

    if (this.dom.destSwitch) {
      const btns = this.dom.destSwitch.querySelectorAll('[data-dest]');
      btns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const dest = btn.getAttribute('data-dest');
          if (dest && this.options.onSelectDestination) this.options.onSelectDestination(dest);
        });
      });
    }

    if (this.dom.transferBtn) {
      this.dom.transferBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onTransfer) this.options.onTransfer();
      });
    }

    if (this.dom.deorbitBtn) {
      this.dom.deorbitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onDeorbit) this.options.onDeorbit();
      });
    }

    if (this.dom.roadsterBtn) {
      this.dom.roadsterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onToggleRoadster) this.options.onToggleRoadster();
      });
    }

    if (this.dom.camBar) {
      const tabs = this.dom.camBar.querySelectorAll('.cam-tab-btn');
      tabs.forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const cam = tab.getAttribute('data-cam');
          if (cam && this.options.onSelectCamera) {
            this.options.onSelectCamera(cam);
          }
        });
      });
    }

    const bindTrajButtons = (rootEl, selector) => {
      if (!rootEl) return;
      const btns = rootEl.querySelectorAll(selector);
      btns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const mode = btn.getAttribute('data-traj');
          if (mode && this.options.onSelectTrajectory) {
            this.options.onSelectTrajectory(mode);
          }
        });
      });
    };
    bindTrajButtons(this.dom.trajSwitch, '.traj-opt-btn');
    bindTrajButtons(this.dom.trajectoryPrompt, '.traj-prompt-btn');

    // Universal 360° Gimbal continuous hold & tap controls
    const bindGimbalBtn = (btn, dYaw, dPitch) => {
      if (!btn) return;
      let holdInterval = null;
      const step = () => {
        if (this.options.onGimbalMove) this.options.onGimbalMove(dYaw, dPitch);
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        step();
        if (holdInterval) clearInterval(holdInterval);
        holdInterval = setInterval(step, 32);
      });
      const stop = () => {
        if (holdInterval) {
          clearInterval(holdInterval);
          holdInterval = null;
        }
      };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('pointerleave', stop);
    };

    bindGimbalBtn(this.dom.gimbalLeft, 0.08, 0);
    bindGimbalBtn(this.dom.gimbalRight, -0.08, 0);
    bindGimbalBtn(this.dom.gimbalUp, 0, 0.06);
    bindGimbalBtn(this.dom.gimbalDown, 0, -0.06);

    if (this.dom.gimbalReset) {
      this.dom.gimbalReset.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onResetGimbal) this.options.onResetGimbal();
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

    if (this.dom.btnStageNow) {
      this.dom.btnStageNow.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onManualStage) this.options.onManualStage();
      });
    }

    if (this.dom.btnLegs) {
      this.dom.btnLegs.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onToggleLegs) this.options.onToggleLegs();
      });
    }

    if (this.dom.btnCargo) {
      this.dom.btnCargo.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onToggleCargo) this.options.onToggleCargo();
      });
    }

    // Attitude D-Pad hold events
    const bindTouchDir = (btn, onActive, onRelease) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('active');
        if (onActive) onActive();
      });
      const end = () => {
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
  }

  notifyCameraMode(modeName) {
    this.currentCamMode = modeName;
    if (this.dom.camBar) {
      const tabs = this.dom.camBar.querySelectorAll('.cam-tab-btn');
      tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.getAttribute('data-cam') === modeName);
      });
    }
    // All cameras are on a 360° gimbal
    if (this.dom.gimbalBar) {
      this.dom.gimbalBar.style.display = 'flex';
    }
  }

  notifyTransfer(target) {
    this.transferTarget = target || null;
    if (this.dom.transferBtn) {
      this.dom.transferBtn.classList.toggle('active', Boolean(target));
    }
  }

  notifyPlanet(planetId) {
    this.currentPlanet = planetId || 'mars';
  }

  notifyRoadster(enabled) {
    if (this.dom.roadsterBtn) {
      this.dom.roadsterBtn.classList.toggle('active', Boolean(enabled));
      this.dom.roadsterBtn.textContent = enabled ? 'ROADSTER ON' : 'ROADSTER';
    }
  }

  show(visible = true, isMobile = false) {
    this.isMobile = isMobile;
    if (!this.dom.container) return;
    if (visible) {
      this.dom.container.classList.add('active');
      if (this.dom.gimbalBar) this.dom.gimbalBar.style.display = 'flex';
      if (this.dom.mobileSteering) {
        this.dom.mobileSteering.style.display = isMobile ? 'flex' : 'none';
      }
    } else {
      this.dom.container.classList.remove('active');
      if (this.dom.mobileSteering) this.dom.mobileSteering.style.display = 'none';
      if (this.dom.scoreCard) this.dom.scoreCard.style.display = 'none';
      if (this.dom.trajectoryPrompt) this.dom.trajectoryPrompt.style.display = 'none';
    }
  }

  formatMissionClock(physics) {
    if (physics.phase === FLIGHT_PHASES.ON_PAD && physics.missionTime < 0.1) {
      return 'T- 00:00:03';
    }
    if (physics.phase === FLIGHT_PHASES.COUNTDOWN) {
      const sec = Math.ceil(Math.max(0, physics.countdownTimer));
      return `T- 00:00:0${sec}`;
    }
    const totalSec = Math.floor(Math.max(0, physics.missionTime));
    const hrs = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `T+ ${hrs}:${mins}:${secs}`;
  }

  update(physics) {
    if (!this.dom.container || !this.dom.container.classList.contains('active')) return;

    // 1. Sync Orbital / Suborbital Trajectory Selector & Pre-Space Decision Banner
    const trajMode = physics.trajectoryMode || 'ORBITAL';
    if (this.dom.trajSwitch) {
      const btns = this.dom.trajSwitch.querySelectorAll('.traj-opt-btn');
      btns.forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-traj') === trajMode);
      });
    }
    if (this.dom.trajectoryPrompt) {
      this.dom.trajectoryPrompt.style.display = physics.showTrajectoryPrompt ? 'flex' : 'none';
      if (physics.showTrajectoryPrompt) {
        const btns = this.dom.trajectoryPrompt.querySelectorAll('.traj-prompt-btn');
        btns.forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-traj') === trajMode);
        });
      }
    }

    // Destination & interplanetary transfer controls
    const destination = (physics.destination || 'earth').toLowerCase();
    const currentPlanet = (physics.planetId || 'mars').toLowerCase();
    if (this.dom.destSwitch) {
      const btns = this.dom.destSwitch.querySelectorAll('[data-dest]');
      btns.forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-dest') === destination.toUpperCase());
      });
    }
    const inOrbit = physics.phase === FLIGHT_PHASES.ORBIT;
    const inTransit = physics.phase === FLIGHT_PHASES.INTERPLANETARY;
    if (this.dom.transferBtn) {
      const targetName = destination === currentPlanet ? 'LOCAL DEORBIT' : destination.toUpperCase();
      this.dom.transferBtn.textContent = inTransit ? 'IN TRANSIT' : `TRANSFER · ${targetName}`;
      this.dom.transferBtn.disabled = !inOrbit;
      this.dom.transferBtn.classList.toggle('available', inOrbit);
    }
    if (this.dom.deorbitBtn) {
      this.dom.deorbitBtn.disabled = !inOrbit;
      this.dom.deorbitBtn.classList.toggle('available', inOrbit);
    }
    if (this.dom.opsStatus) {
      const transferText = inTransit
        ? `HELIOCENTRIC CRUISE // ${destination.toUpperCase()} · INTERPLANETARY TRANSFER`
        : '';
      this.dom.opsStatus.textContent = physics.opsMessage || transferText || '';
      this.dom.opsStatus.classList.toggle('active', Boolean(physics.opsMessage || transferText));
    }

    // 2. Mission Clock (T- / T+)
    if (this.dom.missionClock) {
      this.dom.missionClock.textContent = this.formatMissionClock(physics);
    }

    // 3. Super Heavy Booster Telemetry (Strict Physics Velocity M/S & Altitude KM)
    const bAltMeters = physics.vehicle?.isMated ? physics.altitude : physics.boosterAltitude;
    const bSpeedMs = Math.round(physics.vehicle?.isMated ? physics.speed : (physics.boosterSpeed || 0));
    const bAltKm = (Math.max(0, bAltMeters || 0) / 1000).toFixed(1);
    if (this.dom.boosterSpeedVal) this.dom.boosterSpeedVal.textContent = bSpeedMs.toLocaleString();
    if (this.dom.boosterAltVal) this.dom.boosterAltVal.textContent = bAltKm;

    if (this.dom.boosterFuelBar && this.dom.boosterCh4Bar) {
      const bFuel = Math.max(0, Math.min(100, physics.boosterFuel || 0));
      this.dom.boosterFuelBar.style.width = `${bFuel}%`;
      this.dom.boosterCh4Bar.style.width = `${Math.max(0, bFuel - 1.5)}%`;
    }

    if (this.dom.boosterEngines) {
      const bMode = physics.boosterRaptorMode || 'OFF';
      if (this._lastBMode !== bMode) {
        this._lastBMode = bMode;
        this.dom.boosterEngines.className = `spx-engine-graphic mode-${bMode.toLowerCase()}`;
      }
    }

    if (this.dom.boosterTag) {
      const bTagMap = {
        ATTACHED: physics.phase === FLIGHT_PHASES.ON_PAD
          ? 'ON PAD · 0.38G'
          : (physics.phase === FLIGHT_PHASES.COUNTDOWN ? 'IGNITION' : `STAGE 1 · ${physics.gForce}G`),
        BOOSTBACK: 'BOOSTBACK BURN',
        DESCENT: 'GRID FIN GLIDE',
        APPROACH: 'LANDING BURN',
        CAUGHT: 'TOWER CAUGHT'
      };
      this.dom.boosterTag.textContent = bTagMap[physics.boosterState] || physics.boosterState;
    }

    // 4. Starship Telemetry (Strict Physics Velocity M/S, Altitude KM & Proper IMU G-Force)
    const sAlt = Math.max(0, physics.altitude || 0);
    const sAltKm = (sAlt / 1000).toFixed(1);
    const sSpeedMs = Math.round(physics.speed || 0);
    if (this.dom.speedVal) this.dom.speedVal.textContent = sSpeedMs.toLocaleString();
    if (this.dom.altitudeVal) this.dom.altitudeVal.textContent = sAltKm;

    if (this.dom.shipFuelBar && this.dom.shipCh4Bar) {
      const sFuel = Math.max(0, Math.min(100, physics.starshipFuel || 0));
      this.dom.shipFuelBar.style.width = `${sFuel}%`;
      this.dom.shipCh4Bar.style.width = `${Math.max(0, sFuel - 1.0)}%`;
    }

    if (this.dom.shipEngines) {
      const sMode = physics.shipRaptorMode || 'OFF';
      if (this._lastSMode !== sMode) {
        this._lastSMode = sMode;
        this.dom.shipEngines.className = `spx-engine-graphic mode-${sMode.toLowerCase()}`;
      }
    }

    if (this.dom.shipTag) {
      if (physics.isMaxQ) {
        this.dom.shipTag.textContent = `MAX-Q (${physics.qKPa} kPa) · ${physics.gForce}G`;
      } else if (physics.heat > 0.04) {
        const tempC = Math.round(220 + physics.heat * 1430);
        this.dom.shipTag.textContent = `PLASMA ${tempC}°C · ${physics.gForce}G`;
      } else if (physics.shipCaughtByTower && physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.shipTag.textContent = `TOWER CAUGHT · ${physics.gForce}G`;
      } else if (!physics.autoMission) {
        this.dom.shipTag.textContent = `M ${physics.mach} · ${physics.gForce}G · P ${physics.pitchDeg}°`;
      } else {
        this.dom.shipTag.textContent = `MACH ${physics.mach || '0.00'} · ${physics.gForce || '0.38'}G`;
      }
    }

    // 5. Re-entry Heat Bar
    if (this.dom.heatContainer && this.dom.heatBar) {
      if (physics.heat > 0.02) {
        this.dom.heatContainer.style.display = 'flex';
        this.dom.heatBar.style.width = `${Math.round(physics.heat * 100)}%`;
      } else {
        this.dom.heatContainer.style.display = 'none';
      }
    }

    // 6. Auto vs Manual Mode Toggle & Full Unrestricted Manual Controls
    if (this.dom.autoBtn) {
      this.dom.autoBtn.textContent = physics.autoMission ? 'AUTO' : 'MANUAL';
      this.dom.autoBtn.classList.toggle('active', physics.autoMission);
    }

    if (this.dom.manualControls) {
      // In Manual Mode (!autoMission), give full control at ANY point in time!
      const showManual = !physics.autoMission;
      this.dom.manualControls.style.display = showManual ? 'flex' : 'none';
      if (showManual) {
        if (this.dom.throttleVal) {
          this.dom.throttleVal.textContent = `${Math.round(physics.throttle * 100)}%`;
        }
        if (this.dom.btnStageNow) {
          this.dom.btnStageNow.style.display = physics.vehicle?.isMated ? 'inline-flex' : 'none';
        }
        if (this.dom.btnLegs) {
          this.dom.btnLegs.classList.toggle('active', Boolean(physics.landingLegsDeployed));
        }
        if (this.dom.btnCargo) {
          this.dom.btnCargo.classList.toggle('active', Boolean(physics.cargoDoorsDeployed));
        }
      }
    }

    if (this.dom.mobileSteering) {
      const showTouchPad = this.isMobile || !physics.autoMission;
      this.dom.mobileSteering.style.display = showTouchPad ? 'flex' : 'none';
    }

    // 7. Highlight BOOSTER camera tab while Super Heavy is returning to tower
    if (this.dom.trackBoosterBtn) {
      const isSeparated = physics.boosterState && physics.boosterState !== 'ATTACHED' && physics.boosterState !== 'CAUGHT';
      this.dom.trackBoosterBtn.classList.toggle('pulse-highlight', Boolean(isSeparated && this.currentCamMode !== 'BOOSTER_CAM'));
    }

    // 8. SpaceX Timeline Milestones
    if (this.dom.timeline) {
      const phaseOrder = {
        [FLIGHT_PHASES.ON_PAD]: 0,
        [FLIGHT_PHASES.COUNTDOWN]: 0,
        [FLIGHT_PHASES.BOOSTER_ASCENT]: physics.altitude > 10000 ? 2 : 1,
        [FLIGHT_PHASES.HOT_STAGING]: 3,
        [FLIGHT_PHASES.STARSHIP_ASCENT]: physics.boosterState === 'CAUGHT' ? 4 : 3,
        [FLIGHT_PHASES.ORBIT]: 5,
        [FLIGHT_PHASES.INTERPLANETARY]: 5,
        [FLIGHT_PHASES.DEORBIT]: 5,
        [FLIGHT_PHASES.HYPERSONIC_ENTRY]: 6,
        [FLIGHT_PHASES.BELLYFLOP]: 6,
        [FLIGHT_PHASES.LANDING_FLIP]: 7,
        [FLIGHT_PHASES.TOUCHDOWN]: 7,
        [FLIGHT_PHASES.LANDED]: 8
      };
      const currentIdx = phaseOrder[physics.phase] ?? 0;
      const nodes = this.dom.timeline.querySelectorAll('.spx-tl-step');
      nodes.forEach((node, idx) => {
        const stepNum = idx + 1;
        node.classList.toggle('done', currentIdx > stepNum);
        node.classList.toggle('active', currentIdx === stepNum);
      });
    }

    // 9. Orbital Score Card
    if (this.dom.scoreCard) {
      if (physics.phase === FLIGHT_PHASES.ORBIT) {
        this.dom.scoreCard.style.display = 'block';
        if (this.dom.scoreVal) this.dom.scoreVal.textContent = (physics.starshipScore || 15420).toLocaleString();
        if (this.dom.scoreApogee) this.dom.scoreApogee.textContent = `${sAltKm} km`;
        if (this.dom.scoreVelocity) this.dom.scoreVelocity.textContent = `${sSpeedMs} m/s`;
        if (this.dom.scoreBooster) {
          this.dom.scoreBooster.textContent = physics.boosterState === 'CAUGHT' ? 'TOWER CAUGHT' : physics.boosterState;
        }
      } else {
        this.dom.scoreCard.style.display = 'none';
      }
    }

    // 10. Phase Badge, Primary Launch/Stage Button & Prompt
    if (this.dom.phaseBadge) {
      const titles = {
        [FLIGHT_PHASES.ON_PAD]: `${(physics.planetProfile?.name || 'MARS')} STARBASE // PAD AWAITING LAUNCH`,
        [FLIGHT_PHASES.COUNTDOWN]: 'T-MINUS // 33 RAPTOR IGNITION',
        [FLIGHT_PHASES.BOOSTER_ASCENT]: 'STAGE 1 // SUPER HEAVY ASCENT',
        [FLIGHT_PHASES.HOT_STAGING]: 'HOT-STAGING // STAGE SEPARATION',
        [FLIGHT_PHASES.STARSHIP_ASCENT]: trajMode === 'SUBORBITAL'
          ? 'STAGE 2 // SUBORBITAL ASCENT'
          : 'STAGE 2 // ORBITAL INSERTION',
        [FLIGHT_PHASES.ORBIT]: `SECO // LOW ${physics.planetProfile?.name || 'MARS'} ORBIT COAST`,
        [FLIGHT_PHASES.INTERPLANETARY]: `INTERPLANETARY TRANSFER // CRUISE TO ${(physics.destination || 'earth').toUpperCase()}`,
        [FLIGHT_PHASES.DEORBIT]: 'DEORBIT BURN // RETROGRADE FIRING',
        [FLIGHT_PHASES.HYPERSONIC_ENTRY]: 'ATMOSPHERIC ENTRY // PLASMA INTERFACE',
        [FLIGHT_PHASES.BELLYFLOP]: 'SUBSONIC SKYDIVE // FLAP TRIM',
        [FLIGHT_PHASES.LANDING_FLIP]: 'LANDING BURN // FLIP MANEUVER',
        [FLIGHT_PHASES.TOUCHDOWN]: 'MECHAZILLA APPROACH // TOWER CATCH',
        [FLIGHT_PHASES.LANDED]: physics.shipCaughtByTower
          ? 'STARSHIP CAUGHT // MECHAZILLA TOWER'
          : 'TOUCHDOWN CONFIRMED // MARS SURFACE'
      };
      this.dom.phaseBadge.textContent = titles[physics.phase] || physics.phase;
    }

    if (this.dom.stageBtn) {
      if (physics.phase === FLIGHT_PHASES.ON_PAD) {
        this.dom.stageBtn.style.display = 'inline-flex';
        this.dom.stageBtn.textContent = 'IGNITE / LAUNCH';
        this.dom.stageBtn.className = 'flight-stage-btn launch-ready';
      } else if (physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.stageBtn.style.display = 'inline-flex';
        this.dom.stageBtn.textContent = 'EVA / ROVER';
        this.dom.stageBtn.className = 'flight-stage-btn landed-ready';
      } else {
        this.dom.stageBtn.style.display = 'none';
      }
    }

    if (this.dom.actionPrompt) {
      let promptHtml = '';
      if (physics.opsMessage) {
        promptHtml = `<span class="glow-text">${physics.opsMessage}</span>`;
      } else if (physics.phase === FLIGHT_PHASES.INTERPLANETARY) {
        promptHtml = `<span class="glow-text">INTERPLANETARY CRUISE // ${(physics.destination || 'earth').toUpperCase()} ARRIVAL · ENTRY GUIDANCE ARMED · USE TIME WARP TO COMPRESS TRANSIT</span>`;
      } else if (!physics.autoMission) {
        promptHtml = `<span class="glow-text">MANUAL FLIGHT ACTIVE // W/S: THROTTLE · ARROWS/AD: PITCH & YAW · Q/E: ROLL · X: STAGE · G: LEGS · B: CARGO</span>`;
      } else if (physics.phase === FLIGHT_PHASES.ON_PAD) {
        promptHtml = `<span class="glow-text">LAUNCH SEQUENCE ARMED // CLICK IGNITE OR PRESS [SPACE]</span>`;
      } else if (physics.phase === FLIGHT_PHASES.STARSHIP_ASCENT && (physics.boosterState === 'BOOSTBACK' || physics.boosterState === 'DESCENT' || physics.boosterState === 'APPROACH')) {
        if (this.currentCamMode !== 'BOOSTER_CAM') {
          promptHtml = `<span class="glow-text">SUPER HEAVY RETURNING TO STARBASE // SELECT 'BOOSTER' CAM TO VIEW TOWER CATCH</span>`;
        } else {
          promptHtml = `<span class="glow-text">TRACKING SUPER HEAVY RETURN TO MECHAZILLA CHOPSTICKS</span>`;
        }
      } else if (physics.phase === FLIGHT_PHASES.LANDED) {
        promptHtml = `<span class="glow-text">${physics.shipCaughtByTower ? 'STARSHIP SECURED IN MECHAZILLA ARMS' : `STARSHIP LANDED ON ${(physics.planetProfile?.name || 'MARS')}`} // RECOVERY CREWS INBOUND</span>`;
      }
      if (this._lastPromptHtml !== promptHtml) {
        this._lastPromptHtml = promptHtml;
        this.dom.actionPrompt.innerHTML = promptHtml;
      }
    }
  }
}
