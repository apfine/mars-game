import * as THREE from 'three';

// Highly Detailed, Sleek, Cybernetic Mars Expedition Rover
// Features: Wide-stance aggressive silhouette, double-wishbone suspension arms with shock springs,
// deep directional off-road tires with alloy rims, panoramic tinted visor canopy,
// glowing full-width cyber rear taillight strip, dual vectoring ion thrusters with plasma glow,
// carbon-fiber aero spoiler, articulating communications dish, sensor mast, and RTG power core.
export class MarsRoverModel {
  constructor() {
    this.group = new THREE.Group();
    this.wheelAssemblies = [];
    this.thrusterGlows = [];
    this.thrusterLights = [];
    this.headlights = [];
    this.chassisGroup = new THREE.Group();
    this.group.add(this.chassisGroup);

    this.buildRover();
  }

  buildRover() {
    // --- High Quality PBR Materials ---
    const armorTealMat = new THREE.MeshStandardMaterial({
      color: 0x2e6f65, // Rich expedition teal
      roughness: 0.35,
      metalness: 0.75
    });

    const darkCarbonMat = new THREE.MeshStandardMaterial({
      color: 0x181a1d, // Matte carbon composite
      roughness: 0.6,
      metalness: 0.8
    });

    const brushedTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x8a929a,
      roughness: 0.25,
      metalness: 0.95
    });

    const goldFoilMat = new THREE.MeshStandardMaterial({
      color: 0xf5b800,
      roughness: 0.2,
      metalness: 0.9
    });

    const cockpitGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a1c24,
      metalness: 0.9,
      roughness: 0.08,
      transparent: true,
      opacity: 0.88,
      reflectivity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.85,
      metalness: 0.15
    });

    const copperRimMat = new THREE.MeshStandardMaterial({
      color: 0xe07a38, // High-visibility Mars copper-orange anodized alloy
      roughness: 0.25,
      metalness: 0.9
    });

    const neonCyanMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    const neonRedLightbarMat = new THREE.MeshBasicMaterial({
      color: 0xff1e44
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 1.0
    });

    // ==========================================
    // 1. CHASSIS & ARMOR HULL
    // ==========================================
    // Lower structural tub
    const tubGeo = new THREE.BoxGeometry(2.1, 0.4, 4.2);
    const tub = new THREE.Mesh(tubGeo, darkCarbonMat);
    tub.position.y = 0.42;
    tub.castShadow = true;
    tub.receiveShadow = true;
    this.chassisGroup.add(tub);

    // Sculpted angular upper cabin with chamfered look
    const mainHullGeo = new THREE.BoxGeometry(1.95, 0.65, 3.2);
    const mainHull = new THREE.Mesh(mainHullGeo, armorTealMat);
    mainHull.position.set(0, 0.88, -0.15);
    mainHull.castShadow = true;
    this.chassisGroup.add(mainHull);

    // Front aggressive wedge nose
    const noseGeo = new THREE.ConeGeometry(1.15, 0.95, 4);
    noseGeo.rotateY(Math.PI / 4);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, armorTealMat);
    nose.position.set(0, 0.72, 1.85);
    nose.scale.set(1.2, 0.5, 0.9);
    nose.castShadow = true;
    this.chassisGroup.add(nose);

    // Front splitter / skid plate
    const skidGeo = new THREE.BoxGeometry(1.9, 0.08, 0.75);
    const skid = new THREE.Mesh(skidGeo, brushedTitaniumMat);
    skid.position.set(0, 0.28, 2.15);
    skid.rotation.x = -Math.PI * 0.12;
    this.chassisGroup.add(skid);

    // ==========================================
    // 2. PANORAMIC COCKPIT CANOPY
    // ==========================================
    const visorGeo = new THREE.BoxGeometry(1.75, 0.48, 1.35);
    const visor = new THREE.Mesh(visorGeo, cockpitGlassMat);
    visor.position.set(0, 1.25, 0.45);
    visor.rotation.x = -Math.PI * 0.1;
    this.chassisGroup.add(visor);

    // Cockpit interior HUD glow strip
    const hudBarGeo = new THREE.BoxGeometry(1.2, 0.04, 0.04);
    const hudBar = new THREE.Mesh(hudBarGeo, neonCyanMat);
    hudBar.position.set(0, 1.15, 0.65);
    this.chassisGroup.add(hudBar);

    // Cockpit rollcage struts
    const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
    const leftStrut = new THREE.Mesh(strutGeo, brushedTitaniumMat);
    leftStrut.position.set(-0.85, 1.2, 0.45);
    leftStrut.rotation.x = -Math.PI * 0.1;
    leftStrut.rotation.z = Math.PI * 0.08;
    this.chassisGroup.add(leftStrut);

    const rightStrut = new THREE.Mesh(strutGeo, brushedTitaniumMat);
    rightStrut.position.set(0.85, 1.2, 0.45);
    rightStrut.rotation.x = -Math.PI * 0.1;
    rightStrut.rotation.z = -Math.PI * 0.08;
    this.chassisGroup.add(rightStrut);

    // ==========================================
    // 3. REAR DECK, SPOILER & AERO
    // ==========================================
    // Thermal insulation gold deck for life-support instruments
    const goldPackGeo = new THREE.BoxGeometry(1.5, 0.22, 1.1);
    const goldPack = new THREE.Mesh(goldPackGeo, goldFoilMat);
    goldPack.position.set(0, 1.05, -1.25);
    this.chassisGroup.add(goldPack);

    // RTG (Radioisotope Thermoelectric Generator) with cooling fin array
    const rtgCoreGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.7, 12);
    rtgCoreGeo.rotateZ(Math.PI / 2);
    const rtgCore = new THREE.Mesh(rtgCoreGeo, brushedTitaniumMat);
    rtgCore.position.set(0, 1.25, -1.35);
    this.chassisGroup.add(rtgCore);

    for (let f = -3; f <= 3; f++) {
      const finGeo = new THREE.BoxGeometry(0.03, 0.38, 0.38);
      const fin = new THREE.Mesh(finGeo, darkCarbonMat);
      fin.position.set(f * 0.08, 1.25, -1.35);
      this.chassisGroup.add(fin);
    }

    // High-downforce carbon fiber rear wing
    const wingGeo = new THREE.BoxGeometry(2.35, 0.06, 0.45);
    const wing = new THREE.Mesh(wingGeo, darkCarbonMat);
    wing.position.set(0, 1.55, -2.15);
    wing.rotation.x = Math.PI * 0.04;
    this.chassisGroup.add(wing);

    // Wing vertical endplates with cyan edge highlights
    const endplateGeo = new THREE.BoxGeometry(0.05, 0.35, 0.55);
    const leftEndplate = new THREE.Mesh(endplateGeo, copperRimMat);
    leftEndplate.position.set(-1.18, 1.55, -2.15);
    this.chassisGroup.add(leftEndplate);

    const rightEndplate = new THREE.Mesh(endplateGeo, copperRimMat);
    rightEndplate.position.set(1.18, 1.55, -2.15);
    this.chassisGroup.add(rightEndplate);

    // Wing support pylons
    const pylonGeo = new THREE.BoxGeometry(0.06, 0.65, 0.2);
    const leftPylon = new THREE.Mesh(pylonGeo, brushedTitaniumMat);
    leftPylon.position.set(-0.65, 1.25, -2.05);
    leftPylon.rotation.x = Math.PI * 0.15;
    this.chassisGroup.add(leftPylon);

    const rightPylon = new THREE.Mesh(pylonGeo, brushedTitaniumMat);
    rightPylon.position.set(0.65, 1.25, -2.05);
    rightPylon.rotation.x = Math.PI * 0.15;
    this.chassisGroup.add(rightPylon);

    // ==========================================
    // 4. SEXY REAR CYBER LIGHTBAR & EXHAUST
    // ==========================================
    // Full-width continuous glowing cyberpunk neon lightbar across the rear
    const lightbarGeo = new THREE.BoxGeometry(2.0, 0.08, 0.06);
    const lightbar = new THREE.Mesh(lightbarGeo, neonRedLightbarMat);
    lightbar.position.set(0, 0.76, -2.25);
    this.chassisGroup.add(lightbar);

    // Rear diffusor fins
    for (let d = -2; d <= 2; d++) {
      const diffGeo = new THREE.BoxGeometry(0.04, 0.22, 0.55);
      const diff = new THREE.Mesh(diffGeo, darkCarbonMat);
      diff.position.set(d * 0.35, 0.3, -2.2);
      this.chassisGroup.add(diff);
    }

    // ==========================================
    // 5. TWIN HYPER-DRIVE NITRO THRUSTERS
    // ==========================================
    const nozzleOuterGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.8, 16);
    nozzleOuterGeo.rotateX(Math.PI / 2);

    const nozzleInnerGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.82, 16);
    nozzleInnerGeo.rotateX(Math.PI / 2);

    // Left Thruster
    const leftNozzle = new THREE.Mesh(nozzleOuterGeo, darkCarbonMat);
    leftNozzle.position.set(-0.62, 0.58, -2.4);
    this.chassisGroup.add(leftNozzle);

    const leftNozzleInner = new THREE.Mesh(nozzleInnerGeo, brushedTitaniumMat);
    leftNozzleInner.position.set(-0.62, 0.58, -2.4);
    this.chassisGroup.add(leftNozzleInner);

    // Right Thruster
    const rightNozzle = new THREE.Mesh(nozzleOuterGeo, darkCarbonMat);
    rightNozzle.position.set(0.62, 0.58, -2.4);
    this.chassisGroup.add(rightNozzle);

    const rightNozzleInner = new THREE.Mesh(nozzleInnerGeo, brushedTitaniumMat);
    rightNozzleInner.position.set(0.62, 0.58, -2.4);
    this.chassisGroup.add(rightNozzleInner);

    // Thruster Plasma Glow Discs (Cyan/Blue ion plasma)
    const glowGeo = new THREE.CircleGeometry(0.24, 16);
    glowGeo.rotateY(Math.PI);

    const glowMatL = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.15 });
    const glowL = new THREE.Mesh(glowGeo, glowMatL);
    glowL.position.set(-0.62, 0.58, -2.82);
    this.chassisGroup.add(glowL);

    const glowMatR = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.15 });
    const glowR = new THREE.Mesh(glowGeo, glowMatR);
    glowR.position.set(0.62, 0.58, -2.82);
    this.chassisGroup.add(glowR);

    this.thrusterGlows = [glowL, glowR];

    // Rear Thruster PointLight
    this.thrusterLight = new THREE.PointLight(0x00e5ff, 0, 16);
    this.thrusterLight.position.set(0, 0.58, -2.9);
    this.chassisGroup.add(this.thrusterLight);

    // ==========================================
    // 6. EXPEDITION MAST & SOLAR PANELS
    // ==========================================
    // Sensor / Pancam optical mast
    const mastGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.25, 8);
    const mast = new THREE.Mesh(mastGeo, brushedTitaniumMat);
    mast.position.set(0.65, 1.65, -0.7);
    this.chassisGroup.add(mast);

    // Triple optical lens sensor head
    const headGeo = new THREE.BoxGeometry(0.35, 0.18, 0.22);
    const head = new THREE.Mesh(headGeo, armorTealMat);
    head.position.set(0.65, 2.25, -0.7);
    this.chassisGroup.add(head);

    const lensGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12);
    lensGeo.rotateX(Math.PI / 2);
    const lens1 = new THREE.Mesh(lensGeo, neonCyanMat);
    lens1.position.set(0.58, 2.25, -0.58);
    this.chassisGroup.add(lens1);
    const lens2 = new THREE.Mesh(lensGeo, neonCyanMat);
    lens2.position.set(0.72, 2.25, -0.58);
    this.chassisGroup.add(lens2);

    // Articulated Parabolic High-Gain Dish
    const dishMastGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
    const dishMast = new THREE.Mesh(dishMastGeo, brushedTitaniumMat);
    dishMast.position.set(-0.65, 1.35, -0.7);
    this.chassisGroup.add(dishMast);

    const dishGeo = new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
    const dish = new THREE.Mesh(dishGeo, goldFoilMat);
    dish.position.set(-0.65, 1.65, -0.7);
    dish.rotation.x = Math.PI * 0.35;
    dish.rotation.y = -Math.PI * 0.2;
    this.chassisGroup.add(dish);

    // ==========================================
    // 7. FRONT HIGH-OUTPUT LED LIGHTBARS
    // ==========================================
    const headlightBarGeo = new THREE.BoxGeometry(0.65, 0.1, 0.08);
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftLightMesh = new THREE.Mesh(headlightBarGeo, headlightMat);
    leftLightMesh.position.set(-0.65, 0.58, 2.15);
    leftLightMesh.rotation.y = -0.15;
    this.chassisGroup.add(leftLightMesh);

    const rightLightMesh = new THREE.Mesh(headlightBarGeo, headlightMat);
    rightLightMesh.position.set(0.65, 0.58, 2.15);
    rightLightMesh.rotation.y = 0.15;
    this.chassisGroup.add(rightLightMesh);

    const spotLightL = new THREE.SpotLight(0xfff6ea, 2.8, 70, Math.PI * 0.28, 0.35);
    spotLightL.position.set(-0.65, 0.58, 2.2);
    spotLightL.target.position.set(-0.65, -0.5, 30);
    this.chassisGroup.add(spotLightL);
    this.chassisGroup.add(spotLightL.target);

    const spotLightR = new THREE.SpotLight(0xfff6ea, 2.8, 70, Math.PI * 0.28, 0.35);
    spotLightR.position.set(0.65, 0.58, 2.2);
    spotLightR.target.position.set(0.65, -0.5, 30);
    this.chassisGroup.add(spotLightR);
    this.chassisGroup.add(spotLightR.target);

    this.headlights = [spotLightL, spotLightR];

    // ==========================================
    // 8. HIGH-DETAIL 4-WHEEL SUSPENSION ASSEMBLIES
    // ==========================================
    const tireRadius = 0.58;
    const tireWidth = 0.55;

    // Heavy-duty off-road tire cylinder
    const tireGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 24);
    tireGeo.rotateZ(Math.PI / 2);

    // Lightweight forged alloy rim
    const rimGeo = new THREE.CylinderGeometry(tireRadius * 0.62, tireRadius * 0.62, tireWidth * 1.02, 16);
    rimGeo.rotateZ(Math.PI / 2);

    // Central hub nut
    const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, tireWidth * 1.08, 8);
    hubGeo.rotateZ(Math.PI / 2);

    const wheelPositions = [
      { x: -1.48, y: 0.55, z:  1.42, isFront: true,  isLeft: true },  // FL
      { x:  1.48, y: 0.55, z:  1.42, isFront: true,  isLeft: false }, // FR
      { x: -1.48, y: 0.55, z: -1.42, isFront: false, isLeft: true },  // RL
      { x:  1.48, y: 0.55, z: -1.42, isFront: false, isLeft: false }  // RR
    ];

    this.wheelAssemblies = [];

    for (let i = 0; i < wheelPositions.length; i++) {
      const wPos = wheelPositions[i];

      // Steering & Suspension Pivot
      const pivotGroup = new THREE.Group();
      pivotGroup.position.set(wPos.x, wPos.y, wPos.z);
      this.group.add(pivotGroup);

      // Wishbone Suspension Arm linking chassis to wheel
      const armGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.65, 8);
      armGeo.rotateZ(wPos.isLeft ? -Math.PI / 3 : Math.PI / 3);
      const armMesh = new THREE.Mesh(armGeo, brushedTitaniumMat);
      armMesh.position.set(wPos.isLeft ? 0.25 : -0.25, 0.12, 0);
      pivotGroup.add(armMesh);

      // Hydraulic shock absorber cylinder
      const shockGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8);
      const shockMesh = new THREE.Mesh(shockGeo, chromeMat);
      shockMesh.position.set(wPos.isLeft ? 0.22 : -0.22, 0.2, 0);
      shockMesh.rotation.z = wPos.isLeft ? -0.3 : 0.3;
      pivotGroup.add(shockMesh);

      // Rotating Wheel Container
      const wheelContainer = new THREE.Group();
      pivotGroup.add(wheelContainer);

      const tireMesh = new THREE.Mesh(tireGeo, tireRubberMat);
      tireMesh.castShadow = true;
      wheelContainer.add(tireMesh);

      const rimMesh = new THREE.Mesh(rimGeo, copperRimMat);
      wheelContainer.add(rimMesh);

      const hubMesh = new THREE.Mesh(hubGeo, brushedTitaniumMat);
      wheelContainer.add(hubMesh);

      // Aggressive chevron paddle treads
      const treadCount = 10;
      const treadGeo = new THREE.BoxGeometry(tireWidth * 0.95, 0.09, 0.11);
      for (let t = 0; t < treadCount; t++) {
        const tread = new THREE.Mesh(treadGeo, darkCarbonMat);
        const theta = (t / treadCount) * Math.PI * 2;
        tread.position.set(0, Math.sin(theta) * tireRadius, Math.cos(theta) * tireRadius);
        tread.rotation.x = -theta;
        wheelContainer.add(tread);
      }

      // Brake caliper accent (glowing orange)
      const caliperGeo = new THREE.BoxGeometry(0.12, 0.24, 0.15);
      const caliperMesh = new THREE.Mesh(caliperGeo, copperRimMat);
      caliperMesh.position.set(wPos.isLeft ? 0.14 : -0.14, 0.18, 0);
      pivotGroup.add(caliperMesh);

      this.wheelAssemblies.push({
        pivot: pivotGroup,
        wheelContainer,
        restPos: new THREE.Vector3(wPos.x, wPos.y, wPos.z),
        isFront: wPos.isFront,
        rotation: 0
      });
    }
  }

  setNitroVisuals(active, intensity = 1.0) {
    const opacity = active ? THREE.MathUtils.clamp(intensity * 0.95, 0.4, 1.0) : 0.15;
    for (const glow of this.thrusterGlows) {
      glow.material.opacity = opacity;
    }
    this.thrusterLight.intensity = active ? intensity * 9.0 : 0.4;
  }
}
