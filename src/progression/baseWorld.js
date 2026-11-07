import * as THREE from 'three';
import { BASE_PLOTS, MODULES } from './content.js';
import { getMarsHeight } from '../terrain/noise.js';

const COLORS = { solar: 0x2a4669, water: 0x53a9c1, greenhouse: 0x5b9c79, habitat: 0xd5c3a0, lab: 0x91a8ce, storage: 0x9a8b78 };

export class BaseWorld {
  constructor(scene, origin) {
    this.scene = scene;
    this.origin = origin;
    this.root = new THREE.Group();
    this.root.name = 'Ares expansion base';
    scene.add(this.root);
    this.anchor = new THREE.Vector3(origin.x + 265, getMarsHeight(origin.x + 265, origin.y - 180), origin.y - 180);
    this.plotMeshes = [];
    this.buildingGroups = new Map();
    this.geometry = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
      sphere: new THREE.SphereGeometry(1, 8, 5),
      ring: new THREE.CircleGeometry(12, 32)
    };
    this.materials = Object.fromEntries(Object.entries(COLORS).map(([type, color]) => [type, new THREE.MeshStandardMaterial({ color, metalness: 0.32, roughness: 0.55 })]));
    this.trim = new THREE.MeshStandardMaterial({ color: 0xe1c58e, metalness: 0.55, roughness: 0.36 });
    this.glass = new THREE.MeshStandardMaterial({ color: 0x9bdcc9, transparent: true, opacity: 0.58, metalness: 0.12, roughness: 0.24, depthWrite: false });
    this.crop = new THREE.MeshStandardMaterial({ color: 0x76ba68, roughness: 0.82 });
    this.plotValid = new THREE.MeshBasicMaterial({ color: 0x6de9b2, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.plotInvalid = new THREE.MeshBasicMaterial({ color: 0xff755f, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthWrite: false });
    this.plotIdle = new THREE.MeshBasicMaterial({ color: 0xc99f63, transparent: true, opacity: 0.21, side: THREE.DoubleSide, depthWrite: false });
    for (const plot of BASE_PLOTS) {
      const ring = new THREE.Mesh(this.geometry.ring, this.plotIdle);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(origin.x + plot.x, getMarsHeight(origin.x + plot.x, origin.y + plot.z) + .12, origin.y + plot.z);
      ring.userData.plotId = plot.id;
      ring.visible = false;
      this.root.add(ring);
      this.plotMeshes.push(ring);
    }
    this.placement = null;
  }

  addPart(group, geometry, material, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  makeBuilding(building) {
    const group = new THREE.Group();
    group.position.set(this.origin.x + building.x, getMarsHeight(this.origin.x + building.x, this.origin.y + building.z), this.origin.y + building.z);
    group.rotation.y = building.rotation * Math.PI / 2;
    const material = this.materials[building.type];
    this.addPart(group, this.geometry.box, this.trim, 0, .35, 0, 23, .7, 23);
    if (building.type === 'solar') {
      for (const side of [-1, 1]) {
        this.addPart(group, this.geometry.box, this.trim, side * 5, 2, 0, .6, 3, .6);
        const panel = this.addPart(group, this.geometry.box, material, side * 5, 4, 0, 9, .25, 15);
        panel.rotation.z = side * .18;
      }
    } else if (building.type === 'water') {
      for (const side of [-1, 1]) this.addPart(group, this.geometry.cylinder, material, side * 5, 4.5, 0, 3.5, 8, 3.5);
      this.addPart(group, this.geometry.box, this.trim, 0, 2.6, 0, 13, .5, 2);
    } else if (building.type === 'greenhouse') {
      this.addPart(group, this.geometry.box, material, 0, 2, 0, 20, 3, 18);
      this.addPart(group, this.geometry.box, this.glass, 0, 5, 0, 19, 3, 17);
      const stem = this.addPart(group, this.geometry.cylinder, this.crop, 0, 6.4, 0, .6, 2, .6);
      stem.name = 'cropStem';
      const leaves = this.addPart(group, this.geometry.sphere, this.crop, 0, 7.5, 0, 2.3, 1.2, 2.3);
      leaves.name = 'cropLeaves';
    } else if (building.type === 'habitat') {
      this.addPart(group, this.geometry.cylinder, material, 0, 4.5, 0, 8, 8, 8);
      this.addPart(group, this.geometry.cylinder, this.trim, 0, 9, 0, 8.5, .6, 8.5);
    } else if (building.type === 'lab') {
      this.addPart(group, this.geometry.box, material, 0, 4.5, 0, 18, 8, 16);
      this.addPart(group, this.geometry.box, this.glass, 0, 6, -8.1, 13, 2, .5);
      this.addPart(group, this.geometry.cylinder, this.trim, 5, 10.5, 2, .4, 4, .4);
    } else {
      this.addPart(group, this.geometry.box, material, 0, 4, 0, 18, 7, 18);
      for (const z of [-6, 0, 6]) this.addPart(group, this.geometry.box, this.trim, 0, 4, z, 19, .28, .28);
    }
    this.root.add(group);
    return group;
  }

  sync(state) {
    const present = new Set(state.buildings.map(item => item.id));
    for (const [id, group] of this.buildingGroups) {
      if (!present.has(id)) { this.root.remove(group); this.buildingGroups.delete(id); }
    }
    for (const building of state.buildings) {
      let group = this.buildingGroups.get(building.id);
      if (!group) { group = this.makeBuilding(building); this.buildingGroups.set(building.id, group); }
      group.position.set(this.origin.x + building.x, getMarsHeight(this.origin.x + building.x, this.origin.y + building.z), this.origin.y + building.z);
      group.rotation.y = building.rotation * Math.PI / 2;
      group.visible = true;
      group.traverse(item => { if (item.isMesh) item.material = item.name.startsWith('crop') ? this.crop : item.material; });
      const progress = building.crop ? building.crop.elapsedMs / building.crop.durationMs : 0;
      const stem = group.getObjectByName('cropStem');
      const leaves = group.getObjectByName('cropLeaves');
      if (stem) stem.visible = Boolean(building.crop);
      if (leaves) { leaves.visible = Boolean(building.crop); leaves.scale.setScalar(.25 + Math.min(1, progress) * .9); }
    }
    const occupied = new Set(state.buildings.map(item => item.plotId));
    for (const marker of this.plotMeshes) {
      marker.visible = Boolean(this.placement) && !occupied.has(marker.userData.plotId);
      marker.material = marker.userData.plotId === this.placement?.plotId
        ? (this.placement.reason ? this.plotInvalid : this.plotValid) : this.plotIdle;
    }
  }

  setPlacement(placement, state) { this.placement = placement; this.sync(state); }
  pick(raycaster) {
    const hit = raycaster.intersectObjects(this.plotMeshes, false).find(item => item.object.visible);
    return hit?.object.userData.plotId || null;
  }
  dispose() {
    this.scene.remove(this.root);
    Object.values(this.geometry).forEach(item => item.dispose());
    [...Object.values(this.materials), this.trim, this.glass, this.crop, this.plotValid, this.plotInvalid, this.plotIdle].forEach(item => item.dispose());
  }
}
