import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const MODELS = [
  { name: 'Vortex GT', paint: 0xff482d, accent: 0xffaa48, speed: 61 },
  { name: 'Apex R', paint: 0x147dcb, accent: 0x78dfff, speed: 67 },
  { name: 'Nebula S', paint: 0xe5e7ee, accent: 0xb98aff, speed: 58 }
];

export class StarbaseSupercar {
  constructor(scene, index, x, z, yaw, groundHeight) {
    this.spec = MODELS[index];
    this.name = this.spec.name;
    this.group = new THREE.Group();
    this.group.name = `STARBASE_SUPERCAR_${index}`;
    this.group.position.set(x, groundHeight(x, z), z);
    this.group.rotation.y = yaw;
    this.yaw = yaw;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.piloted = false;
    this.buildModel();
    scene.add(this.group);
  }

  buildModel() {
    const paint = new THREE.MeshPhysicalMaterial({ color: this.spec.paint, metalness: 0.72, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x11151c, metalness: 0.48, roughness: 0.35 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x112331, metalness: 0.35, roughness: 0.1, transparent: true, opacity: 0.68 });
    const accent = new THREE.MeshBasicMaterial({ color: this.spec.accent });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xe9faff });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff2636 });
    const alloy = new THREE.MeshStandardMaterial({ color: 0x9ea9b6, metalness: 0.9, roughness: 0.22 });
    const add = (geometry, material, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

    add(new RoundedBoxGeometry(2.18, 0.42, 4.65, 3, 0.18), paint, 0, 0.57, 0);
    add(new RoundedBoxGeometry(1.95, 0.3, 1.25, 3, 0.14), paint, 0, 0.68, 1.83);
    add(new RoundedBoxGeometry(1.96, 0.33, 1.05, 3, 0.13), paint, 0, 0.7, -1.84);
    const canopy = add(new RoundedBoxGeometry(1.66, 0.55, 2.08, 3, 0.25), glass, 0, 1.01, -0.24);
    canopy.rotation.x = -0.055;
    box(1.62, 0.08, 0.95, paint, 0, 1.31, -0.6);
    box(2.15, 0.1, 0.6, carbon, 0, 0.32, 2.28);
    box(2.04, 0.15, 0.38, carbon, 0, 0.35, -2.25);
    box(1.56, 0.06, 0.28, carbon, 0, 1.02, -2.35);
    box(0.07, 0.25, 0.08, carbon, -0.67, 0.9, -2.25);
    box(0.07, 0.25, 0.08, carbon, 0.67, 0.9, -2.25);
    box(0.84, 0.035, 0.48, carbon, 0, 0.88, 1.47); // hood vent
    box(0.84, 0.03, 0.13, accent, 0, 0.91, 1.57);
    for (const side of [-1, 1]) {
      box(0.16, 0.16, 2.7, carbon, side * 1.08, 0.31, 0);
      box(0.42, 0.11, 0.12, lamp, side * 0.73, 0.63, 2.34);
      box(0.54, 0.1, 0.12, tail, side * 0.72, 0.66, -2.34);
      box(0.27, 0.13, 0.23, paint, side * 1.05, 1.0, 0.47); // mirrors
      box(0.08, 0.12, 0.75, accent, side * 1.02, 0.47, 0.15);
      for (const z of [-1.45, 1.43]) {
        const tyre = add(new THREE.CylinderGeometry(0.4, 0.4, 0.27, 24), carbon, side * 1.09, 0.4, z);
        tyre.rotation.z = Math.PI / 2;
        const rim = add(new THREE.CylinderGeometry(0.25, 0.25, 0.29, 12), alloy, side * 1.09, 0.4, z);
        rim.rotation.z = Math.PI / 2;
        const hub = add(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12), accent, side * 1.09, 0.4, z);
        hub.rotation.z = Math.PI / 2;
      }
    }
    // Each silhouette has a distinct rear treatment.
    if (this.name === 'Apex R') {
      box(1.9, 0.08, 0.4, carbon, 0, 1.18, -2.2);
      box(1.78, 0.025, 0.06, accent, 0, 1.23, -2.18);
    } else if (this.name === 'Nebula S') {
      box(1.7, 0.04, 0.22, accent, 0, 0.89, -2.33);
    }
  }

  board() {
    this.piloted = true;
    this.speed = 0;
  }

  disembark() {
    this.piloted = false;
    this.speed = 0;
    return this.group.position.clone();
  }

  updatePiloted(dt, input, groundHeight, resolveCollisions) {
    const throttle = input.throttle || 0;
    const maxSpeed = this.spec.speed * (input.nitro ? 1.25 : 1);
    const target = throttle >= 0 ? throttle * maxSpeed : throttle * maxSpeed * 0.38;
    this.speed = THREE.MathUtils.damp(this.speed, input.handbrake ? 0 : target, input.handbrake ? 8 : 2.8, dt);
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    this.yaw -= (input.steer || 0) * Math.min(1, Math.abs(this.speed) / 6) * Math.sign(this.speed || 1) * 1.7 * dt;
    this.group.position.x += Math.sin(this.yaw) * this.speed * dt;
    this.group.position.z += Math.cos(this.yaw) * this.speed * dt;
    this.group.position.y = groundHeight(this.group.position.x, this.group.position.z);
    resolveCollisions?.(this.group.position, 1.3, this.group.position.y);
    this.group.position.y = groundHeight(this.group.position.x, this.group.position.z);
    this.group.rotation.y = this.yaw;
  }
}

export const SUPERCar_SPECS = MODELS;
