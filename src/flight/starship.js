import * as THREE from 'three';

// -------------------------------------------------------------
// SpaceX Starship + Super Heavy Stack & Launch Complex
// Accurately reflects:
// 1. Orbital Launch Mount (OLM) & 140m Mechazilla Tower with Chopsticks (Ref Image 0)
// 2. Super Heavy Booster with 33 Raptors, grid fins, and hot-staging ring
// 3. Starship upper stage with black ceramic heat shield, flaps, 6 Raptors
// 4. Vacuum "Space Jellyfish" twilight plume (Ref Image 1)
// 5. Hypersonic ionized plasma re-entry sheath (Ref Image 2)
// -------------------------------------------------------------

function createSteelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#dcdad5';
  g.fillRect(0, 0, 512, 512);

  // Brushed steel vertical grain
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(100,105,115,0.08)';
    g.fillRect(Math.random() * 512, 0, 1 + Math.random() * 2, 512);
  }

  // Welded ring seams every 32px
  g.strokeStyle = 'rgba(75,80,90,0.55)';
  g.lineWidth = 1.5;
  for (let y = 0; y <= 512; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  return tex;
}

function createHeatshieldTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#111215';
  g.fillRect(0, 0, 256, 256);

  // Hexagonal tile seam grid
  g.strokeStyle = 'rgba(40,42,48,0.7)';
  g.lineWidth = 1;
  const r = 8;
  const h = r * Math.sqrt(3);
  for (let y = 0; y < 270; y += h) {
    for (let x = 0; x < 270; x += r * 3) {
      drawHex(g, x, y, r);
      drawHex(g, x + r * 1.5, y + h / 2, r);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 12);
  return tex;
}

function drawHex(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.stroke();
}

export class StarshipMissionVehicle {
  constructor() {
    this.group = new THREE.Group();

    // Textures & Shared PBR Materials
    const steelTex = createSteelTexture();
    const heatshieldTex = createHeatshieldTexture();

    this.matSteel = new THREE.MeshStandardMaterial({
      map: steelTex,
      metalness: 0.95,
      roughness: 0.22,
      color: 0xefedf0
    });

    this.matHeatshield = new THREE.MeshStandardMaterial({
      map: heatshieldTex,
      metalness: 0.15,
      roughness: 0.88,
      color: 0x141518
    });

    this.matDarkMetal = new THREE.MeshStandardMaterial({
      color: 0x24262c,
      metalness: 0.85,
      roughness: 0.4
    });

    this.matRaptorBell = new THREE.MeshStandardMaterial({
      color: 0x3d424b,
      metalness: 0.9,
      roughness: 0.35
    });

    this.matTower = new THREE.MeshStandardMaterial({
      color: 0x32353b,
      metalness: 0.75,
      roughness: 0.55
    });

    this.matGridFin = new THREE.MeshStandardMaterial({
      color: 0x1b1c20,
      metalness: 0.92,
      roughness: 0.45,
      wireframe: true
    });

    // Build vehicle sub-assemblies
    this.boosterGroup = new THREE.Group();
    this.starshipGroup = new THREE.Group();
    this.launchPadGroup = new THREE.Group();

    this.group.add(this.launchPadGroup);
    this.group.add(this.boosterGroup);
    this.group.add(this.starshipGroup);

    this.buildLaunchComplex();
    this.buildSuperHeavyBooster();
    this.buildStarship();
    this.buildFX();

    this.isMated = true;
    this.boosterActive = false;
    this.starshipEnginesActive = false;
    this.plasmaActive = false;
    this.jellyfishActive = false;
  }

