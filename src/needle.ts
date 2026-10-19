import * as THREE from 'three';
import { MOUND_RADIUS, PICK_DISTANCE, moundHeightAt } from './constants.ts';
import { HAY_COLOR } from './haystack.ts';
import type { LevelConfig } from './levels.ts';
import { mulberry32 } from './rng.ts';

const SILVER = new THREE.Color(0xe6e9f2);

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,180,0.7)');
  grad.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Needle {
  readonly group = new THREE.Group();
  private readonly hitbox: THREE.Mesh;
  private hint: THREE.Sprite | null = null;
  private t = 0;

  constructor(cfg: LevelConfig) {
    const rand = mulberry32(cfg.seed ^ 0x9e3779b9);

    const color = HAY_COLOR.clone().lerp(SILVER, cfg.needleContrast);
    const material = new THREE.MeshPhongMaterial({ color, specular: 0xffffff, shininess: 120 });
    const tipLength = cfg.needleLength * 0.12;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.needleRadius, cfg.needleRadius, cfg.needleLength - tipLength, 8),
      material,
    );
    const tip = new THREE.Mesh(new THREE.ConeGeometry(cfg.needleRadius, tipLength, 8), material);
    tip.position.y = (cfg.needleLength - tipLength) / 2 + tipLength / 2;
    shaft.position.y = -tipLength / 2;
    this.group.add(shaft, tip);

    // Needles are tiny; a generous invisible hitbox keeps clicking fair.
    const hitRadius = Math.max(cfg.needleRadius * 5, 0.035);
    this.hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(hitRadius, hitRadius, cfg.needleLength + 0.06, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.group.add(this.hitbox);

    // Seeded placement: reachable from outside the pile, buried by `needleDepth`.
    const r = MOUND_RADIUS * (0.45 + rand() * 0.45);
    const theta = rand() * Math.PI * 2;
    const y = Math.max(0.12, moundHeightAt(r) - cfg.needleDepth);
    this.group.position.set(r * Math.cos(theta), y, r * Math.sin(theta));
    this.group.rotation.order = 'YZX';
    this.group.rotation.set(0, rand() * Math.PI * 2, Math.PI / 2 + (rand() - 0.5) * 1.2);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  /** True if the ray (already aimed) hits the needle within pick distance. */
  isHit(raycaster: THREE.Raycaster): boolean {
    raycaster.far = PICK_DISTANCE;
    return raycaster.intersectObject(this.hitbox, false).length > 0;
  }

  showHint(): void {
    if (this.hint) return;
    const material = new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
      opacity: 0.4,
    });
    this.hint = new THREE.Sprite(material);
    this.hint.scale.setScalar(0.7);
    this.hint.renderOrder = 10;
    this.group.add(this.hint);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.hint) {
      (this.hint.material as THREE.SpriteMaterial).opacity = 0.3 + 0.2 * Math.sin(this.t * 3);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
    // Shaft and tip share a material; hitbox and sprite have their own.
    const disposed = new Set<THREE.Material>();
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !disposed.has(m)) {
        disposed.add(m);
        (m as THREE.SpriteMaterial).map?.dispose();
        m.dispose();
      }
    });
  }
}
