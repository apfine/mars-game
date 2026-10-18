import * as THREE from 'three';
import { MarsMap } from './map.js';
import { getPresenceClient } from '../utils/presenceClient.js';

// HUD Telemetry, drune.io-style Waypoint Badges, Mobile Touch Controls & Settings Modal
export class MarsHUD {
  constructor(inputManager, options = {}) {
    this.inputManager = inputManager;
    this.options = options;
    this.userBeacons = [];
    this.beaconIdCounter = 1;
    this.startTime = performance.now();

    this.dom = {
      container: document.getElementById('hud-layer'),
      speedometer: document.getElementById('speed-val'),
      speedBar: document.getElementById('speed-bar'),
      speedMsVal: document.getElementById('speed-ms-val'),
      nitroBar: document.getElementById('nitro-fill'),
      nitroText: document.getElementById('nitro-pct'),
      badgeContainer: document.getElementById('waypoint-badges'),
      mobileControls: document.getElementById('mobile-controls'),
      settingsModal: document.getElementById('settings-modal'),
      escBtn: document.getElementById('esc-btn'),
      closeSettingsBtn: document.getElementById('close-settings'),
      roverOnlineVal: document.getElementById('online-count-val') || document.getElementById('online-players-count'),

      // Scientific Clocks & Sensors
      solClock: document.getElementById('sol-clock'),
      metClock: document.getElementById('met-clock'),
      coordsVal: document.getElementById('sci-coords-val'),
      elevVal: document.getElementById('sci-elev-val'),
      pressVal: document.getElementById('sci-press-val'),
      tempVal: document.getElementById('sci-temp-val'),
      radVal: document.getElementById('sci-rad-val'),

      // Vehicle Diagnostics
      gyroVal: document.getElementById('rover-gyro-val'),
      headingVal: document.getElementById('rover-heading-val'),
      odomVal: document.getElementById('rover-odom-val')
    };

    this.onlineCount = 43;
    this.lastOnlineUpdate = 0;

    this.touchState = {
      throttle: 0,
      steer: 0,
      handbrake: false,
      nitro: false,
      assist: false
    };
    this.inputManager.touchState = this.touchState;

    this.initMobileTouch();
    this.initSettingsModal();
    this.initPredefinedWaypoints();
    this.map = new MarsMap(this);
    this.frameCount = 0;
  }

  initPredefinedWaypoints() {
    this.predefinedPOIs = [];
  }

  initMobileTouch() {
    // Only show mobile touch controls if mobile is detected or touch is triggered
    const isMobile = this.inputManager.isMobile;
    if (this.dom.mobileControls) {
      if (isMobile) {
        this.dom.mobileControls.style.display = 'block';
      }
    }

    // Touch button handlers helper
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

      // Support mouse click for PC testing
      el.addEventListener('mousedown', handleStart);
      window.addEventListener('mouseup', () => {
        if (el.classList.contains('active')) {
          el.classList.remove('active');
          onUp();
        }
      });
    };

    // Steering buttons
    setupTouchBtn('btn-left',
      () => { this.touchState.steer = -1; },
      () => { if (this.touchState.steer === -1) this.touchState.steer = 0; }
    );
    setupTouchBtn('btn-right',
      () => { this.touchState.steer = 1; },
      () => { if (this.touchState.steer === 1) this.touchState.steer = 0; }
    );

    // Throttle & Brake
    setupTouchBtn('btn-gas',
      () => { this.touchState.throttle = 1; },
      () => { if (this.touchState.throttle === 1) this.touchState.throttle = 0; }
    );
    setupTouchBtn('btn-brake',
      () => { this.touchState.throttle = -1; },
      () => { if (this.touchState.throttle === -1) this.touchState.throttle = 0; }
    );

    // Action buttons
    setupTouchBtn('btn-nitro',
      () => { this.touchState.nitro = true; },
      () => { this.touchState.nitro = false; }
    );
    setupTouchBtn('btn-handbrake',
      () => { this.touchState.handbrake = true; },
      () => { this.touchState.handbrake = false; }
    );
    setupTouchBtn('btn-assist',
      () => { this.touchState.assist = true; },
      () => { this.touchState.assist = false; }
    );

