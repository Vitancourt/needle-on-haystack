import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { BARN_HALF, EYE_HEIGHT, STALL_DEPTH, PLAYER_MIN_RADIUS, PLAYER_START_Z } from './constants.ts';

const WALK_SPEED = 4;
const SPRINT_SPEED = 7;

export class Player {
  readonly controls: PointerLockControls;
  private readonly keys = new Set<string>();
  /** Closest the player may get to the middle (keeps them out of the static pile). */
  minRadius = PLAYER_MIN_RADIUS;
  /** Extra obstacle test (the movable pile): return true if the player may not stand at (x, z). */
  blocked: ((x: number, z: number) => boolean) | null = null;

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
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    if (len > 0) {
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED) * dt;
      forward = (forward / len) * speed;
      right = (right / len) * speed;
      this.controls.moveForward(forward);
      this.controls.moveRight(right);
    }
    this.clamp();
    const p = this.camera.position;
    if (this.blocked?.(p.x, p.z)) {
      // Slide along the obstacle if one axis is free, otherwise stay put.
      const nx = p.x;
      const nz = p.z;
      if (!this.blocked(nx, pz)) p.set(nx, p.y, pz);
      else if (!this.blocked(px, nz)) p.set(px, p.y, nz);
      else p.set(px, p.y, pz);
    }
  }

  private clamp(): void {
    const p = this.camera.position;
    p.y = EYE_HEIGHT;
    const limit = BARN_HALF - 0.8;
    const limitX = BARN_HALF - STALL_DEPTH - 0.3;
    p.x = THREE.MathUtils.clamp(p.x, -limitX, limitX);
    p.z = THREE.MathUtils.clamp(p.z, -limit, limit);
    const dist = Math.hypot(p.x, p.z);
    if (dist < this.minRadius) {
      if (dist < 1e-4) {
        p.z = this.minRadius;
      } else {
        const s = this.minRadius / dist;
        p.x *= s;
        p.z *= s;
      }
    }
  }
}