  // -------------------------------------------------------------
  // 1. ORBITAL LAUNCH MOUNT (OLM) & MECHAZILLA TOWER (Ref Image 0)
  // -------------------------------------------------------------
  buildLaunchComplex() {
    const pad = this.launchPadGroup;

    // OLM Base Ring Mount (elevates rocket 22m above ground)
    const tableRadius = 8.5;
    const tableHeight = 22.0;

    // Table ring
    const ringGeo = new THREE.CylinderGeometry(tableRadius, tableRadius + 1.2, 4.0, 32);
    const ringMesh = new THREE.Mesh(ringGeo, this.matTower);
    ringMesh.position.y = tableHeight - 2.0;
    ringMesh.castShadow = ringMesh.receiveShadow = true;
    pad.add(ringMesh);

    // Flame deflection aperture opening in center
    const holeGeo = new THREE.CylinderGeometry(5.0, 5.0, 4.2, 24);
    const holeMesh = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x050505 }));
    holeMesh.position.y = tableHeight - 2.0;
    pad.add(holeMesh);

    // 6 Massive Support Pillars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const legGeo = new THREE.CylinderGeometry(1.2, 1.6, tableHeight - 4.0, 12);
      const leg = new THREE.Mesh(legGeo, this.matDarkMetal);
      leg.position.set(Math.cos(a) * (tableRadius - 1.2), (tableHeight - 4.0) / 2, Math.sin(a) * (tableRadius - 1.2));
      leg.castShadow = true;
      pad.add(leg);
    }

    // 145m Mechazilla Tower (offset 16m from rocket center)
    const towerX = 18.0;
    const towerZ = 0.0;
    const towerHeight = 145.0;
    const towerWidth = 9.0;

    // 4 Main Tower Column Legs
    const columnGeo = new THREE.BoxGeometry(1.2, towerHeight, 1.2);
    for (let dx of [-towerWidth / 2, towerWidth / 2]) {
      for (let dz of [-towerWidth / 2, towerWidth / 2]) {
        const col = new THREE.Mesh(columnGeo, this.matTower);
        col.position.set(towerX + dx, towerHeight / 2, towerZ + dz);
        col.castShadow = true;
        pad.add(col);
      }
    }

    // Horizontal & Diagonal Lattice Bracing
    for (let y = 10; y < towerHeight; y += 12) {
      const beamX = new THREE.Mesh(new THREE.BoxGeometry(towerWidth, 0.7, 0.7), this.matTower);
      beamX.position.set(towerX, y, towerZ - towerWidth / 2);
      pad.add(beamX);

      const beamX2 = beamX.clone();
      beamX2.position.z = towerZ + towerWidth / 2;
      pad.add(beamX2);

      const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, towerWidth), this.matTower);
      beamZ.position.set(towerX - towerWidth / 2, y, towerZ);
      pad.add(beamZ);

      const beamZ2 = beamZ.clone();
      beamZ2.position.x = towerX + towerWidth / 2;
      pad.add(beamZ2);
    }

    // Top Tower Crane boom
    const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(22, 1.8, 1.8), this.matTower);
    craneBoom.position.set(towerX - 5, towerHeight + 2, towerZ);
    pad.add(craneBoom);

    // Chopstick Arms Carriage (Mechazilla arms that cradle the booster & ship)
    this.chopsticks = new THREE.Group();
    this.chopsticks.position.set(towerX - towerWidth / 2, 85, towerZ);

    const armGeo = new THREE.BoxGeometry(18, 1.6, 1.4);
    const leftArm = new THREE.Mesh(armGeo, this.matDarkMetal);
    leftArm.position.set(-9, 0, -4.5);
    leftArm.rotation.y = 0.22;
    this.chopsticks.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, this.matDarkMetal);
    rightArm.position.set(-9, 0, 4.5);
    rightArm.rotation.y = -0.22;
    this.chopsticks.add(rightArm);

    pad.add(this.chopsticks);
  }

  // -------------------------------------------------------------
  // 2. SUPER HEAVY BOOSTER (STAGE 1)
  // -------------------------------------------------------------
  buildSuperHeavyBooster() {
    const B = this.boosterGroup;
    const radius = 4.5; // 9m diameter
    const boosterHeight = 70.0;
    this.boosterHeight = boosterHeight;

    // Main Stainless Steel Cylinder Body
    const cylGeo = new THREE.CylinderGeometry(radius, radius, boosterHeight, 48, 8);
    const body = new THREE.Mesh(cylGeo, this.matSteel);
    body.position.y = boosterHeight / 2;
    body.castShadow = body.receiveShadow = true;
    B.add(body);

    // Aerodynamic Chines / Forward Cable Trunks along the side
    for (const sx of [-1, 1]) {
      const chineGeo = new THREE.BoxGeometry(0.4, boosterHeight * 0.75, 0.9);
      const chine = new THREE.Mesh(chineGeo, this.matSteel);
      chine.position.set(sx * (radius + 0.15), boosterHeight * 0.45, 0);
      B.add(chine);
    }

    // 4 Hexagonal Grid Fins at the top (steer booster during atmospheric return)
    this.gridFins = [];
    const finHeight = boosterHeight - 2.0;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const finGroup = new THREE.Group();
      finGroup.position.set(Math.cos(a) * (radius + 0.3), finHeight, Math.sin(a) * (radius + 0.3));
      finGroup.rotation.y = -a;

      const finMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 4.5), this.matGridFin);
      finMesh.castShadow = true;
      finGroup.add(finMesh);

      B.add(finGroup);
      this.gridFins.push(finGroup);
    }

    // Vented Hot-Staging Interstage Ring (sits between Booster and Ship)
    const hotRingY = boosterHeight + 2.5;
    const hotRingGeo = new THREE.CylinderGeometry(radius, radius, 5.0, 32);
    const hotRing = new THREE.Mesh(hotRingGeo, this.matDarkMetal);
    hotRing.position.y = hotRingY;
    B.add(hotRing);

    // 16 Hot-staging blowout vents where Starship's engines blast through
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 1.2), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }));
      vent.position.set(Math.cos(a) * (radius + 0.05), hotRingY, Math.sin(a) * (radius + 0.05));
      vent.rotation.y = -a;
      B.add(vent);
    }

    // 33 Raptor Engine Cluster at Booster Base
    const raptorGeo = new THREE.CylinderGeometry(0.4, 0.75, 1.8, 16);
    this.boosterPlumes = [];

    // Outer ring (20 fixed engines)
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = radius * 0.82;
      const bell = new THREE.Mesh(raptorGeo, this.matRaptorBell);
      bell.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      B.add(bell);
    }
    // Mid ring (10 gimbaling engines)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = radius * 0.52;
      const bell = new THREE.Mesh(raptorGeo, this.matRaptorBell);
      bell.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      B.add(bell);
    }
    // Center cluster (3 gimbaling center engines)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const r = radius * 0.22;
      const bell = new THREE.Mesh(raptorGeo, this.matRaptorBell);
      bell.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      B.add(bell);
    }

    // Unified Booster Engine Fire Plume
    const boosterFlameGeo = new THREE.CylinderGeometry(3.8, 8.5, 38, 24, 1, true);
    boosterFlameGeo.translate(0, -19, 0);
    this.boosterFlame = new THREE.Mesh(
      boosterFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    B.add(this.boosterFlame);

    // Inner bright white shock core
    const shockCoreGeo = new THREE.CylinderGeometry(1.8, 3.2, 22, 16, 1, true);
    shockCoreGeo.translate(0, -11, 0);
    this.boosterShockCore = new THREE.Mesh(
      shockCoreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    B.add(this.boosterShockCore);

    // Booster Light
    this.boosterLight = new THREE.PointLight(0xff8822, 0, 160);
    this.boosterLight.position.set(0, -5, 0);
    B.add(this.boosterLight);
  }

  // -------------------------------------------------------------
  // 3. STARSHIP UPPER STAGE (STAGE 2) (Ref Images 0, 1, 2)
  // -------------------------------------------------------------
  buildStarship() {
    const S = this.starshipGroup;
    const r = 4.5; // 9m diameter
    const barrelH = 34.0;
    const noseH = 16.0;
    this.shipHeight = barrelH + noseH;

    // Cylinder body: Front half (Z > 0) has black tiles, back half (Z < 0) has stainless steel
    // We achieve this accurately with two semi-cylinders or multi-materials
    const shipBodyMat = [this.matSteel, this.matHeatshield];

    // Main barrel cylinder
    const barrelGeo = new THREE.CylinderGeometry(r, r, barrelH, 48, 8);
    const barrel = new THREE.Mesh(barrelGeo, this.matSteel);
    barrel.position.y = barrelH / 2;
    barrel.castShadow = barrel.receiveShadow = true;
    S.add(barrel);

    // Black Ceramic Heat Shield Layer on Belly (Belly facing -Z for belly-flop re-entry)
    const shieldBellyGeo = new THREE.CylinderGeometry(r * 1.01, r * 1.01, barrelH, 48, 1, false, Math.PI * 0.5, Math.PI);
    const shieldBelly = new THREE.Mesh(shieldBellyGeo, this.matHeatshield);
    shieldBelly.position.y = barrelH / 2;
    S.add(shieldBelly);

    // Aerodynamic Nosecone (Gothic ogive arched nose)
    const noseGeo = new THREE.ConeGeometry(r, noseH, 48);
    const nose = new THREE.Mesh(noseGeo, this.matSteel);
    nose.position.y = barrelH + noseH / 2;
    nose.castShadow = true;
    S.add(nose);

    // Nosecone Heatshield half
    const noseShieldGeo = new THREE.ConeGeometry(r * 1.01, noseH, 48, 1, false, Math.PI * 0.5, Math.PI);
    const noseShield = new THREE.Mesh(noseShieldGeo, this.matHeatshield);
    noseShield.position.y = barrelH + noseH / 2;
    S.add(noseShield);

    // 4 Articulating Aerodynamic Flaps for Hypersonic Re-entry Belly-flop Control!
    this.forwardFlaps = [];
    this.aftFlaps = [];

    // Forward Flaps (Canards near nose)
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sx * (r - 0.2), barrelH + noseH * 0.45, 0);

      const flapMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.8, 3.2), this.matHeatshield);
      flapMesh.position.set(sx * 1.6, 0, 0);
      flapMesh.castShadow = true;
      hinge.add(flapMesh);

      S.add(hinge);
      this.forwardFlaps.push({ hinge, side: sx });
    }

    // Aft Flaps (Large wings near base)
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sx * (r - 0.2), 6.5, 0);

      const flapMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 11.0, 5.2), this.matHeatshield);
      flapMesh.position.set(sx * 2.6, 0, 0);
      flapMesh.castShadow = true;
      hinge.add(flapMesh);

      S.add(hinge);
      this.aftFlaps.push({ hinge, side: sx });
    }

    // 6 Starship Raptor Engines: 3 Vacuum (large bell) + 3 Sea-level
    // 3 Vacuum Raptors (Raptor Vac with huge expansion bells)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const vacBellGeo = new THREE.CylinderGeometry(0.5, 1.4, 2.6, 20);
      const vacBell = new THREE.Mesh(vacBellGeo, this.matRaptorBell);
      vacBell.position.set(Math.cos(a) * 2.5, -1.0, Math.sin(a) * 2.5);
      S.add(vacBell);
    }
    // 3 Center Gimbaling Raptors
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      const slBellGeo = new THREE.CylinderGeometry(0.3, 0.7, 1.6, 16);
      const slBell = new THREE.Mesh(slBellGeo, this.matRaptorBell);
      slBell.position.set(Math.cos(a) * 1.1, -0.6, Math.sin(a) * 1.1);
      S.add(slBell);
    }

    // Starship Atmospheric Plume
    const shipFlameGeo = new THREE.CylinderGeometry(2.4, 4.6, 24, 20, 1, true);
    shipFlameGeo.translate(0, -12, 0);
    this.starshipFlame = new THREE.Mesh(
      shipFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    S.add(this.starshipFlame);

    this.starshipLight = new THREE.PointLight(0x44aaff, 0, 120);
    this.starshipLight.position.set(0, -4, 0);
    S.add(this.starshipLight);
  }

  // -------------------------------------------------------------
  // 4. SPECIAL FX: SPACE JELLYFISH PLUME & HYPERSONIC PLASMA SHEATH
  // -------------------------------------------------------------
  buildFX() {
    // A. "SPACE JELLYFISH" Twilight Expansion Plume (Ref Image 1)
    // At high altitudes / space, exhaust expands into a vast luminous bell nebula
    const jellyGeo = new THREE.SphereGeometry(45, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.75);
    jellyGeo.rotateX(Math.PI);
    jellyGeo.scale(1.0, 2.4, 1.0);
    jellyGeo.translate(0, -55, 0);

    this.jellyfishMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.0 },
        uColorCore: { value: new THREE.Color(0xaae5ff) },
        uColorOuter: { value: new THREE.Color(0x7050d0) }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColorCore;
        uniform vec3 uColorOuter;
        varying vec3 vNormal;
        varying vec3 vPos;

        void main() {
          if (uIntensity <= 0.001) discard;
          float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
          float falloff = smoothstep(120.0, 0.0, abs(vPos.y));
          vec3 col = mix(uColorCore, uColorOuter, smoothstep(0.0, 45.0, length(vPos.xz)));
          float alpha = pow(rim, 1.8) * falloff * uIntensity * 0.75;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.jellyfishMesh = new THREE.Mesh(jellyGeo, this.jellyfishMat);
    this.starshipGroup.add(this.jellyfishMesh);

    // B. HYPERSONIC IONIZED PLASMA RE-ENTRY SHEATH (Ref Image 2)
    // Incandescent bow shockwave wrapping around Starship's black heatshield during belly-flop!
    const plasmaGeo = new THREE.CylinderGeometry(5.2, 5.2, 38, 32, 1, true, Math.PI * 0.45, Math.PI * 1.1);
    plasmaGeo.scale(1.2, 1.05, 1.35);
    plasmaGeo.translate(0, 19, -0.6);

    this.plasmaMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHeat: { value: 0.0 } // 0.0 = cold, 1.0 = peak heating (1600°C)
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform float uTime;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          // Turbulent fluttering ripple along shockwave
          vec3 pos = position;
          pos += normal * (sin(pos.y * 0.5 - uTime * 25.0) * 0.15);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uHeat;
        varying vec3 vNormal;
        varying vec3 vPos;

        void main() {
          if (uHeat <= 0.005) discard;
          // Gradient from blazing incandescent white-yellow stagnation core
          // to magenta/violet ionized plasma halo and cyan trail (Ref Image 2)
          vec3 stagnation = vec3(1.0, 0.95, 0.7);
          vec3 ionizedMagenta = vec3(0.95, 0.2, 0.75);
          vec3 ionizedViolet = vec3(0.55, 0.25, 1.0);
          vec3 ribbonCyan = vec3(0.1, 0.75, 1.0);

          float t = clamp(abs(vPos.y) / 25.0, 0.0, 1.0);
          vec3 plasmaCol = mix(stagnation, ionizedMagenta, smoothstep(0.1, 0.5, t));
          plasmaCol = mix(plasmaCol, ionizedViolet, smoothstep(0.5, 0.8, t));
          plasmaCol = mix(plasmaCol, ribbonCyan, smoothstep(0.8, 1.0, t));

          // Edge glow / Fresnel
          float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.5);
          float alpha = clamp(rim * uHeat * 1.3, 0.0, 0.95);

          gl_FragColor = vec4(plasmaCol, alpha);
        }
      `
    });
    this.plasmaMesh = new THREE.Mesh(plasmaGeo, this.plasmaMat);
    this.starshipGroup.add(this.plasmaMesh);

    // Front nose shockwave cap
    const nosePlasmaGeo = new THREE.SphereGeometry(5.2, 24, 16, Math.PI * 0.5, Math.PI, 0, Math.PI * 0.5);
    nosePlasmaGeo.translate(0, 34 + 14, -0.4);
    const nosePlasma = new THREE.Mesh(nosePlasmaGeo, this.plasmaMat);
    this.starshipGroup.add(nosePlasma);
  }

  // -------------------------------------------------------------
  // UPDATE / ANIMATION INTERFACE
  // -------------------------------------------------------------
  setMated(mated) {
    this.isMated = mated;
    if (mated) {
      this.starshipGroup.position.set(0, this.boosterHeight + 5.0, 0);
      this.starshipGroup.rotation.set(0, 0, 0);
    }
  }

  setBoosterThrottle(throttle) {
    const active = throttle > 0.01;
    this.boosterFlame.material.opacity = active ? 0.85 + Math.random() * 0.15 : 0.0;
    this.boosterFlame.scale.set(1.0 + throttle * 0.2, throttle * (1.0 + Math.random() * 0.2), 1.0 + throttle * 0.2);
    this.boosterShockCore.material.opacity = active ? 0.95 : 0.0;
    this.boosterLight.intensity = active ? throttle * 28.0 : 0.0;
  }

  setStarshipThrottle(throttle, isVacuum = false) {
    const active = throttle > 0.01;
    this.starshipFlame.material.opacity = active ? 0.88 + Math.random() * 0.12 : 0.0;
    this.starshipFlame.scale.set(1.0 + throttle * 0.3, throttle * (1.0 + Math.random() * 0.2), 1.0 + throttle * 0.3);
    this.starshipLight.intensity = active ? throttle * 22.0 : 0.0;

    // Trigger vacuum jellyfish plume when above thick atmosphere
    if (this.jellyfishMat) {
      this.jellyfishMat.uniforms.uIntensity.value = (active && isVacuum) ? throttle * 0.95 : 0.0;
    }
  }

  setReentryHeat(heatNormalized) {
    if (this.plasmaMat) {
      this.plasmaMat.uniforms.uHeat.value = THREE.MathUtils.clamp(heatNormalized, 0.0, 1.0);
    }
  }

  setFlapDeflection(pitch, roll) {
    // Articulate flaps for aerodynamic skydive trimming
    const fAngle = THREE.MathUtils.clamp(-pitch * 0.8 + roll * 0.4, -0.85, 0.85);
    const aAngle = THREE.MathUtils.clamp(pitch * 0.8 + roll * 0.4, -0.85, 0.85);

    for (const f of this.forwardFlaps) {
      f.hinge.rotation.z = f.side * fAngle;
    }
    for (const a of this.aftFlaps) {
      a.hinge.rotation.z = a.side * aAngle;
    }
  }

  setGridFinSteering(yaw, pitch) {
    for (let i = 0; i < this.gridFins.length; i++) {
      this.gridFins[i].rotation.z = Math.sin(i * Math.PI * 0.5) * yaw + pitch * 0.5;
    }
  }

  update(dt) {
    if (this.jellyfishMat) {
      this.jellyfishMat.uniforms.uTime.value += dt;
    }
    if (this.plasmaMat) {
      this.plasmaMat.uniforms.uTime.value += dt;
    }
  }
}
