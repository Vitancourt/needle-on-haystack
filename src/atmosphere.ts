import * as THREE from 'three';
import { BARN_HALF, BARN_WALL_HEIGHT, MOUND_RADIUS } from './constants.ts';
import { mulberry32 } from './rng.ts';

function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,210,0.9)');
  grad.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Slowly drifting dust motes that catch the lantern light. */
export class Dust {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly phase: Float32Array;
  private t = 0;

  constructor(count = 220) {
    const rand = mulberry32(7);
    this.positions = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (rand() * 2 - 1) * (BARN_HALF - 1);
      this.positions[i * 3 + 1] = 0.5 + rand() * (BARN_WALL_HEIGHT + 1);
      this.positions[i * 3 + 2] = (rand() * 2 - 1) * (BARN_HALF - 1);
      this.phase[i] = rand() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: softDot(),
        size: 0.09,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.points.frustumCulled = false;
  }

  update(dt: number): void {
    this.t += dt;
    const p = this.positions;
    for (let i = 0; i < this.phase.length; i++) {
      const ph = this.phase[i];
      p[i * 3] += Math.sin(this.t * 0.3 + ph) * 0.1 * dt;
      p[i * 3 + 1] += (0.03 + Math.sin(this.t * 0.2 + ph) * 0.02) * dt;
      p[i * 3 + 2] += Math.cos(this.t * 0.25 + ph) * 0.1 * dt;
      if (p[i * 3 + 1] > BARN_WALL_HEIGHT + 1) p[i * 3 + 1] = 0.5;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Loose straw scattered on the floor around the pile. */
export function createLooseHay(count = 1400): THREE.InstancedMesh {
  const rand = mulberry32(21);
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.018, 0.012, 0.9, 3, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    count,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = MOUND_RADIUS * 0.85 + Math.pow(rand(), 1.6) * 8;
    const a = rand() * Math.PI * 2;
    dummy.position.set(Math.cos(a) * r, 0.03 + rand() * 0.05, Math.sin(a) * r);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, Math.PI / 2 + (rand() - 0.5) * 0.3);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.11 + rand() * 0.04, 0.4 + rand() * 0.25, 0.35 + rand() * 0.2);
    mesh.setColorAt(i, color);
  }
  mesh.receiveShadow = true;
  return mesh;
}
