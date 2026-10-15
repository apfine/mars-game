// Procedural Web Audio API sound synthesizer for Mars Dune Rover
export class MarsAudioEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = false;
    this.masterGain = null;

    // Node references
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;

    this.nitroNoise = null;
    this.nitroGain = null;
    this.nitroFilter = null;

    this.tireNoise = null;
    this.tireGain = null;

    this.windGain = null;
  }

  init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupEngine();
      this.setupNitro();
      this.setupTireSand();
      this.setupWindAmbiance();
      this.setupRocketSound();

      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
    }
  }

  setupRocketSound() {
    // Multi-oscillator + lowpass white noise for deafening rocket rumble
    const noiseBuffer = this.createNoiseBuffer();
    this.rocketNoise = this.ctx.createBufferSource();
    this.rocketNoise.buffer = noiseBuffer;
    this.rocketNoise.loop = true;

    this.rocketFilter = this.ctx.createBiquadFilter();
    this.rocketFilter.type = 'lowpass';
    this.rocketFilter.frequency.setValueAtTime(120, this.ctx.currentTime);
    this.rocketFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    this.rocketGain = this.ctx.createGain();
    this.rocketGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.rocketNoise.connect(this.rocketFilter);
    this.rocketFilter.connect(this.rocketGain);
    this.rocketGain.connect(this.masterGain);
    this.rocketNoise.start();

    // Re-entry rushing plasma wind sound
    this.plasmaNoise = this.ctx.createBufferSource();
    this.plasmaNoise.buffer = noiseBuffer;
    this.plasmaNoise.loop = true;

    this.plasmaFilter = this.ctx.createBiquadFilter();
    this.plasmaFilter.type = 'bandpass';
    this.plasmaFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
    this.plasmaFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.plasmaGain = this.ctx.createGain();
    this.plasmaGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.plasmaNoise.connect(this.plasmaFilter);
    this.plasmaFilter.connect(this.plasmaGain);
    this.plasmaGain.connect(this.masterGain);
    this.plasmaNoise.start();
  }

  playStageSeparationSound() {
    if (!this.initialized || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.46);
    } catch (_) {}
  }

  updateRocket(throttle, altitude, heat) {
    if (!this.initialized || this.muted) return;
    const t = this.ctx.currentTime;
    if (this.rocketGain) {
      const rVol = Math.min(0.55, throttle * 0.52);
      this.rocketGain.gain.setTargetAtTime(rVol, t, 0.05);
      this.rocketFilter.frequency.setTargetAtTime(100 + throttle * 320, t, 0.05);
    }
    if (this.plasmaGain) {
      const pVol = Math.min(0.48, heat * 0.45);
      this.plasmaGain.gain.setTargetAtTime(pVol, t, 0.08);
      this.plasmaFilter.frequency.setTargetAtTime(400 + heat * 900, t, 0.08);
    }
  }

  ensureRunning() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setupEngine() {
    // Electric rover motor synth
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'triangle';
    this.engineOsc.frequency.setValueAtTime(65, this.ctx.currentTime);

    this.engineSubOsc = this.ctx.createOscillator();
    this.engineSubOsc.type = 'sawtooth';
    this.engineSubOsc.frequency.setValueAtTime(32.5, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(300, this.ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.engineOsc.connect(this.engineFilter);
    this.engineSubOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc.start();
    this.engineSubOsc.start();
  }

  setupNitro() {
    // White noise generator for rocket booster
    const noiseBuffer = this.createNoiseBuffer();
    this.nitroNoise = this.ctx.createBufferSource();
    this.nitroNoise.buffer = noiseBuffer;
    this.nitroNoise.loop = true;

    this.nitroFilter = this.ctx.createBiquadFilter();
    this.nitroFilter.type = 'bandpass';
    this.nitroFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
    this.nitroFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.nitroNoise.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.masterGain);

    this.nitroNoise.start();
  }

  setupTireSand() {
    const noiseBuffer = this.createNoiseBuffer();
    this.tireNoise = this.ctx.createBufferSource();
    this.tireNoise.buffer = noiseBuffer;
    this.tireNoise.loop = true;

    const tireFilter = this.ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
    tireFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.tireNoise.connect(tireFilter);
    tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);

    this.tireNoise.start();
  }

  setupWindAmbiance() {
    const noiseBuffer = this.createNoiseBuffer();
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.setValueAtTime(220, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    windSource.start();
  }

  playImpact(strength = 1.0) {
    if (!this.initialized || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.frequency.setValueAtTime(110 * strength, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.25 * strength, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.36);
    } catch (_) {}
  }

  update(physics) {
    if (!this.initialized || this.muted) return;

    const t = this.ctx.currentTime;
    const speed = physics.speedKmh;
    const speedRatio = Math.min(1.0, speed / 140.0);

    // Motor sound
    const pitch = 65 + speedRatio * 180 + (physics.isNitroActive ? 60 : 0);
    this.engineOsc.frequency.setTargetAtTime(pitch, t, 0.05);
    this.engineSubOsc.frequency.setTargetAtTime(pitch * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + speedRatio * 900, t, 0.05);

    const baseEngineVol = 0.06 + speedRatio * 0.12;
    this.engineGain.gain.setTargetAtTime(baseEngineVol, t, 0.05);

    // Nitro sound
    const targetNitroVol = physics.isNitroActive ? 0.38 : 0.0;
    this.nitroGain.gain.setTargetAtTime(targetNitroVol, t, 0.04);
    if (physics.isNitroActive) {
      this.nitroFilter.frequency.setTargetAtTime(600 + Math.random() * 80, t, 0.02);
    }

    // Tire sand rolling friction sound
    const onGround = physics.onGroundCount > 0;
    const tireVol = onGround ? Math.min(0.2, (speed / 100) * 0.18) : 0.0;
    this.tireGain.gain.setTargetAtTime(tireVol, t, 0.08);

    // Wind volume rises with extreme speed
    const windVol = 0.06 + speedRatio * 0.15;
    this.windGain.gain.setTargetAtTime(windVol, t, 0.1);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
}
