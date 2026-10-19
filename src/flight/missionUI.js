import { FLIGHT_PHASES } from './missionPhysics.js';
import { getPresenceClient } from '../utils/presenceClient.js';

// SpaceX Broadcast Flight HUD & Gimbal / Touch Controls
export class MissionFlightHUD {
  constructor(options = {}) {
    this.options = options;
    this.currentCamMode = 'CHASE';

    this.dom = {
      container: document.getElementById('flight-hud'),
      phaseBadge: document.getElementById('flight-phase-badge'),
      boosterBadge: document.getElementById('flight-booster-badge'),
      autoBtn: document.getElementById('flight-auto-btn'),
      trackBoosterBtn: document.getElementById('flight-track-booster-btn'),
      resetBtn: document.getElementById('flight-reset-btn'),
      camBar: document.getElementById('flight-cam-bar'),
      trajSwitch: document.getElementById('flight-traj-switch'),
      trajectoryPrompt: document.getElementById('flight-trajectory-prompt'),

      // 360° Gimbal Bar
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

      // Center Bridge: Clock, Timeline & Primary Action
      missionClock: document.getElementById('spx-mission-clock'),
      timeline: document.getElementById('spx-timeline'),
      stageBtn: document.getElementById('flight-stage-btn'),
      manualControls: document.getElementById('flight-manual-controls'),
      throttleVal: document.getElementById('flight-throttle-val'),
      btnThrottleUp: document.getElementById('flight-btn-throttle-up'),
      btnThrottleDown: document.getElementById('flight-btn-throttle-down'),

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

    // Bind Orbital vs Suborbital trajectory buttons (both top bar switch and pre-space prompt)
    const bindTrajButtons = (rootEl, selector) => {
      if (!rootEl) return;
      const btns = rootEl.querySelectorAll(selector);
      btns.forEach(btn => {
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

    // 360° Gimbal continuous hold & tap controls
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

    // Mobile touch steering hold events
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
      tabs.forEach(tab => {
        if (tab.getAttribute('data-cam') === modeName) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
    }

    // Show 360° Gimbal control bar whenever Ground Cam or Tower Cam is active
    if (this.dom.gimbalBar) {
      const isGimbalCam = modeName === 'GROUND_CAM' || modeName === 'TOWER_CAM';
      this.dom.gimbalBar.style.display = isGimbalCam ? 'flex' : 'none';
    }
  }

  show(visible = true, isMobile = false) {
    this.isMobile = isMobile;
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
      if (this.dom.trajectoryPrompt) {
        this.dom.trajectoryPrompt.style.display = 'none';
      }
    }
  }

  formatMissionClock(physics) {
    if (physics.phase === FLIGHT_PHASES.ON_PAD) {
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
    this._frame = (this._frame || 0) + 1;
    if (
      this._frame % 2 !== 0 &&
      this._lastPhase === physics.phase &&
      this._lastAuto === physics.autoMission &&
      this._lastTraj === physics.trajectoryMode
    ) return;
    this._lastPhase = physics.phase;
    this._lastAuto = physics.autoMission;
    this._lastTraj = physics.trajectoryMode;

    // 0. Live Online Count
    const presence = getPresenceClient();
    if (presence && this.onlineCount !== presence.onlineCount) {
      this.onlineCount = presence.onlineCount;
      if (this.dom.flightOnlineVal) this.dom.flightOnlineVal.textContent = presence.onlineCount;
      if (this.dom.roverOnlineVal) this.dom.roverOnlineVal.textContent = presence.onlineCount;
    }

    // 0b. Sync Orbital / Suborbital Trajectory Selector & Pre-Space Decision Banner
    const trajMode = physics.trajectoryMode || 'ORBITAL';
    if (this.dom.trajSwitch) {
      const btns = this.dom.trajSwitch.querySelectorAll('.traj-opt-btn');
      btns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-traj') === trajMode);
      });
    }
    if (this.dom.trajectoryPrompt) {
      this.dom.trajectoryPrompt.style.display = physics.showTrajectoryPrompt ? 'flex' : 'none';
      if (physics.showTrajectoryPrompt) {
        const btns = this.dom.trajectoryPrompt.querySelectorAll('.traj-prompt-btn');
        btns.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-traj') === trajMode);
        });
      }
    }

    // 1. Mission Clock (T- / T+)
    if (this.dom.missionClock) {
      this.dom.missionClock.textContent = this.formatMissionClock(physics);
    }

    // 2. Super Heavy Booster Telemetry & 33-Raptor Engine Ring
    const bAltKm = (Math.max(0, physics.boosterAltitude || 0) / 1000).toFixed(1);
    const bSpeedKmh = Math.round((physics.boosterSpeed || 0) * 3.6);
    if (this.dom.boosterSpeedVal) this.dom.boosterSpeedVal.textContent = bSpeedKmh.toLocaleString();
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
        ATTACHED: physics.phase === FLIGHT_PHASES.ON_PAD ? 'ON PAD' : (physics.phase === FLIGHT_PHASES.COUNTDOWN ? 'IGNITION' : 'ASCENT'),
        BOOSTBACK: 'BOOSTBACK BURN',
        DESCENT: 'GRID FIN GLIDE',
        APPROACH: 'LANDING BURN',
        CAUGHT: 'TOWER CAUGHT'
      };
      this.dom.boosterTag.textContent = bTagMap[physics.boosterState] || physics.boosterState;
    }

