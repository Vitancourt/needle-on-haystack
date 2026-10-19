import * as THREE from 'three';
import { MOUND_RADIUS, moundHeightAt } from './constants.ts';
import { mulberry32 } from './rng.ts';

/** Average hay colour; the needle blends towards it at low contrast. */
export const HAY_COLOR = new THREE.Color().setHSL(0.12, 0.55, 0.5);

const STRAND_LENGTH = 1.2;
const UNDERLAY_DROP = 0.75;

export class Haystack {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly total: number;

  constructor(seed: number, hayCount: number) {
    const rand = mulberry32(seed);
    this.total = hayCount;

    // One instanced mesh = one draw call for every strand.
    const geometry = new THREE.CylinderGeometry(0.03, 0.02, STRAND_LENGTH, 3, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, hayCount);

    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YZX';
    const color = new THREE.Color();
    for (let i = 0; i < hayCount; i++) {
      const r = MOUND_RADIUS * Math.sqrt(rand());
      const theta = rand() * Math.PI * 2;
      const surface = moundHeightAt(r);
      // Bias strands towards the surface so the outside looks dense.
      const y = Math.max(0, surface - Math.pow(rand(), 1.5) * 2);
      dummy.position.set(r * Math.cos(theta), y, r * Math.sin(theta));
      dummy.rotation.set(0, rand() * Math.PI * 2, Math.PI / 2 + (rand() - 0.5) * 2.2);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.11 + rand() * 0.04, 0.45 + rand() * 0.25, 0.38 + rand() * 0.22);
      this.mesh.setColorAt(i, color);
    }
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    // Solid core just under the surface so you can't see through gaps.
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const r = (i / 24) * MOUND_RADIUS;
      profile.push(new THREE.Vector2(r, Math.max(0, moundHeightAt(r) - UNDERLAY_DROP)));
    }
    const core = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 32),
      new THREE.MeshLambertMaterial({ color: 0x6b5120, side: THREE.DoubleSide }),
    );
    core.position.y = 0.01;
    core.castShadow = true;
    core.receiveShadow = true;
    this.group.add(core);
  }

  /** Render only a fraction of the strands (strands are randomly ordered, so this thins evenly). */
  setDensity(scale: number): void {
    this.mesh.count = Math.max(1, Math.floor(this.total * scale));
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.mesh.dispose();
  }
}
