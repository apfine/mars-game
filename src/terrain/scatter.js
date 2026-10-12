import * as THREE from 'three';
import { getMarsHeight, simplex2D } from './noise.js';

// Instanced Martian rocks & terrain scatter for maximum mobile & PC performance
export class MarsScatterManager {
  constructor(scene) {
    this.scene = scene;
    this.rockCount = 2000;
    this.areaSize = 360; // 360m radius around player
    
    this.initRockInstances();
    this.initPointsOfInterest();
  }

  initRockInstances() {
    // Low-poly faceted Martian rock geometry
    const rockGeo = new THREE.DodecahedronGeometry(0.85, 1);
    
    // Mars rock material with basaltic and iron-rich reddish shades
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x6e392a,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true
    });

    this.instancedRocks = new THREE.InstancedMesh(rockGeo, rockMat, this.rockCount);
    this.instancedRocks.castShadow = true;
    this.instancedRocks.receiveShadow = true;

    this.dummy = new THREE.Object3D();
    this.rockData = [];

    // Prepopulate rock relative offsets
    for (let i = 0; i < this.rockCount; i++) {
      const radius = 10 + Math.sqrt(Math.random()) * (this.areaSize * 0.5);
      const angle = Math.random() * Math.PI * 2;
      const rx = Math.cos(angle) * radius;
      const rz = Math.sin(angle) * radius;
      const scale = 0.3 + Math.random() * 0.9;
      
      this.rockData.push({
        rx,
        rz,
        scaleX: scale * (0.8 + Math.random() * 0.4),
        scaleY: scale * (0.4 + Math.random() * 0.5), // flattened like wind-eroded stones
        scaleZ: scale * (0.8 + Math.random() * 0.4),
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI
      });
    }

    this.scene.add(this.instancedRocks);
    this.lastCenter = new THREE.Vector2(1e9, 1e9);
  }

  initPointsOfInterest() {
    this.poiGroup = new THREE.Group();
    this.scene.add(this.poiGroup);
    this.pois = [];

    // Deterministic procedural POIs scattered across the map
    // E.g. grid of 800m x 800m sectors
    this.activePoiMeshes = new Map();
  }

  getSectorPOI(sx, sz) {
    const key = `${sx},${sz}`;
    const hash = Math.abs(simplex2D(sx * 17.3, sz * 23.9));
    if (hash < 0.25) return null; // not every sector has a POI

    const typeIdx = Math.floor(hash * 4) % 4;
    const types = ['Relic Rover', 'Weather Station', 'Alien Monolith', 'Crater Outpost'];
    const type = types[typeIdx];

    const posX = (sx + 0.3 + (hash % 0.4)) * 700;
    const posZ = (sz + 0.3 + ((hash * 13) % 0.4)) * 700;
    const posY = getMarsHeight(posX, posZ);

    return {
      id: key,
      name: `${type} #${Math.floor(hash * 999)}`,
      type,
      position: new THREE.Vector3(posX, posY, posZ)
    };
  }

  createPOIMesh(poi) {
    const group = new THREE.Group();
    group.position.copy(poi.position);

    if (poi.type === 'Alien Monolith') {
      const geo = new THREE.BoxGeometry(2, 8, 0.5);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x111115,
        roughness: 0.1,
        metalness: 0.95
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 4;
      group.add(m);

      // Eerie blue pulse light
      const light = new THREE.PointLight(0x00d4ff, 3, 20);
      light.position.y = 5;
      group.add(light);
    } else if (poi.type === 'Weather Station') {
      // Antenna tower & solar array
      const mastGeo = new THREE.CylinderGeometry(0.2, 0.4, 7, 8);
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8 });
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.y = 3.5;
      group.add(mast);

      // Beacon light blinking
      const beaconGeo = new THREE.SphereGeometry(0.4, 8, 8);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = 7.2;
      group.add(beacon);

      const pLight = new THREE.PointLight(0xff3322, 2, 25);
      pLight.position.y = 7.2;
      group.add(pLight);
    } else {
      // Research dome / rover chassis
      const domeGeo = new THREE.SphereGeometry(3.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.3,
        metalness: 0.7
      });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      group.add(dome);
    }

    return group;
  }

  update(playerPos) {
    // Only update scatter if moved significantly
    const distMoved = Math.hypot(playerPos.x - this.lastCenter.x, playerPos.z - this.lastCenter.y);
    if (distMoved > 25) {
      this.lastCenter.set(playerPos.x, playerPos.z);
      
      const halfSize = this.areaSize * 0.5;
      for (let i = 0; i < this.rockCount; i++) {
        const data = this.rockData[i];
        
        // Wrap rock around player
        let wx = playerPos.x + data.rx;
        let wz = playerPos.z + data.rz;
        
        // Snap to grid of areaSize to seamlessly wrap
        wx = ((wx - (playerPos.x - halfSize)) % this.areaSize + this.areaSize) % this.areaSize + (playerPos.x - halfSize);
        wz = ((wz - (playerPos.z - halfSize)) % this.areaSize + this.areaSize) % this.areaSize + (playerPos.z - halfSize);

        const wy = getMarsHeight(wx, wz);

        this.dummy.position.set(wx, wy + data.scaleY * 0.4, wz);
        this.dummy.rotation.set(data.rotX, data.rotY, data.rotZ);
        this.dummy.scale.set(data.scaleX, data.scaleY, data.scaleZ);
        this.dummy.updateMatrix();

        this.instancedRocks.setMatrixAt(i, this.dummy.matrix);
      }
      this.instancedRocks.instanceMatrix.needsUpdate = true;
    }

    // Update nearby POIs
    const currentSx = Math.floor(playerPos.x / 700);
    const currentSz = Math.floor(playerPos.z / 700);
    const neededPoiKeys = new Set();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const sx = currentSx + dx;
        const sz = currentSz + dz;
        const poi = this.getSectorPOI(sx, sz);
        if (poi) {
          neededPoiKeys.add(poi.id);
          if (!this.activePoiMeshes.has(poi.id)) {
            const meshGroup = this.createPOIMesh(poi);
            this.poiGroup.add(meshGroup);
            this.activePoiMeshes.set(poi.id, { poi, mesh: meshGroup });
          }
        }
      }
    }

    // Clean up far POIs
    for (const [key, item] of this.activePoiMeshes.entries()) {
      if (!neededPoiKeys.has(key)) {
        this.poiGroup.remove(item.mesh);
        this.activePoiMeshes.delete(key);
      }
    }
  }

  getNearbyPOIs(playerPos, maxDist = 3000) {
    const list = [];
    for (const item of this.activePoiMeshes.values()) {
      const dist = playerPos.distanceTo(item.poi.position);
      if (dist < maxDist) {
        list.push({
          id: item.poi.id,
          name: item.poi.name,
          position: item.poi.position,
          distance: dist
        });
      }
    }
    return list;
  }
}
