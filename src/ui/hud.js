import * as THREE from 'three';
import { MarsMap } from './map.js';

// Unified SpaceX Glassmorphic HUD for Mars Rover & First-Person Walking Mode
export class MarsHUD {
  constructor(inputManager, options = {}) {
    this.inputManager = inputManager;
    this.options = options;
    this.userBeacons = [];
    this.beaconIdCounter = 1;
    this.startTime = performance.now();

    this.dom = {
      container: document.getElementById('hud-layer'),
      modeBadge: document.getElementById('rover-mode-badge'),
      camBar: document.getElementById('rover-cam-bar'),
      walkBtn: document.getElementById('rover-walk-btn'),
      primaryActionBtn: document.getElementById('rover-primary-action-btn'),
      physicalLaunchBtn: document.getElementById('pad-physical-launch-btn'),
      padPrompt: document.getElementById('pad-launch-prompt'),
      walkReticle: document.getElementById('walk-reticle'),
      leftTitle: document.getElementById('rover-left-title'),
      starbaseDistVal: document.getElementById('starbase-dist-val'),

      speedometer: document.getElementById('speed-val'),
      speedBar: document.getElementById('speed-bar'),
      speedMsVal: document.getElementById('speed-ms-val'),
      nitroBar: document.getElementById('nitro-fill'),
      badgeContainer: document.getElementById('waypoint-badges'),
      mobileControls: document.getElementById('mobile-controls'),
      settingsModal: document.getElementById('settings-modal'),
      escBtn: document.getElementById('esc-btn'),
      closeSettingsBtn: document.getElementById('close-settings'),

      metClock: document.getElementById('met-clock'),
      elevVal: document.getElementById('sci-elev-val'),
      gyroVal: document.getElementById('rover-gyro-val'),
      headingVal: document.getElementById('rover-heading-val'),
      odomVal: document.getElementById('rover-odom-val')
    };

    this.touchState = {
      throttle: 0,
      steer: 0,
      handbrake: false,
      nitro: false,
      assist: false
    };
    this.inputManager.touchState = this.touchState;

    this.initMobileTouch();
    this.initControlsAndGimbal();
    this.initSettingsModal();
    this.map = new MarsMap(this);
    this.frameCount = 0;
  }

