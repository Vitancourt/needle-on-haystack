import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EYE_HEIGHT, GROUND_HALF, PLAYER_MIN_RADIUS, PLAYER_START_Z } from './constants.ts';

const WALK_SPEED = 4;
const SPRINT_SPEED = 7;

export class Player {
  readonly controls: PointerLockControls;
  private readonly keys = new Set<string>();

  constructor(private readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.controls = new PointerLockControls(camera, dom);
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.controls.addEventListener('unlock', () => this.keys.clear());
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  lock(): void {
    this.controls.lock();
  }

  unlock(): void {
    this.controls.unlock();
  }

  reset(): void {
    this.camera.position.set(0, EYE_HEIGHT, PLAYER_START_Z);
    this.camera.rotation.set(0, 0, 0);
  }

  update(dt: number): void {
    if (!this.controls.isLocked) return;
    const k = this.keys;
    let forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(forward, right);
    if (len > 0) {
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED) * dt;
      forward = (forward / len) * speed;
      right = (right / len) * speed;
      this.controls.moveForward(forward);
      this.controls.moveRight(right);
    }
    this.clamp();
  }

  private clamp(): void {
    const p = this.camera.position;
    p.y = EYE_HEIGHT;
    const limit = GROUND_HALF - 1;
    p.x = THREE.MathUtils.clamp(p.x, -limit, limit);
    p.z = THREE.MathUtils.clamp(p.z, -limit, limit);
    const dist = Math.hypot(p.x, p.z);
    if (dist < PLAYER_MIN_RADIUS) {
      if (dist < 1e-4) {
        p.z = PLAYER_MIN_RADIUS;
      } else {
        const s = PLAYER_MIN_RADIUS / dist;
        p.x *= s;
        p.z *= s;
      }
    }
  }
}
