// Dual Input Manager: Keyboard, Gamepad, and Mobile Touch
export class InputManager {
  constructor() {
    this.state = {
      throttle: 0,   // -1 to 1
      steer: 0,      // -1 to 1
      pitch: 0,      // -1 to 1 (flight)
      roll: 0,       // -1 to 1 (flight)
      throttleUp: false,
      throttleDown: false,
      fullThrottle: false,
      throttleCut: false,
      brake: false,
      handbrake: false,
      nitro: false,
      assist: false,
      cameraToggle: false,
      markBeacon: false,
      toggleLights: false,
      walkToggle: false,
      interactAction: false,
      legsToggle: false,
      cargoToggle: false
    };

    this.keys = {};
    this.touchActive = false;
    this.isMobile = this.detectMobile();

    // Persistent virtual axes. The update loop resets keyboard/gamepad
    // continuous axes every frame, so pointer holds must live in a separate
    // state that survives until the finger/button is released.
    this.touchState = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      roll: 0,
      throttleUp: false,
      throttleDown: false,
      fullThrottle: false,
      throttleCut: false,
      handbrake: false,
      nitro: false,
      assist: false
    };

    this.initKeyboard();
    this.initGamepad();
  }

  setTouchFlightInput(patch = {}) {
    Object.assign(this.touchState, patch);
  }

  clearTouchFlightInput() {
    this.touchState.throttle = 0;
    this.touchState.steer = 0;
    this.touchState.pitch = 0;
    this.touchState.roll = 0;
    this.touchState.throttleUp = false;
    this.touchState.throttleDown = false;
    this.touchState.fullThrottle = false;
    this.touchState.throttleCut = false;
  }

  detectMobile() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;

      // Single-press action triggers
      if (e.code === 'KeyC') this.state.cameraToggle = true;
      if (e.code === 'KeyL') this.state.toggleLights = true;
      if (e.code === 'KeyE') this.state.walkToggle = true;
      if (e.code === 'KeyF') {
        this.state.interactAction = true;
        this.state.toggleLights = true;
      }
      if (e.code === 'KeyG') this.state.legsToggle = true;
      if (e.code === 'KeyB') this.state.cargoToggle = true;

      // Prevent scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  initGamepad() {
    this.gamepadIndex = null;
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
      console.log('Gamepad connected:', e.gamepad.id);
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
    });
  }

  pollGamepad() {
    if (this.gamepadIndex === null) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;

    // Left stick steer
    const stickX = gp.axes[0];
    if (Math.abs(stickX) > 0.15) {
      this.state.steer = stickX;
    }

    // Right trigger (RT / R2 = gas, LT / L2 = brake)
    const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
    const lt = gp.buttons[6] ? gp.buttons[6].value : 0;

    if (rt > 0.1) this.state.throttle = rt;
    else if (lt > 0.1) this.state.throttle = -lt;

    // Nitro: A / X button or RB
    if (gp.buttons[0]?.pressed || gp.buttons[5]?.pressed) {
      this.state.nitro = true;
    }
    // Assist: B or Y
    if (gp.buttons[1]?.pressed || gp.buttons[3]?.pressed) {
      this.state.assist = true;
    }
    // Handbrake: X
    if (gp.buttons[2]?.pressed) {
      this.state.handbrake = true;
    }
  }

  update() {
    // Reset continuous single-frame pulses
    this.state.throttle = 0;
    this.state.steer = 0;
    this.state.pitch = 0;
    this.state.roll = 0;
    this.state.throttleUp = false;
    this.state.throttleDown = false;
    this.state.fullThrottle = false;
    this.state.throttleCut = false;
    this.state.brake = false;
    this.state.handbrake = false;
    this.state.nitro = false;
    this.state.assist = false;

    // 1. Keyboard Input
    let fwd = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) fwd += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) fwd -= 1;
    this.state.throttle = fwd;
    this.state.pitch = fwd; // W = pitch forward/down, S = pitch backward/up

    let turn = 0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turn += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turn -= 1;
    this.state.steer = turn;

    let roll = 0;
    if (this.keys['KeyE']) roll += 1;
    if (this.keys['KeyQ']) roll -= 1;
    this.state.roll = roll;

    if (this.keys['Space']) this.state.handbrake = true;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyN']) {
      this.state.nitro = true;
      this.state.throttleUp = true;
    }
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) {
      this.state.throttleDown = true;
    }
    if (this.keys['KeyZ']) this.state.fullThrottle = true;
    if (this.keys['KeyX']) this.state.throttleCut = true;
    if (this.keys['KeyR']) this.state.assist = true;

    // 2. Poll Gamepad
    this.pollGamepad();

    // 3. Touch Overrides (merged from touch controls)
    if (this.touchState) {
      if (this.touchState.throttle !== 0) this.state.throttle = this.touchState.throttle;
      if (this.touchState.steer !== 0) this.state.steer = this.touchState.steer;
      if (this.touchState.pitch !== 0) this.state.pitch = this.touchState.pitch;
      if (this.touchState.roll !== 0) this.state.roll = this.touchState.roll;
      if (this.touchState.throttleUp) this.state.throttleUp = true;
      if (this.touchState.throttleDown) this.state.throttleDown = true;
      if (this.touchState.fullThrottle) this.state.fullThrottle = true;
      if (this.touchState.throttleCut) this.state.throttleCut = true;
      if (this.touchState.handbrake) this.state.handbrake = true;
      if (this.touchState.nitro) this.state.nitro = true;
      if (this.touchState.assist) this.state.assist = true;
    }
  }

  consumeSinglePress(action) {
    if (this.state[action]) {
      this.state[action] = false;
      return true;
    }
    return false;
  }
}