    // 3. Starship Telemetry & 6-Raptor Engine Cluster
    const sAlt = Math.max(0, physics.altitude || 0);
    const sAltKm = (sAlt / 1000).toFixed(1);
    const sSpeedKmh = Math.round((physics.speed || 0) * 3.6);
    if (this.dom.speedVal) this.dom.speedVal.textContent = sSpeedKmh.toLocaleString();
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
        this.dom.shipTag.textContent = 'MAX-Q · SUPERSONIC';
      } else if (physics.heat > 0.04) {
        const tempC = Math.round(220 + physics.heat * 1430);
        this.dom.shipTag.textContent = `PLASMA ${tempC}°C`;
      } else if (physics.shipCaughtByTower && physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.shipTag.textContent = 'TOWER CAUGHT';
      } else {
        this.dom.shipTag.textContent = `MACH ${physics.mach || '0.0'} · ${physics.gForce || '1.0'}G`;
      }
    }

    // 4. Re-entry Heat Bar
    if (this.dom.heatContainer && this.dom.heatBar) {
      if (physics.heat > 0.03) {
        this.dom.heatContainer.style.display = 'flex';
        this.dom.heatBar.style.width = `${Math.round(physics.heat * 100)}%`;
      } else {
        this.dom.heatContainer.style.display = 'none';
      }
    }

    // 5. Auto vs Manual Mode Toggle & Controls
    if (this.dom.autoBtn) {
      if (physics.autoMission) {
        this.dom.autoBtn.textContent = 'AUTO';
        this.dom.autoBtn.classList.add('active');
      } else {
        this.dom.autoBtn.textContent = 'MANUAL';
        this.dom.autoBtn.classList.remove('active');
      }
    }

    if (this.dom.manualControls) {
      const showManual = !physics.autoMission && physics.phase !== FLIGHT_PHASES.ON_PAD && physics.phase !== FLIGHT_PHASES.LANDED;
      this.dom.manualControls.style.display = showManual ? 'flex' : 'none';
      if (showManual && this.dom.throttleVal) {
        this.dom.throttleVal.textContent = `${Math.round(physics.throttle * 100)}%`;
      }
    }

    if (this.dom.mobileSteering) {
      const showTouchPad = this.isMobile || !physics.autoMission;
      this.dom.mobileSteering.style.display = showTouchPad ? 'flex' : 'none';
    }

    // 6. Highlight BOOSTER camera tab while Super Heavy is returning to tower
    if (this.dom.trackBoosterBtn) {
      const isSeparated = physics.boosterState && physics.boosterState !== 'ATTACHED' && physics.boosterState !== 'CAUGHT';
      this.dom.trackBoosterBtn.classList.toggle('pulse-highlight', Boolean(isSeparated && this.currentCamMode !== 'BOOSTER_CAM'));
    }

    // 7. SpaceX Timeline Milestones
    if (this.dom.timeline) {
      const phaseOrder = {
        [FLIGHT_PHASES.ON_PAD]: 0,
        [FLIGHT_PHASES.COUNTDOWN]: 0,
        [FLIGHT_PHASES.BOOSTER_ASCENT]: physics.altitude > 10000 ? 2 : 1,
        [FLIGHT_PHASES.HOT_STAGING]: 3,
        [FLIGHT_PHASES.STARSHIP_ASCENT]: physics.boosterState === 'CAUGHT' ? 4 : 3,
        [FLIGHT_PHASES.ORBIT]: 5,
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

    // 8. Orbital Score Card
    if (this.dom.scoreCard) {
      if (physics.phase === FLIGHT_PHASES.ORBIT) {
        this.dom.scoreCard.style.display = 'block';
        if (this.dom.scoreVal) this.dom.scoreVal.textContent = (physics.starshipScore || 15420).toLocaleString();
        if (this.dom.scoreApogee) this.dom.scoreApogee.textContent = `${sAltKm} km`;
        if (this.dom.scoreVelocity) this.dom.scoreVelocity.textContent = `${Math.round(physics.speed)} m/s`;
        if (this.dom.scoreBooster) {
          this.dom.scoreBooster.textContent = physics.boosterState === 'CAUGHT' ? 'TOWER CAUGHT' : physics.boosterState;
        }
      } else {
        this.dom.scoreCard.style.display = 'none';
      }
    }

    // 9. Phase Badge, Primary Launch/Stage Button & Prompt
    if (this.dom.phaseBadge) {
      const titles = {
        [FLIGHT_PHASES.ON_PAD]: 'STARBASE // PAD AWAITING LAUNCH',
        [FLIGHT_PHASES.COUNTDOWN]: 'T-MINUS // 33 RAPTOR IGNITION',
        [FLIGHT_PHASES.BOOSTER_ASCENT]: 'STAGE 1 // SUPER HEAVY ASCENT',
        [FLIGHT_PHASES.HOT_STAGING]: 'HOT-STAGING // STAGE SEPARATION',
        [FLIGHT_PHASES.STARSHIP_ASCENT]: trajMode === 'SUBORBITAL'
          ? 'STAGE 2 // SUBORBITAL ASCENT'
          : 'STAGE 2 // ORBITAL INSERTION',
        [FLIGHT_PHASES.ORBIT]: 'SECO // LOW MARS ORBIT COAST',
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
        this.dom.stageBtn.textContent = 'LAUNCH';
        this.dom.stageBtn.className = 'flight-stage-btn launch-ready';
      } else if (physics.phase === FLIGHT_PHASES.LANDED) {
        this.dom.stageBtn.style.display = 'inline-flex';
        this.dom.stageBtn.textContent = 'DEPLOY ROVER';
        this.dom.stageBtn.className = 'flight-stage-btn landed-ready';
      } else if (!physics.autoMission) {
        // In Manual Mode: give user explicit stage/maneuver buttons at each phase
        if (physics.phase === FLIGHT_PHASES.BOOSTER_ASCENT || physics.phase === FLIGHT_PHASES.HOT_STAGING) {
          this.dom.stageBtn.style.display = 'inline-flex';
          this.dom.stageBtn.textContent = 'HOT STAGE';
          this.dom.stageBtn.className = 'flight-stage-btn manual-stage';
        } else if (physics.phase === FLIGHT_PHASES.STARSHIP_ASCENT || physics.phase === FLIGHT_PHASES.ORBIT) {
          this.dom.stageBtn.style.display = 'inline-flex';
          this.dom.stageBtn.textContent = 'DEORBIT BURN';
          this.dom.stageBtn.className = 'flight-stage-btn manual-stage';
        } else if (physics.phase === FLIGHT_PHASES.HYPERSONIC_ENTRY || physics.phase === FLIGHT_PHASES.BELLYFLOP) {
          this.dom.stageBtn.style.display = 'inline-flex';
          this.dom.stageBtn.textContent = 'LANDING FLIP';
          this.dom.stageBtn.className = 'flight-stage-btn manual-stage';
        } else {
          this.dom.stageBtn.style.display = 'none';
        }
      } else {
        // In Auto Mode after Launch: hide the stage button so the broadcast bar stays clean while autopilot executes all stages
        this.dom.stageBtn.style.display = 'none';
      }
    }

    if (this.dom.actionPrompt) {
      let promptHtml = '';
      if (physics.phase === FLIGHT_PHASES.ON_PAD) {
        promptHtml = `<span class="glow-text">PRESS [SPACE] OR CLICK LAUNCH TO INITIATE ${physics.autoMission ? 'AUTONOMOUS' : 'MANUAL'} FLIGHT</span>`;
      } else if (physics.phase === FLIGHT_PHASES.STARSHIP_ASCENT && (physics.boosterState === 'BOOSTBACK' || physics.boosterState === 'DESCENT' || physics.boosterState === 'APPROACH')) {
        if (this.currentCamMode !== 'BOOSTER_CAM') {
          promptHtml = `<span class="glow-text">SUPER HEAVY RETURNING TO STARBASE // SELECT 'BOOSTER' CAM TO VIEW TOWER CATCH</span>`;
        } else {
          promptHtml = `<span class="glow-text">TRACKING SUPER HEAVY RETURN TO MECHAZILLA CHOPSTICKS</span>`;
        }
      } else if (physics.phase === FLIGHT_PHASES.LANDED) {
        promptHtml = `<span class="glow-text">${physics.shipCaughtByTower ? 'STARSHIP SECURED IN MECHAZILLA ARMS' : 'STARSHIP LANDED ON MARS'} // CLICK DEPLOY ROVER OR PAD TO RE-LAUNCH</span>`;
      }
      if (this._lastPromptHtml !== promptHtml) {
        this._lastPromptHtml = promptHtml;
        this.dom.actionPrompt.innerHTML = promptHtml;
      }
    }
  }
}

