import * as THREE from 'three';

// Mars Atmospheric Skydome, Moons (Phobos/Deimos), Dust Devils, and Tire/Thruster Particles
export class MarsAtmosphere {
  constructor(scene) {
    this.scene = scene;
    this.createSky();
    this.createDistantMountains();
    this.createMoons();
    this.createWindDust();
    this.createVehicleParticles();
  }

  createSky() {
    // Custom Mars Atmospheric Sky Dome
    const skyGeo = new THREE.SphereGeometry(1200, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uSunPos: { value: new THREE.Vector3(0.5, 0.45, 0.4).normalize() },
        uSkyZenith: { value: new THREE.Color(0xb25d40) },     // Authentic Martian butterscotch/terracotta
        uSkyHorizon: { value: new THREE.Color(0xda8e6c) },    // Matching terrain horizon dust haze
        uSunColor: { value: new THREE.Color(0xfff5e6) },      // Brilliant Martian sun
        uSunHaloBlue: { value: new THREE.Color(0x5ca0d3) }    // Signature Mars twilight blue scattering halo
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunPos;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunHaloBlue;
        varying vec3 vWorldPosition;

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float elevation = clamp(dir.y, 0.0, 1.0);

          // Base gradient: horizon to zenith
          vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(elevation, 0.45));

          // Mars forward dust scattering creates a unique blueish glow around the sun
          float sunCos = dot(dir, normalize(uSunPos));
          float sunGlow = max(0.0, sunCos);

          // Blue forward-scattering corona (famous martian sunset halo)
          float blueCorona = pow(sunGlow, 8.0) * 0.45;
          sky = mix(sky, uSunHaloBlue, blueCorona);

          // Sharp Sun disk (Mars sun appears ~2/3 size of Earth sun)
          float sunDisk = smoothstep(0.9988, 0.9995, sunCos);
          vec3 col = sky + uSunColor * sunDisk * 3.0;

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    // Directional Sunlight & Ambient
    this.sunLight = new THREE.DirectionalLight(0xffecd4, 2.4);
    this.sunLight.position.set(300, 350, 240);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 600;
    const d = 50;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.AmbientLight(0x4a2a22, 1.2);
    this.scene.add(this.ambientLight);
  }

  createDistantMountains() {
    // 360-degree distant Martian mountain silhouettes (Olympus Mons caldera peak and crater rims)
    const segs = 64;
    const radius = 950.0;
    const geo = new THREE.BufferGeometry();
    const positions = [];

    for (let i = 0; i < segs; i++) {
      const theta1 = (i / segs) * Math.PI * 2;
      const theta2 = ((i + 1) / segs) * Math.PI * 2;

      // Olympus Mons silhouette peak at ~45 degrees, rolling crater rims around
      const h1 = 30.0 + Math.sin(theta1 * 3.0) * 18.0 + Math.pow(Math.max(0, Math.cos(theta1 - 0.78)), 4.0) * 90.0;
      const h2 = 30.0 + Math.sin(theta2 * 3.0) * 18.0 + Math.pow(Math.max(0, Math.cos(theta2 - 0.78)), 4.0) * 90.0;

      const x1 = Math.cos(theta1) * radius;
      const z1 = Math.sin(theta1) * radius;
      const x2 = Math.cos(theta2) * radius;
      const z2 = Math.sin(theta2) * radius;

      // Triangle 1
      positions.push(x1, -15, z1);
      positions.push(x1, h1, z1);
      positions.push(x2, h2, z2);

      // Triangle 2
      positions.push(x1, -15, z1);
      positions.push(x2, h2, z2);
      positions.push(x2, -15, z2);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc87352,
      side: THREE.DoubleSide
    });

