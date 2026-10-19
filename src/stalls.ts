import * as THREE from 'three';
import { noiseTexture, repeated } from './textures.ts';
import { BARN_HALF, STALL_COUNT, STALL_DEPTH } from './constants.ts';

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Rows of stalls along the +/-x walls, open toward the middle of the barn. */
export function createStalls(): THREE.Group {
  const stalls = new THREE.Group();
  const grain = noiseTexture(128, { base: [128, 92, 56], variance: 0.35, grain: true, seed: 5 });
  const wood = new THREE.MeshStandardMaterial({ map: grain, bumpMap: grain, bumpScale: 1.2, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ map: grain, color: 0x7a5a3a, roughness: 0.85 });
  const strawTex = repeated(noiseTexture(128, { base: [201, 168, 90], variance: 0.3, density: 400, seed: 9 }), 2, 2);
  const straw = new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 });

  const span = (BARN_HALF - 1.5) * 2;
  const width = span / STALL_COUNT;
  const frontX = BARN_HALF - STALL_DEPTH;

  for (const side of [-1, 1]) {
    // Front rail running along the row, with posts at each partition.
    stalls.add(box(0.12, 0.12, span, dark, side * frontX, 1.15, 0));
    stalls.add(box(0.12, 0.12, span, dark, side * frontX, 0.55, 0));

    for (let i = 0; i <= STALL_COUNT; i++) {
      const z = -span / 2 + i * width;
      stalls.add(box(0.25, 2.4, 0.25, dark, side * frontX, 1.2, z));
      stalls.add(box(STALL_DEPTH, 2.0, 0.1, wood, side * (BARN_HALF - STALL_DEPTH / 2), 1.0, z));
    }

    for (let i = 0; i < STALL_COUNT; i++) {
      const z = -span / 2 + (i + 0.5) * width;
      const bedding = box(STALL_DEPTH - 0.2, 0.12, width - 0.3, straw, side * (BARN_HALF - STALL_DEPTH / 2), 0.08, z);
      stalls.add(bedding);
    }
  }
  stalls.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return stalls;
}