  initControlsAndGimbal() {
    // Rover Camera Switcher Tabs (CHASE / COCKPIT / ORBIT)
    if (this.dom.camBar) {
      const tabs = this.dom.camBar.querySelectorAll('.cam-tab-btn, .dropdown-item');
      tabs.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const modeIdx = parseInt(btn.getAttribute('data-rcam'), 10);
          if (!Number.isNaN(modeIdx) && this.options.onSelectRoverCamera) {
            this.options.onSelectRoverCamera(modeIdx);
            tabs.forEach((t) => t.classList.toggle('active', t === btn));
            const lbl = document.getElementById('rover-cam-current');
            if (lbl) {
              const names = ['CHASE', 'COCKPIT', 'ORBIT'];
              lbl.textContent = names[modeIdx] || 'CHASE';
            }
            const menu = document.getElementById('rover-cam-menu');
            if (menu) menu.classList.remove('open');
          }
        });
      });
    }

    // Walk / Board Rover Toggle Buttons
    const handleWalkToggle = (e) => {
      e.preventDefault();
      if (this.options.onToggleWalk) {
        this.options.onToggleWalk();
      }
    };
    if (this.dom.walkBtn) this.dom.walkBtn.addEventListener('click', handleWalkToggle);
    if (this.dom.primaryActionBtn) this.dom.primaryActionBtn.addEventListener('click', handleWalkToggle);

    const mobileWalkBtn = document.getElementById('btn-walk-mobile');
    if (mobileWalkBtn) mobileWalkBtn.addEventListener('click', handleWalkToggle);

    const mobileLaunchBtn = document.getElementById('btn-launch-mobile');
    if (mobileLaunchBtn) {
      mobileLaunchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onPressPhysicalLaunch) {
          this.options.onPressPhysicalLaunch();
        }
      });
    }

    // Physical Launch Button Trigger (Available when walking right up to the Launch Pedestal)
    if (this.dom.physicalLaunchBtn) {
      this.dom.physicalLaunchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onPressPhysicalLaunch) {
          this.options.onPressPhysicalLaunch();
        }
      });
    }

    // 360° Gimbal Pad Buttons for Rover & Walking Cameras
    const bindGimbalHold = (id, dyaw, dpitch) => {
      const el = document.getElementById(id);
      if (!el) return;
      let interval = null;
      const step = () => {
        if (this.options.onGimbalPan) this.options.onGimbalPan(dyaw, dpitch);
      };
      const start = (e) => {
        e.preventDefault();
        step();
        if (interval) clearInterval(interval);
        interval = setInterval(step, 30);
      };
      const stop = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };
      el.addEventListener('mousedown', start);
      el.addEventListener('touchstart', start, { passive: false });
      window.addEventListener('mouseup', stop);
      window.addEventListener('touchend', stop);
    };

    bindGimbalHold('rover-gimbal-left', 0.06, 0);
    bindGimbalHold('rover-gimbal-right', -0.06, 0);
    bindGimbalHold('rover-gimbal-up', 0, 0.05);
    bindGimbalHold('rover-gimbal-down', 0, -0.05);

    const resetGimbalBtn = document.getElementById('rover-gimbal-reset');
    if (resetGimbalBtn) {
      resetGimbalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.options.onGimbalReset) this.options.onGimbalReset();
      });
    }
  }

  initMobileTouch() {
    const isMobile = this.inputManager.isMobile;
    if (this.dom.mobileControls && isMobile) {
      this.dom.mobileControls.style.display = 'block';
    }

    const setupTouchBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;

      const handleStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('active');
        onDown();
      };
      const handleEnd = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('active');
        onUp();
      };

      el.addEventListener('touchstart', handleStart, { passive: false });
      el.addEventListener('touchend', handleEnd, { passive: false });
      el.addEventListener('touchcancel', handleEnd, { passive: false });
      el.addEventListener('mousedown', handleStart);
      window.addEventListener('mouseup', () => {
        if (el.classList.contains('active')) {
          el.classList.remove('active');
          onUp();
        }
      });
    };

    setupTouchBtn('btn-left',
      () => { this.touchState.steer = -1; },
      () => { if (this.touchState.steer === -1) this.touchState.steer = 0; }
    );
    setupTouchBtn('btn-right',
      () => { this.touchState.steer = 1; },
      () => { if (this.touchState.steer === 1) this.touchState.steer = 0; }
    );
    setupTouchBtn('btn-gas',
      () => { this.touchState.throttle = 1; },
      () => { if (this.touchState.throttle === 1) this.touchState.throttle = 0; }
    );
    setupTouchBtn('btn-brake',
      () => { this.touchState.throttle = -1; },
      () => { if (this.touchState.throttle === -1) this.touchState.throttle = 0; }
    );
    setupTouchBtn('btn-nitro',
      () => { this.touchState.nitro = true; },
      () => { this.touchState.nitro = false; }
    );
    setupTouchBtn('btn-handbrake',
      () => { this.touchState.handbrake = true; },
      () => { this.touchState.handbrake = false; }
    );
  }

  initSettingsModal() {
    if (this.dom.escBtn) {
      this.dom.escBtn.addEventListener('click', () => {
        this.toggleSettings();
      });
    }
    if (this.dom.closeSettingsBtn) {
      this.dom.closeSettingsBtn.addEventListener('click', () => {
        this.toggleSettings(false);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.toggleSettings();
      }
    });

    const gridCheckbox = document.getElementById('toggle-grid');
    if (gridCheckbox) {
      gridCheckbox.addEventListener('change', (e) => {
        if (this.options.onToggleGrid) {
          this.options.onToggleGrid(e.target.checked);
        }
      });
    }

    const audioCheckbox = document.getElementById('toggle-audio');
    if (audioCheckbox) {
      audioCheckbox.addEventListener('change', (e) => {
        if (this.options.onToggleAudio) {
          this.options.onToggleAudio(e.target.checked);
        }
      });
    }

    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect) {
      qualitySelect.addEventListener('change', (e) => {
        if (this.options.onChangeQuality) {
          this.options.onChangeQuality(e.target.value);
        }
      });
    }

    const resetBtn = document.getElementById('btn-reset-pos');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.options.onResetRover) {
          this.options.onResetRover();
        }
        this.toggleSettings(false);
      });
    }
  }

  toggleSettings(force) {
    if (!this.dom.settingsModal) return;
    const isVisible = this.dom.settingsModal.classList.contains('active');
    const target = force !== undefined ? force : !isVisible;
    if (target) {
      this.dom.settingsModal.classList.add('active');
    } else {
      this.dom.settingsModal.classList.remove('active');
    }
  }

  syncCameraTab(modeIdx) {
    if (!this.dom.camBar) return;
    const tabs = this.dom.camBar.querySelectorAll('.cam-tab-btn, .dropdown-item');
    tabs.forEach((t) => {
      t.classList.toggle('active', parseInt(t.getAttribute('data-rcam'), 10) === modeIdx);
    });
    const lbl = document.getElementById('rover-cam-current');
    if (lbl) {
      const names = ['CHASE', 'COCKPIT', 'ORBIT'];
      lbl.textContent = names[modeIdx] || 'CHASE';
    }
  }

  update(activeActor, camera, scatterPOIs = [], context = {}) {
    this.frameCount++;
    const isWalking = Boolean(context.isWalking);
    const terminalPos = context.terminalPos;
    const roverPos = context.roverPos;

    // 1. Mode-Specific UI State (Rover vs Third-Person EVA)
    if (this._lastWalkingState !== isWalking) {
      this._lastWalkingState = isWalking;
      if (this.dom.modeBadge) {
        this.dom.modeBadge.textContent = isWalking
          ? 'EVA WALK // THIRD-PERSON SUIT CAM'
          : 'ROVER // STARBASE APPROACH';
      }
      if (this.dom.leftTitle) {
        this.dom.leftTitle.textContent = isWalking ? 'EVA SUIT' : 'MARS ROVER';
      }
      if (this.dom.walkBtn) {
        this.dom.walkBtn.textContent = isWalking ? 'ROVER [E]' : 'WALK [E]';
        this.dom.walkBtn.classList.toggle('active', isWalking);
      }
      if (this.dom.primaryActionBtn) {
        this.dom.primaryActionBtn.textContent = isWalking ? 'BOARD ROVER [E]' : 'EXIT ROVER [E]';
      }
      if (this.dom.walkReticle) {
        // Third-person camera: the reticle is not needed and obscures the suit.
        this.dom.walkReticle.style.display = 'none';
      }
      if (this.dom.camBar) {
        this.dom.camBar.style.display = isWalking ? 'none' : 'flex';
      }
    }

    // 2. Speedometer, Velocity & Proper G-Force
    const speedKmh = Math.abs(Math.round((activeActor.speed || 0) * 3.6));
    if (this.dom.speedometer && this._lastSpeed !== speedKmh) {
      this._lastSpeed = speedKmh;
      this.dom.speedometer.textContent = `${speedKmh}`;
    }
    if (this.dom.speedBar) {
      const maxRef = isWalking ? 25 : 160;
      const pct = Math.min(100, (speedKmh / maxRef) * 100);
      this.dom.speedBar.style.width = `${pct}%`;
    }
    if (this.dom.nitroBar) {
      const nitroPct = isWalking
        ? 100
        : Math.round(((activeActor.nitro || 0) / (activeActor.nitroCapacity || 100)) * 100);
      if (this._lastNitro !== nitroPct) {
        this._lastNitro = nitroPct;
        this.dom.nitroBar.style.width = `${nitroPct}%`;
      }
    }

    // 3. Proximity to Physical Launch Control Pedestal & Rover
    if (terminalPos && activeActor.position) {
      const dxTerm = terminalPos.x - activeActor.position.x;
      const dzTerm = terminalPos.z - activeActor.position.z;
      const distToTerminal = Math.hypot(dxTerm, dzTerm);

      const bearingRad = Math.atan2(dxTerm, dzTerm);
      let bearingDeg = Math.round(((bearingRad * 180) / Math.PI + 360) % 360);
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dirStr = dirs[Math.round(bearingDeg / 45) % 8];

      if (this.dom.starbaseDistVal && this.frameCount % 4 === 0) {
        this.dom.starbaseDistVal.textContent = `LAUNCH PEDESTAL: ${Math.round(distToTerminal)}m ${dirStr}`;
      }

      const canPressButton = isWalking && distToTerminal <= 8.5;
      if (this.dom.physicalLaunchBtn) {
        this.dom.physicalLaunchBtn.style.display = canPressButton ? 'inline-flex' : 'none';
      }
      const mobileLaunchBtn = document.getElementById('btn-launch-mobile');
      if (mobileLaunchBtn) {
        mobileLaunchBtn.style.display = canPressButton ? 'inline-flex' : 'none';
      }

      if (this.dom.padPrompt) {
        if (canPressButton) {
          this.dom.padPrompt.style.display = 'block';
          this.dom.padPrompt.textContent = 'LAUNCH PEDESTAL ARMED // CLICK RED PHYSICAL BUTTON ON CONSOLE OR PRESS [F] TO LAUNCH';
        } else if (isWalking && distToTerminal <= 45.0) {
          this.dom.padPrompt.style.display = 'block';
          this.dom.padPrompt.textContent = `WALK TO RED LAUNCH CONTROL PEDESTAL (${Math.round(distToTerminal)}m AHEAD) & CLICK BUTTON`;
        } else if (!isWalking && distToTerminal <= 65.0) {
          this.dom.padPrompt.style.display = 'block';
          this.dom.padPrompt.textContent = `STARBASE LAUNCH PAD REACHED (${Math.round(distToTerminal)}m) // PRESS [E] TO EXIT ROVER & WALK TO LAUNCH BUTTON`;
        } else {
          this.dom.padPrompt.style.display = 'none';
        }
      }
    }

    // 4. Secondary Telemetry & Inertial Readouts
    if (this.frameCount % 5 === 0) {
      const elapsedSec = (performance.now() - this.startTime) / 1000;
      if (this.dom.metClock) {
        const metH = Math.floor(elapsedSec / 3600).toString().padStart(2, '0');
        const metM = Math.floor((elapsedSec % 3600) / 60).toString().padStart(2, '0');
        const metS = Math.floor(elapsedSec % 60).toString().padStart(2, '0');
        this.dom.metClock.textContent = `T+ ${metH}:${metM}:${metS}`;
      }

      if (activeActor.position && this.dom.elevVal) {
        const elev = Math.round(activeActor.position.y);
        this.dom.elevVal.textContent = `${elev}`;
      }

      const pitchDeg = Math.round(((activeActor.pitch || 0) * 180) / Math.PI);
      const rollDeg = Math.round(((activeActor.roll || 0) * 180) / Math.PI);
      if (this.dom.gyroVal) {
        const pSign = pitchDeg >= 0 ? '+' : '';
        const rSign = rollDeg >= 0 ? '+' : '';
        this.dom.gyroVal.textContent = `PITCH ${pSign}${pitchDeg}° · ROLL ${rSign}${rollDeg}°`;
      }

      let yawDeg = Math.round((((activeActor.yaw || 0) * 180) / Math.PI) % 360);
      if (yawDeg < 0) yawDeg += 360;
      const compassDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const compassIdx = Math.round(yawDeg / 45) % 8;
      if (this.dom.headingVal) {
        this.dom.headingVal.textContent = `${yawDeg.toString().padStart(3, '0')}° ${compassDirections[compassIdx]}`;
      }

      const odomMeters = Math.round(activeActor.distanceTraveled || 0);
      if (this.dom.odomVal) {
        this.dom.odomVal.textContent = `${odomMeters}`;
      }

      if (this.dom.speedMsVal) {
        const ms = Math.abs(activeActor.speed || 0).toFixed(1);
        const gVal = activeActor.gForce || '0.38';
        this.dom.speedMsVal.textContent = `${ms} M/S · ${gVal}G`;
      }
    }

    // 5. Update 3D Projected Waypoint Badges (Always includes Launch Control Pedestal!)
    if (this.frameCount % 3 === 0) {
      this.updateWaypointBadges(activeActor.position, camera, scatterPOIs, terminalPos, isWalking ? roverPos : null);
    }

    // 6. Minimap / Full Map
    this.map.update(activeActor, scatterPOIs);
  }

  updateWaypointBadges(playerPos, camera, scatterPOIs, terminalPos, roverPos) {
    if (!this.dom.badgeContainer || !playerPos) return;

    if (!this._badgePool) {
      this._badgePool = [];
      this._tempVec = new THREE.Vector3();
      this.dom.badgeContainer.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        const el = document.createElement('div');
        el.className = 'waypoint-badge';
        el.style.display = 'none';
        this.dom.badgeContainer.appendChild(el);
        this._badgePool.push(el);
      }
    }

    const candidates = [];
    if (terminalPos) {
      const dTerm = playerPos.distanceTo(terminalPos);
      if (dTerm > 2.2) {
        candidates.push({
          name: 'LAUNCH PEDESTAL (PAD 1)',
          position: new THREE.Vector3(terminalPos.x, terminalPos.y + 3.8, terminalPos.z),
          dist: dTerm,
          priority: true
        });
      }
    }
    if (roverPos) {
      const dRover = playerPos.distanceTo(roverPos);
      if (dRover > 3.5) {
        candidates.push({
          name: 'MARS ROVER [E]',
          position: new THREE.Vector3(roverPos.x, roverPos.y + 2.2, roverPos.z),
          dist: dRover,
          priority: true
        });
      }
    }

    for (let i = 0; i < scatterPOIs.length; i++) {
      const p = scatterPOIs[i];
      const d = playerPos.distanceTo(p.position);
      if (d > 20) candidates.push({ name: p.name, position: p.position, dist: d, priority: false });
    }

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.dist - b.dist;
    });

    const tempVec = this._tempVec;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const halfW = w * 0.5;
    const halfH = h * 0.5;

    let activeIdx = 0;
    const limit = Math.min(6, candidates.length);
    for (let i = 0; i < limit; i++) {
      const wp = candidates[i];
      tempVec.copy(wp.position).project(camera);
      if (tempVec.z > 1.0) continue;

      const screenX = (tempVec.x * halfW) + halfW;
      const screenY = -(tempVec.y * halfH) + halfH;
      if (screenX < 20 || screenX > w - 20 || screenY < 20 || screenY > h - 60) continue;

      const distLabel = wp.dist < 1000 ? `${Math.round(wp.dist)}m` : `${(wp.dist / 1000).toFixed(1)}km`;
      const el = this._badgePool[activeIdx++];
      el.style.display = 'block';
      el.style.transform = `translate3d(${screenX | 0}px, ${screenY | 0}px, 0)`;
      const text = `${wp.name} · ${distLabel}`;
      if (el._lastText !== text) {
        el._lastText = text;
        el.textContent = text;
      }
    }

    for (let i = activeIdx; i < 6; i++) {
      this._badgePool[i].style.display = 'none';
    }
  }
}
