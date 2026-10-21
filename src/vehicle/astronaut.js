import * as THREE from 'three';

// Articulated Mars EVA astronaut. The mesh is the player avatar in third-person
// walking mode and reuses the same root transform as the walker physics body.
export class AstronautAvatar {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'EVA_ASTRONAUT';
    this.group.visible = false;

    const suitMat = new THREE.MeshStandardMaterial({
      color: 0xf5f7fa,
      roughness: 0.38,
      metalness: 0.12
    });
    const fabricMat = new THREE.MeshStandardMaterial({
      color: 0x22272e,
      roughness: 0.75,
      metalness: 0.18
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0f1318,
      roughness: 0.28,
      metalness: 0.82
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x11161d,
      roughness: 0.03,
      metalness: 0.98,
      emissive: new THREE.Color(0xd4af37),
      emissiveIntensity: 0.42
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xff4f1f,
      roughness: 0.4,
      metalness: 0.2,
      emissive: new THREE.Color(0xb32800),
      emissiveIntensity: 0.35
    });
    const packMat = new THREE.MeshStandardMaterial({
      color: 0xe6ebf0,
      roughness: 0.45,
      metalness: 0.25
    });

    // Torso and life-support backpack
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.44, 6, 12), suitMat);
    torso.position.y = 1.13;
    this.group.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.22), fabricMat);
    chest.position.set(0, 1.26, 0.24);
    this.group.add(chest);

    const controlPanel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.045), darkMat);
    controlPanel.position.set(0.1, 1.27, 0.355);
    this.group.add(controlPanel);
    const statusLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x55ff9b })
    );
    statusLight.position.set(0.105, 1.31, 0.38);
    this.group.add(statusLight);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.28), packMat);
    pack.position.set(0, 1.15, -0.29);
    this.group.add(pack);
    const packDetail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), darkMat);
    packDetail.position.set(0, 1.38, -0.46);
    this.group.add(packDetail);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 10), fabricMat);
    waist.position.y = 0.86;
    this.group.add(waist);

    // Helmet with gold-ringed visor
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.12, 8), darkMat);
    neck.position.y = 1.52;
    this.group.add(neck);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.255, 18, 14), suitMat);
    helmet.position.y = 1.72;
    helmet.scale.set(1.02, 1.08, 1.0);
    this.group.add(helmet);

    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.235, 18, 12, Math.PI * 0.16, Math.PI * 0.68, Math.PI * 0.28, Math.PI * 0.42),
      visorMat
    );
    visor.position.set(0, 1.73, 0.04);
    visor.rotation.x = -0.05;
    this.group.add(visor);

    const visorRim = new THREE.Mesh(new THREE.TorusGeometry(0.238, 0.012, 6, 24), accentMat);
    visorRim.position.set(0, 1.72, 0.03);
    visorRim.rotation.x = Math.PI / 2;
    this.group.add(visorRim);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), darkMat);
    antenna.position.set(-0.13, 1.93, -0.04);
    this.group.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), accentMat);
    antennaTip.position.set(-0.13, 2.05, -0.04);
    this.group.add(antennaTip);

    // Arms (pivot groups at the shoulders so they swing naturally)
    this.leftArm = this.makeLimb(suitMat, fabricMat, accentMat, 0.095, 0.72, true);
    this.leftArm.position.set(-0.38, 1.39, 0);
    this.group.add(this.leftArm);

    this.rightArm = this.makeLimb(suitMat, fabricMat, accentMat, 0.095, 0.72, true);
    this.rightArm.position.set(0.38, 1.39, 0);
    this.group.add(this.rightArm);

    // Legs
    this.leftLeg = this.makeLimb(suitMat, fabricMat, accentMat, 0.12, 0.82, false);
    this.leftLeg.position.set(-0.16, 0.83, 0);
    this.group.add(this.leftLeg);

    this.rightLeg = this.makeLimb(suitMat, fabricMat, accentMat, 0.12, 0.82, false);
    this.rightLeg.position.set(0.16, 0.83, 0);
    this.group.add(this.rightLeg);

    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.34), darkMat);
    bootL.position.set(0, -0.79, 0.07);
    this.leftLeg.add(bootL);
    const bootR = bootL.clone();
    bootR.position.x = 0;
    this.rightLeg.add(bootR);

    // Small chest/helmet work light.
    const light = new THREE.PointLight(0xffe3c2, 0.8, 9, 2);
    light.position.set(0, 1.3, 0.42);
    this.group.add(light);

    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.time = 0;
    this._lastYaw = 0;
  }

  makeLimb(suitMat, fabricMat, accentMat, radius, length, isArm) {
    const pivot = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length * 0.5, 4, 8), suitMat);
    upper.position.y = -length * 0.25;
    pivot.add(upper);

    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.04, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xbfc7cc, roughness: 0.45, metalness: 0.5 })
    );
    joint.position.y = -length * 0.52;
    pivot.add(joint);

    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.9, length * 0.46, 4, 8), fabricMat);
    lower.position.y = -length * 0.75;
    pivot.add(lower);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.94, 0.018, 5, 14), accentMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = isArm ? -length * 0.94 : -length * 0.96;
    pivot.add(cuff);

    return pivot;
  }

  update(dt, walker) {
    this.time += dt;
    const moving = Math.abs(walker.speed) > 0.15;
    const speedNorm = THREE.MathUtils.clamp(Math.abs(walker.speed) / 5.5, 0, 1.4);

    this.group.position.copy(walker.position);
    this.group.rotation.y = walker.yaw;

    // The walker's bobPhase already drives footfalls. Use it for an articulated
    // stride, including a subtle forward lean at run speed.
    const stride = walker.bobPhase || 0;
    const swing = moving ? Math.sin(stride) * (0.62 + speedNorm * 0.28) : 0;
    const armSwing = moving ? -swing * 0.72 : 0;

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = armSwing + (moving ? -0.08 : 0.03);
    this.rightArm.rotation.x = -armSwing + (moving ? -0.08 : 0.03);
    this.leftArm.rotation.z = -0.09;
    this.rightArm.rotation.z = 0.09;
    this.leftLeg.rotation.z = -0.015;
    this.rightLeg.rotation.z = 0.015;

    // Idle breathing / surface scanning when stationary.
    if (!moving) {
      const idle = Math.sin(this.time * 1.9) * 0.025;
      this.leftArm.rotation.x = idle;
      this.rightArm.rotation.x = -idle;
    }

    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, moving ? -0.05 * speedNorm : 0, 0.12);
  }
}
