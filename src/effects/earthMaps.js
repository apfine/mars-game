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
  const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=512;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#aaa9a3'; ctx.fillRect(0,0,1024,512);
  for(let i=0;i<450;i++) {
    const x=(i*173.31)%1024,y=(i*97.77)%512,r=2+(i*7.13)%24;
    const gradient=ctx.createRadialGradient(x-2,y-2,1,x,y,r);
    gradient.addColorStop(0,'#777873'); gradient.addColorStop(.72,'#979892'); gradient.addColorStop(1,'#c1c0b8');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(x,y,r,r*.8,0,0,Math.PI*2);ctx.fill();
  }
  moonMap=new THREE.CanvasTexture(canvas);moonMap.colorSpace=THREE.SRGBColorSpace;
  return moonMap;
}