    // Camera and Marker touch triggers
    const camBtn = document.getElementById('btn-cam');
    if (camBtn) {
      camBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.inputManager.state.cameraToggle = true;
      });
    }

    const markBtn = document.getElementById('btn-mark');
    if (markBtn) {
      markBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.inputManager.state.markBeacon = true;
      });
    }
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

    // Grid toggle
    const gridCheckbox = document.getElementById('toggle-grid');
    if (gridCheckbox) {
      gridCheckbox.addEventListener('change', (e) => {
        if (this.options.onToggleGrid) {
          this.options.onToggleGrid(e.target.checked);
        }
      });
    }

    // Audio toggle
    const audioCheckbox = document.getElementById('toggle-audio');
    if (audioCheckbox) {
      audioCheckbox.addEventListener('change', (e) => {
        if (this.options.onToggleAudio) {
          this.options.onToggleAudio(e.target.checked);
        }
      });
    }

    // Quality selector
    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect) {
      qualitySelect.addEventListener('change', (e) => {
        if (this.options.onChangeQuality) {
          this.options.onChangeQuality(e.target.value);
        }
      });
    }

    // Reset Rover button
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

  addBeacon(pos, name = null) {
    const beaconName = name || `Marker #${this.beaconIdCounter++}`;
    this.userBeacons.push({
      id: 'b_' + Date.now() + '_' + Math.random(),
      name: beaconName,
      position: pos.clone(),
      isMystery: false
    });
  }

  update(physics, camera, scatterPOIs = []) {
    // 0. Update Online Explorer Count via Real Presence Client
    const presence = getPresenceClient();
    if (presence) {
      this.onlineCount = presence.onlineCount;
      if (this.dom.roverOnlineVal) this.dom.roverOnlineVal.textContent = presence.onlineCount;
    }

    // 0.1 Clocks: LMST Martian Solar Time & MET Mission Elapsed Time
    const elapsedSec = (performance.now() - this.startTime) / 1000;
    if (this.dom.metClock) {
      const metH = Math.floor(elapsedSec / 3600).toString().padStart(2, '0');
      const metM = Math.floor((elapsedSec % 3600) / 60).toString().padStart(2, '0');
      const metS = Math.floor(elapsedSec % 60).toString().padStart(2, '0');
      const metTenths = Math.floor((elapsedSec * 10) % 10);
      this.dom.metClock.textContent = `MET +${metH}:${metM}:${metS}.${metTenths}`;
    }

    if (this.dom.solClock) {
      const earthSec = Date.now() / 1000;
      // Mars sol is 88775.244 seconds (1.02749125 Earth seconds per Mars second)
      const lmstSec = Math.floor((earthSec * 1.02749125) % 86400);
      const solH = Math.floor(lmstSec / 3600).toString().padStart(2, '0');
      const solM = Math.floor((lmstSec % 3600) / 60).toString().padStart(2, '0');
      const solS = Math.floor(lmstSec % 60).toString().padStart(2, '0');
      this.dom.solClock.textContent = `SOL 492 · LMST ${solH}:${solM}:${solS}`;
    }

    // 0.2 Planetary Environmental Sensors
    if (physics.position) {
      const posX = physics.position.x;
      const posY = physics.position.y;
      const posZ = physics.position.z;

      // Martian Coordinates centered at Jezero Crater / Starbase (18.38°N, 226.02°W)
      // 1 deg ~ 59.3 km = 59,300 m
      const lat = 18.38 + (posZ / 59300);
      const lon = 226.02 - (posX / 59300);
      if (this.dom.coordsVal) {
        const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(lon).toFixed(2)}°W`;
        this.dom.coordsVal.textContent = `${latStr} ${lonStr}`;
      }

      // Elevation MOLA (datum offset approx -1420m)
      const molaElev = Math.round(-1420 + posY);
      if (this.dom.elevVal) {
        this.dom.elevVal.textContent = `${molaElev >= 0 ? '+' : ''}${molaElev.toLocaleString()} m`;
      }

      // Barometric formula on Mars: P0 = 0.636 kPa, scale height H ~ 11.1 km
      const pressKPa = 0.636 * Math.exp(-posY / 11100);
      if (this.dom.pressVal) {
        this.dom.pressVal.textContent = `${pressKPa.toFixed(3)} kPa`;
      }

      // Martian Surface Temperature: ~ -62.4°C base with slight lapse rate
      const tempC = -62.4 - (posY * 0.0025);
      if (this.dom.tempVal) {
        this.dom.tempVal.textContent = `${tempC.toFixed(1)}°C`;
      }

      // Cosmic Radiation Flux ~ 0.24 mSv/d
      if (this.dom.radVal) {
        this.dom.radVal.textContent = `0.24 mSv/d`;
      }
    }

    // 0.3 Vehicle Diagnostics
    const pitchDeg = Math.round(((physics.pitch || 0) * 180) / Math.PI);
    const rollDeg = Math.round(((physics.roll || 0) * 180) / Math.PI);
    if (this.dom.gyroVal) {
      const pSign = pitchDeg >= 0 ? '+' : '';
      const rSign = rollDeg >= 0 ? '+' : '';
      this.dom.gyroVal.textContent = `PITCH ${pSign}${pitchDeg}° · ROLL ${rSign}${rollDeg}°`;
    }

    let yawDeg = Math.round((((physics.yaw || 0) * 180) / Math.PI) % 360);
    if (yawDeg < 0) yawDeg += 360;
    const compassDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const compassIdx = Math.round(yawDeg / 45) % 8;
    const compassDir = compassDirections[compassIdx];
    if (this.dom.headingVal) {
      this.dom.headingVal.textContent = `${yawDeg.toString().padStart(3, '0')}° ${compassDir}`;
    }

    const odomMeters = Math.round(physics.distanceTraveled || 0);
    if (this.dom.odomVal) {
      if (odomMeters >= 1000) {
        this.dom.odomVal.textContent = `${(odomMeters / 1000).toFixed(2)} km`;
      } else {
        this.dom.odomVal.textContent = `${odomMeters} m`;
      }
    }

    if (this.dom.speedMsVal) {
      const speedMs = (physics.speed || 0).toFixed(1);
      this.dom.speedMsVal.textContent = `${speedMs} m/s`;
    }

    // 1. Update Speedometer
    const speed = physics.speedKmh;
    if (this.dom.speedometer) {
      this.dom.speedometer.textContent = `${speed}`;
    }
    if (this.dom.speedBar) {
      const pct = Math.min(100, (speed / 160) * 100);
      this.dom.speedBar.style.width = `${pct}%`;
    }

    // 2. Update Nitro bar
    if (this.dom.nitroBar) {
      const nitroPct = Math.round((physics.nitro / physics.nitroCapacity) * 100);
      this.dom.nitroBar.style.width = `${nitroPct}%`;
      if (this.dom.nitroText) {
        this.dom.nitroText.textContent = `${nitroPct}%`;
      }
      if (physics.isNitroActive) {
        this.dom.nitroBar.classList.add('active');
      } else {
        this.dom.nitroBar.classList.remove('active');
      }
    }

    // 3. Update 3D projected waypoint badges (drune.io style!)
    // Badge DOM rewrites are throttled (innerHTML every frame causes layout churn on phones)
    this.frameCount++;
    if (this.frameCount % 3 === 0) this.updateWaypointBadges(physics.position, camera, scatterPOIs);

    // 4. Minimap / full map
    this.map.update(physics, scatterPOIs);
  }

  updateWaypointBadges(playerPos, camera, scatterPOIs) {
    if (!this.dom.badgeContainer) return;

    // Combine user beacons, predefined mysteries, and local scatter POIs
    const allWaypoints = [
      ...this.userBeacons,
      ...this.predefinedPOIs,
      ...scatterPOIs.map(p => ({ name: p.name, position: p.position, isMystery: false }))
    ];

    // Limit active visible badges to 6 nearest
    const sorted = allWaypoints
      .map(wp => {
        const d = playerPos.distanceTo(wp.position);
        return { ...wp, dist: d };
      })
      .filter(wp => wp.dist > 15) // don't crowd when directly on top
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);

    // Reuse or create badge elements
    let html = '';
    const tempVec = new THREE.Vector3();
    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;

    for (const wp of sorted) {
      tempVec.copy(wp.position);
      // Project into NDC
      tempVec.project(camera);

      // Check if in front of camera
      const isBehind = tempVec.z > 1.0;
      if (isBehind) continue;

      const screenX = (tempVec.x * halfW) + halfW;
      const screenY = -(tempVec.y * halfH) + halfH;

      // Ignore if outside screen boundaries
      if (screenX < 20 || screenX > window.innerWidth - 20 ||
          screenY < 20 || screenY > window.innerHeight - 60) {
        continue;
      }

      let distLabel = '';
      if (wp.dist < 1000) {
        distLabel = `${Math.round(wp.dist)} m`;
      } else {
        distLabel = `${(wp.dist / 1000).toFixed(1)} km`;
      }
      const label = `📍 ${wp.name} · ${distLabel}`;

      html += `<div class="waypoint-badge" style="transform: translate(${screenX}px, ${screenY}px);">${label}</div>`;
    }

    this.dom.badgeContainer.innerHTML = html;
  }
}
