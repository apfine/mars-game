import * as THREE from 'three';
let cached;
export function getEarthMaps() {
  if (!cached) {
    const loader = new THREE.TextureLoader();
    const map = loader.load('/textures/earth-blue-marble.webp');
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const roughnessMap = loader.load('/textures/earth-roughness.webp');
    cached = { map, roughnessMap };
  }
  return cached;
}

let moonMap;
export function getMoonMap() {
  if (moonMap) return moonMap;
  moonMap = new THREE.TextureLoader().load('/textures/moon-lroc.jpg');
  moonMap.colorSpace = THREE.SRGBColorSpace;
  moonMap.anisotropy = 4;
  return moonMap;
}
