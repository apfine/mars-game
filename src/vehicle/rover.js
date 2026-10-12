import * as THREE from 'three';

// Procedural detailed Mars Rover 3D Model
export class MarsRoverModel {
  constructor() {
    this.group = new THREE.Group();
    this.wheelMeshes = [];
    this.thrusterGlows = [];
    this.headlights = [];
    this.chassisGroup = new THREE.Group();
    this.group.add(this.chassisGroup);

    this.buildRover();
  }

  buildRover() {
    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x3d786e, // Distinctive retro-futuristic teal/sage green (like drune.io!)
      roughness: 0.4,
      metalness: 0.6
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x222428,
      roughness: 0.7,
      metalness: 0.8
    });

    const goldFoilMat = new THREE.MeshStandardMaterial({
      color: 0xe6b800,
      roughness: 0.3,
      metalness: 0.9
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x112233,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85
    });

    const wheelRubberMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,
      roughness: 0.85,
      metalness: 0.2
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd88a38, // Mars copper-orange rim accents
      roughness: 0.3,
      metalness: 0.9
    });

    // --- Main Body / Hull ---
    // Lower rugged chassis plate
    const lowerBodyGeo = new THREE.BoxGeometry(2.2, 0.45, 4.4);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, darkMetalMat);
    lowerBody.position.y = 0.45;
    lowerBody.castShadow = true;
    this.chassisGroup.add(lowerBody);

    // Upper cabin
    const cabinGeo = new THREE.BoxGeometry(2.1, 0.75, 3.2);
    const cabin = new THREE.Mesh(cabinGeo, chassisMat);
    cabin.position.set(0, 0.95, -0.2);
    cabin.castShadow = true;
    this.chassisGroup.add(cabin);

    // Aerodynamic windshield visor
    const visorGeo = new THREE.BoxGeometry(1.9, 0.5, 0.8);
    const visor = new THREE.Mesh(visorGeo, glassMat);
    visor.position.set(0, 1.25, 0.8);
    visor.rotation.x = -Math.PI * 0.12;
    this.chassisGroup.add(visor);

    // Thermal gold insulation pack on rear deck
    const goldDeckGeo = new THREE.BoxGeometry(1.6, 0.3, 1.2);
    const goldDeck = new THREE.Mesh(goldDeckGeo, goldFoilMat);
    goldDeck.position.set(0, 1.05, -1.3);
    this.chassisGroup.add(goldDeck);

    // Sci-Fi Solar panel wings
    const solarWingGeo = new THREE.BoxGeometry(0.7, 0.05, 1.6);
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x0d1f38,
      roughness: 0.2,
      metalness: 0.8
    });
    const leftWing = new THREE.Mesh(solarWingGeo, solarMat);
    leftWing.position.set(-1.45, 1.0, -1.0);
    leftWing.rotation.z = Math.PI * 0.06;
    this.chassisGroup.add(leftWing);

    const rightWing = new THREE.Mesh(solarWingGeo, solarMat);
    rightWing.position.set(1.45, 1.0, -1.0);
    rightWing.rotation.z = -Math.PI * 0.06;
    this.chassisGroup.add(rightWing);

    // High-gain communications dish & sensor mast
    const mastGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8);
    const mast = new THREE.Mesh(mastGeo, darkMetalMat);
    mast.position.set(0.6, 1.7, -0.8);
    this.chassisGroup.add(mast);

    const dishGeo = new THREE.SphereGeometry(0.35, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const dish = new THREE.Mesh(dishGeo, chassisMat);
    dish.position.set(0.6, 2.2, -0.8);
    dish.rotation.x = Math.PI * 0.3;
    this.chassisGroup.add(dish);

    // --- Twin Nitro Rocket Thrusters ---
    const thrusterGeo = new THREE.CylinderGeometry(0.24, 0.35, 0.7, 16);
    thrusterGeo.rotateX(Math.PI / 2);
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x1e1e24, metalness: 0.9, roughness: 0.2 });

    const leftThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    leftThruster.position.set(-0.55, 0.55, -2.35);
    this.chassisGroup.add(leftThruster);

    const rightThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    rightThruster.position.set(0.55, 0.55, -2.35);
    this.chassisGroup.add(rightThruster);

    // Thruster interior flame glow discs
    const glowGeo = new THREE.CircleGeometry(0.22, 16);
    glowGeo.rotateY(Math.PI);
    const glowMat1 = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0 });
    const glowMat2 = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0 });

    const glow1 = new THREE.Mesh(glowGeo, glowMat1);
    glow1.position.set(-0.55, 0.55, -2.71);
    this.chassisGroup.add(glow1);

    const glow2 = new THREE.Mesh(glowGeo, glowMat2);
    glow2.position.set(0.55, 0.55, -2.71);
    this.chassisGroup.add(glow2);

    this.thrusterGlows = [glow1, glow2];

    // Rear Thruster PointLight
    this.thrusterLight = new THREE.PointLight(0x00e1ff, 0, 15);
    this.thrusterLight.position.set(0, 0.55, -2.8);
    this.chassisGroup.add(this.thrusterLight);

    // --- Front LED Headlights ---
    const headlightGeo = new THREE.BoxGeometry(0.4, 0.15, 0.1);
    const headlightLensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const leftHeadlightMesh = new THREE.Mesh(headlightGeo, headlightLensMat);
    leftHeadlightMesh.position.set(-0.75, 0.5, 2.22);
    this.chassisGroup.add(leftHeadlightMesh);

    const rightHeadlightMesh = new THREE.Mesh(headlightGeo, headlightLensMat);
    rightHeadlightMesh.position.set(0.75, 0.5, 2.22);
    this.chassisGroup.add(rightHeadlightMesh);

    const spotLightL = new THREE.SpotLight(0xfff4e0, 2.5, 60, Math.PI * 0.25, 0.4);
    spotLightL.position.set(-0.75, 0.5, 2.3);
    spotLightL.target.position.set(-0.75, -0.5, 25);
    this.chassisGroup.add(spotLightL);
    this.chassisGroup.add(spotLightL.target);

    const spotLightR = new THREE.SpotLight(0xfff4e0, 2.5, 60, Math.PI * 0.25, 0.4);
    spotLightR.position.set(0.75, 0.5, 2.3);
    spotLightR.target.position.set(0.75, -0.5, 25);
    this.chassisGroup.add(spotLightR);
    this.chassisGroup.add(spotLightR.target);

    this.headlights = [spotLightL, spotLightR];

    // --- 4 Wheels ---
    // Wheel geometry (tire + rim + treads)
    const tireRadius = 0.55;
    const tireWidth = 0.5;
    const wheelGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 20);
    wheelGeo.rotateZ(Math.PI / 2);

    const rimGeo = new THREE.CylinderGeometry(tireRadius * 0.6, tireRadius * 0.6, tireWidth * 1.05, 12);
    rimGeo.rotateZ(Math.PI / 2);

    // 4 wheel locations: Front-Left, Front-Right, Rear-Left, Rear-Right
    const wheelPositions = [
      { x: -1.45, y: 0.55, z: 1.45, isFront: true, isLeft: true },  // FL
      { x:  1.45, y: 0.55, z: 1.45, isFront: true, isLeft: false }, // FR
      { x: -1.45, y: 0.55, z: -1.45, isFront: false, isLeft: true }, // RL
      { x:  1.45, y: 0.55, z: -1.45, isFront: false, isLeft: false } // RR
    ];

    this.wheelAssemblies = [];

    for (let i = 0; i < wheelPositions.length; i++) {
      const wPos = wheelPositions[i];
      
      // Steering & suspension pivot
      const pivotGroup = new THREE.Group();
      pivotGroup.position.set(wPos.x, wPos.y, wPos.z);
      this.group.add(pivotGroup);

      // Rotating wheel cylinder
      const wheelContainer = new THREE.Group();
      pivotGroup.add(wheelContainer);

      const tireMesh = new THREE.Mesh(wheelGeo, wheelRubberMat);
      tireMesh.castShadow = true;
      wheelContainer.add(tireMesh);

      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      wheelContainer.add(rimMesh);

      // Deep tread ribs
      const ribCount = 8;
      const ribGeo = new THREE.BoxGeometry(tireWidth * 0.9, 0.08, 0.08);
      for (let r = 0; r < ribCount; r++) {
        const rib = new THREE.Mesh(ribGeo, darkMetalMat);
        const theta = (r / ribCount) * Math.PI * 2;
        rib.position.set(0, Math.sin(theta) * tireRadius, Math.cos(theta) * tireRadius);
        wheelContainer.add(rib);
      }

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
    const opacity = active ? THREE.MathUtils.clamp(intensity, 0.3, 1.0) : 0;
    for (const glow of this.thrusterGlows) {
      glow.material.opacity = opacity;
    }
    this.thrusterLight.intensity = active ? intensity * 8.0 : 0;
  }
}