    this.distantMountains = new THREE.Mesh(geo, mat);
    this.scene.add(this.distantMountains);
  }

  createMoons() {
    // Phobos (craggy potato-shaped Martian moon)
    const phobosGeo = new THREE.DodecahedronGeometry(14, 1);
    const phobosMat = new THREE.MeshStandardMaterial({
      color: 0x999088,
      roughness: 0.9,
      flatShading: true
    });
    this.phobos = new THREE.Mesh(phobosGeo, phobosMat);
    this.phobos.position.set(-450, 520, -600);
    this.scene.add(this.phobos);

    // Deimos (smaller distant speck)
    const deimosGeo = new THREE.DodecahedronGeometry(5, 1);
    const deimosMat = new THREE.MeshStandardMaterial({
      color: 0x888078,
      roughness: 0.95,
      flatShading: true
    });
    this.deimos = new THREE.Mesh(deimosGeo, deimosMat);
    this.deimos.position.set(580, 680, -750);
    this.scene.add(this.deimos);
  }

  createWindDust() {
    // 1500 blowing sand particles drifting across the dunes
    this.dustCount = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dustCount * 3);
    const velocities = new Float32Array(this.dustCount * 3);

    this.windDustRadius = 120.0;

    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * this.windDustRadius * 2;
      positions[i * 3 + 1] = Math.random() * 25 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.windDustRadius * 2;

      // Wind direction ~ 35 degrees
      const speed = 12.0 + Math.random() * 10.0;
      velocities[i * 3 + 0] = Math.cos(0.62) * speed;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
      velocities[i * 3 + 2] = Math.sin(0.62) * speed;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dustVelocities = velocities;

    const material = new THREE.PointsMaterial({
      color: 0xd98d6c,
      size: 1.4,
      transparent: true,
      opacity: 0.6,
      blending: THREE.NormalBlending
    });

    this.dustPoints = new THREE.Points(geometry, material);
    this.scene.add(this.dustPoints);
  }

  createVehicleParticles() {
    // 1. Tire Sand Plume particles
    this.tireParticleCount = 200;
    const tireGeo = new THREE.BufferGeometry();
    const tirePos = new Float32Array(this.tireParticleCount * 3);
    const tireSizes = new Float32Array(this.tireParticleCount);
    const tireAlphas = new Float32Array(this.tireParticleCount);

    for (let i = 0; i < this.tireParticleCount; i++) {
      tirePos[i * 3 + 1] = -1000; // start hidden
      tireSizes[i] = 1.0;
      tireAlphas[i] = 0.0;
    }

    tireGeo.setAttribute('position', new THREE.BufferAttribute(tirePos, 3));
    tireGeo.setAttribute('size', new THREE.BufferAttribute(tireSizes, 1));
    tireGeo.setAttribute('alpha', new THREE.BufferAttribute(tireAlphas, 1));

    this.tireParticles = [];
    for (let i = 0; i < this.tireParticleCount; i++) {
      this.tireParticles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.0,
        size: 1.0
      });
    }

    const tireMat = new THREE.PointsMaterial({
      color: 0xc4633f,
      size: 2.2,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.tirePoints = new THREE.Points(tireGeo, tireMat);
    this.scene.add(this.tirePoints);

    // 2. Nitro Jet Flame particles
    this.nitroParticleCount = 150;
    const nitroGeo = new THREE.BufferGeometry();
    const nitroPos = new Float32Array(this.nitroParticleCount * 3);

    for (let i = 0; i < this.nitroParticleCount * 3; i++) {
      nitroPos[i] = -1000;
    }
    nitroGeo.setAttribute('position', new THREE.BufferAttribute(nitroPos, 3));

    this.nitroParticles = [];
    for (let i = 0; i < this.nitroParticleCount; i++) {
      this.nitroParticles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.35
      });
    }

    const nitroMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 2.5,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.nitroPoints = new THREE.Points(nitroGeo, nitroMat);
    this.scene.add(this.nitroPoints);
  }

  emitTireDust(pos, wheelVel) {
    for (let i = 0; i < this.tireParticleCount; i++) {
      const p = this.tireParticles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4));
        p.vel.copy(wheelVel).multiplyScalar(-0.15).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2 + 1, (Math.random() - 0.5) * 2));
        p.life = 0;
        p.maxLife = 0.6 + Math.random() * 0.4;
        p.size = 1.5 + Math.random() * 2.0;
        break;
      }
    }
  }

  emitNitroFlame(nozzlePos, roverForward) {
    for (let i = 0; i < this.nitroParticleCount; i++) {
      const p = this.nitroParticles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(nozzlePos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2));
        // Eject backwards with high speed + slight spread
        p.vel.copy(roverForward).multiplyScalar(-38.0).add(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5));
        p.life = 0;
        p.maxLife = 0.25 + Math.random() * 0.15;
        break;
      }
    }
  }

  update(dt, playerPos, physics) {
    // 1. Anchor skydome, distant mountains and directional light to player
    this.skyMesh.position.copy(playerPos);
    if (this.distantMountains) {
      this.distantMountains.position.set(playerPos.x, 0, playerPos.z);
    }
    this.sunLight.position.set(playerPos.x + 300, 350, playerPos.z + 240);
    this.sunLight.target.position.copy(playerPos);

    // Slowly orbit moons
    this.phobos.rotation.y += dt * 0.02;
    this.deimos.rotation.y += dt * 0.01;

    // 2. Update Wind Dust Specks
    const dustPosAttr = this.dustPoints.geometry.attributes.position;
    const r = this.windDustRadius;

    for (let i = 0; i < this.dustCount; i++) {
      let x = dustPosAttr.getX(i);
      let y = dustPosAttr.getY(i);
      let z = dustPosAttr.getZ(i);

      x += this.dustVelocities[i * 3 + 0] * dt;
      y += this.dustVelocities[i * 3 + 1] * dt;
      z += this.dustVelocities[i * 3 + 2] * dt;

      // Wrap around player box
      if (x - playerPos.x > r) x -= r * 2;
      if (x - playerPos.x < -r) x += r * 2;
      if (z - playerPos.z > r) z -= r * 2;
      if (z - playerPos.z < -r) z += r * 2;
      if (y < playerPos.y) y += 25;
      if (y > playerPos.y + 35) y -= 25;

      dustPosAttr.setXYZ(i, x, y, z);
    }
    dustPosAttr.needsUpdate = true;

    // 3. Emit & update vehicle particles
    // Tire dust when driving on ground
    if (physics.speedKmh > 8) {
      for (let w = 0; w < 4; w++) {
        const contact = physics.wheelContacts[w];
        if (contact.onGround && Math.random() < 0.4) {
          this.emitTireDust(contact.groundPoint, physics.velocity);
        }
      }
    }

    // Nitro exhaust
    if (physics.isNitroActive) {
      const forward = physics._vForward;
      const leftNozzle = new THREE.Vector3(-0.55, 0.55, -2.7).applyQuaternion(physics.quaternion).add(playerPos);
      const rightNozzle = new THREE.Vector3(0.55, 0.55, -2.7).applyQuaternion(physics.quaternion).add(playerPos);
      this.emitNitroFlame(leftNozzle, forward);
      this.emitNitroFlame(rightNozzle, forward);
    }

    // Update Tire Particles
    const tirePosAttr = this.tirePoints.geometry.attributes.position;
    for (let i = 0; i < this.tireParticleCount; i++) {
      const p = this.tireParticles[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          tirePosAttr.setXYZ(i, 0, -1000, 0);
        } else {
          p.pos.addScaledVector(p.vel, dt);
          p.vel.multiplyScalar(0.95);
          tirePosAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
        }
      }
    }
    tirePosAttr.needsUpdate = true;

    // Update Nitro Particles
    const nitroPosAttr = this.nitroPoints.geometry.attributes.position;
    for (let i = 0; i < this.nitroParticleCount; i++) {
      const p = this.nitroParticles[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          nitroPosAttr.setXYZ(i, 0, -1000, 0);
        } else {
          p.pos.addScaledVector(p.vel, dt);
          nitroPosAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
        }
      }
    }
    nitroPosAttr.needsUpdate = true;
  }
}
