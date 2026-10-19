import * as THREE from 'three';
import pileUrl from './assets/pile.bin?url';
import { BARN_HALF, PLAYER_START_Z } from './constants.ts';
import type { LevelConfig } from './levels.ts';
import type { Needle } from './needle.ts';
import { mulberry32 } from './rng.ts';

type Rapier = typeof import('@dimforge/rapier3d-compat').default;
type World = import('@dimforge/rapier3d-compat').World;
type RigidBody = import('@dimforge/rapier3d-compat').RigidBody;

// The strand size is baked into assets/pile.bin; change it and re-bake (see bakePile).
const STRAND_LENGTH = 1;
const STRAND_RADIUS = 0.04;
const STRAND_VISUAL_RADIUS = 0.034;
const REACH = 4;
const STEP = 1 / 60;
const MIN_STEP = 1 / 120;
const MAX_STEP = 1 / 30;
/** Strands simulated at once; further wake-ups wait until some settle. Keeps frame time bounded. */
const MAX_ACTIVE = 300;
/** Resting/propagation checks cost several wasm calls per strand, so run them every few frames. */
const MANAGE_EVERY = 3;
const FLOATS_PER_STRAND = 7; // x y z qx qy qz qw

// Pouring the pile (only used by bakePile): layers fill a mound, wider layers get more strands.
const MOUND_RADIUS = 4.4;
const MOUND_HEIGHT = 3.8;
const LAYERS = 18;
const STEPS_PER_LAYER = 6;
const SETTLE_STEPS = 110;
const MAX_REST_STEPS = 300;
/** While pouring, overlapping spawns are pushed apart hard; cap speeds so nothing is flung across the barn. */
const POUR_MAX_SPEED = 3;
export const PILE_COUNT = 6000;

// Runtime activation: the settled pile is made of fixed bodies. Strands near a disturbance are switched
// to dynamic and frozen again when they come to rest, so only a small part of the pile is ever simulated.
const CELL = 0.6;
const GRAB_ACTIVATE_RADIUS = 1;
const PROPAGATE_RADIUS = 0.5;
/** Settled strands this close (horizontally) to the player, between ankle and head height, block walking. */
const PLAYER_BLOCK_RADIUS = 0.45;
const MOVING_SPEED = 0.35;
const FREEZE_SPEED = 0.12;
const FREEZE_ANGULAR = 0.8;
const FREEZE_FRAMES = 40;
const MAX_ACTIVE_FRAMES = 60 * 8;
const FIXED = 0;
const ACTIVE = 1;
const HELD = 2;

let rapier: Promise<Rapier> | null = null;
let pile: Promise<Float32Array> | null = null;

function loadRapier(): Promise<Rapier> {
  rapier ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    await m.default.init();
    return m.default;
  });
  return rapier;
}

/** The pre-simulated, fully settled pile (strand poses), baked offline so levels start instantly. */
function loadPile(): Promise<Float32Array> {
  pile ??= fetch(pileUrl)
    .then((r) => r.arrayBuffer())
    .then((buf) => new Float32Array(buf));
  return pile;
}

/**
 * Dev tool: pour a fresh pile with physics and simulate until it is at rest.
 * Returns strand poses as [x y z qx qy qz qw] * count, ready to save as assets/pile.bin.
 */
export async function bakePile(
  count = PILE_COUNT,
  seed = 1,
  opts: { iterations?: number; pgs?: number; restSteps?: number; damping?: number } = {},
): Promise<{ data: Float32Array; asleep: number; speeds: number[] }> {
  const R = await loadRapier();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  if (opts.iterations) world.numSolverIterations = opts.iterations;
  if (opts.pgs) world.integrationParameters.numInternalPgsIterations = opts.pgs;
  world.createCollider(R.ColliderDesc.cuboid(BARN_HALF, 0.5, BARN_HALF).setTranslation(0, -0.48, 0).setFriction(0.9));
  const rand = mulberry32(seed);
  const q = new THREE.Quaternion();
  const bodies: RigidBody[] = [];
  const halfHeight = (STRAND_LENGTH - 2 * STRAND_RADIUS) / 2;
  const weights = Array.from({ length: LAYERS }, (_, k) => 1 - (k + 0.5) / LAYERS);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const dy = MOUND_HEIGHT / LAYERS;

  const capSpeeds = (): void => {
    for (const body of bodies) {
      if (body.isSleeping()) continue;
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > POUR_MAX_SPEED) {
        const k = POUR_MAX_SPEED / speed;
        body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, false);
      }
    }
  };

  let spawned = 0;
  for (let layer = 0; layer < LAYERS; layer++) {
    const target = layer === LAYERS - 1 ? count : spawned + Math.round((count * weights[layer]) / weightSum);
    while (spawned < Math.min(target, count)) {
      const y = (layer + 0.5) * dy;
      const radius = MOUND_RADIUS * Math.sqrt(Math.max(0.04, 1 - y / MOUND_HEIGHT)) * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      q.set(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(radius * Math.cos(a), y + 0.25 + rand() * 0.25, radius * Math.sin(a))
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinearDamping(opts.damping ?? 1.2)
          .setAngularDamping(opts.damping ? opts.damping * 1.7 : 2),
      );
      world.createCollider(R.ColliderDesc.capsule(halfHeight, STRAND_RADIUS).setFriction(1.4).setRestitution(0).setDensity(0.5), body);
      bodies.push(body);
      spawned++;
    }
    for (let s = 0; s < STEPS_PER_LAYER; s++) {
      world.step();
      capSpeeds();
    }
  }
  for (let s = 0; s < SETTLE_STEPS; s++) {
    world.step();
    capSpeeds();
  }
  // Let the heap creep until Rapier itself puts every strand to sleep.
  let asleep = 0;
  for (let s = 0; s < (opts.restSteps ?? MAX_REST_STEPS); s++) {
    world.step();
    if (s % 25 === 0) {
      asleep = bodies.filter((b) => b.isSleeping()).length;
      if (asleep === bodies.length) break;
    }
  }
  const data = new Float32Array(count * FLOATS_PER_STRAND);
  bodies.forEach((b, i) => {
    const t = b.translation();
    const r = b.rotation();
    data.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], i * FLOATS_PER_STRAND);
  });
  const speeds = bodies.map((b) => {
    const v = b.linvel();
    return Math.hypot(v.x, v.y, v.z);
  });
  world.free();
  return { data, asleep, speeds };
}

/** A pile of loose strands simulated with rigid-body physics: they can be picked up, carried and dropped. */
export class PhysicsHay {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly bodies: RigidBody[] = [];
  private readonly state: Uint8Array;
  private readonly lowFrames: Uint16Array;
  private readonly activeFrames: Uint16Array;
  /** Current centre of every strand (kept fresh when a strand freezes), for neighbour lookups. */
  private readonly centers: Float32Array;
  private readonly grid = new Map<number, number[]>();
  private readonly cellOf: Int32Array;
  private readonly active = new Set<number>();
  private needleIndex = -1;
  private readonly colliderToStrand = new Map<number, number>();
  private readonly dummy = new THREE.Object3D();
  private readonly camPos = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();
  private player!: RigidBody;
  private needleBody!: RigidBody;
  private held: { index: number; distance: number } | null = null;
  private frame = 0;

  private constructor(
    private readonly R: Rapier,
    private readonly world: World,
    private readonly needle: Needle,
    count: number,
  ) {
    this.state = new Uint8Array(count);
    this.lowFrames = new Uint16Array(count);
    this.activeFrames = new Uint16Array(count);
    this.centers = new Float32Array(count * 3);
    this.cellOf = new Int32Array(count);
    const geometry = new THREE.CylinderGeometry(STRAND_VISUAL_RADIUS, STRAND_VISUAL_RADIUS * 0.8, STRAND_LENGTH, 5, 1);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  static async create(cfg: LevelConfig, needle: Needle, barn: THREE.Object3D): Promise<PhysicsHay> {
    const [R, data] = await Promise.all([loadRapier(), loadPile()]);
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = STEP;
    world.numSolverIterations = 2;
    world.numInternalPgsIterations = 1;
    const hay = new PhysicsHay(R, world, needle, data.length / FLOATS_PER_STRAND);
    hay.addBarn(barn);
    hay.addPlayer();
    hay.placePile(cfg, data);
    return hay;
  }

  /** Advance the simulation and copy body transforms to the meshes. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    camera.getWorldPosition(this.camPos);
    camera.getWorldDirection(this.camDir);
    this.movePlayer();
    // One variable-length step per frame: a slow frame slows the hay down instead of snowballing into more steps.
    if (this.held) this.holdAt(this.held);
    this.world.timestep = THREE.MathUtils.clamp(dt, MIN_STEP, MAX_STEP);
    this.world.step();
    if (++this.frame % MANAGE_EVERY === 0) this.manageActive();
    this.sync();
  }

  /** True if the pile is in the way of a player standing at (x, z). Taking strands away opens a path. */
  blocksPlayer(x: number, z: number): boolean {
    const r = PLAYER_BLOCK_RADIUS;
    const r2 = r * r;
    const cy0 = Math.floor(0.3 / CELL);
    const cy1 = Math.floor(1.9 / CELL);
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
          const list = this.grid.get(((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512));
          if (!list) continue;
          for (const i of list) {
            if (this.state[i] !== FIXED) continue;
            const y = this.centers[i * 3 + 1];
            if (y < 0.3 || y > 1.9) continue;
            const dx = this.centers[i * 3] - x;
            const dz = this.centers[i * 3 + 2] - z;
            if (dx * dx + dz * dz <= r2) return true;
          }
        }
      }
    }
    return false;
  }

  get isHolding(): boolean {
    return this.held !== null;
  }

  /** Pick up the strand under the crosshair; returns false if there is none in reach. */
  grab(raycaster: THREE.Raycaster): boolean {
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    const hit = this.world.castRay(
      new this.R.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }),
      REACH,
      true,
      this.R.QueryFilterFlags.EXCLUDE_KINEMATIC,
    );
    if (!hit) return false;
    const index = this.colliderToStrand.get(hit.collider.handle);
    if (index === undefined || index === this.needleIndex) return false;
    // Wake the neighbours first: they are what falls into the gap this strand leaves.
    this.activateAround(this.centers[index * 3], this.centers[index * 3 + 1], this.centers[index * 3 + 2], GRAB_ACTIVATE_RADIUS);
    this.bodies[index].setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
    this.state[index] = HELD;
    this.active.delete(index);
    this.held = { index, distance: THREE.MathUtils.clamp(hit.timeOfImpact, 0.9, REACH - 1) };
    return true;
  }

  /** Let go of the held strand; it falls from wherever it is. */
  release(): void {
    if (!this.held) return;
    const index = this.held.index;
    const body = this.bodies[index];
    body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.state[index] = ACTIVE;
    this.lowFrames[index] = 0;
    this.activeFrames[index] = 0;
    this.active.add(index);
    this.held = null;
  }

  dispose(): void {
    this.world.free();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }

  // ---- setup -------------------------------------------------------------

  /** Static colliders for the floor and every box in the barn (walls, stall partitions, rails, posts...). */
  private addBarn(barn: THREE.Object3D): void {
    const R = this.R;
    this.world.createCollider(R.ColliderDesc.cuboid(BARN_HALF + 1, 0.5, BARN_HALF + 1).setTranslation(0, -0.48, 0).setFriction(0.9));
    barn.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    barn.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !(o.geometry instanceof THREE.BoxGeometry)) return;
      o.matrixWorld.decompose(p, q, s);
      const g = o.geometry.parameters;
      this.world.createCollider(
        R.ColliderDesc.cuboid((g.width * s.x) / 2, (g.height * s.y) / 2, (g.depth * s.z) / 2)
          .setTranslation(p.x, p.y, p.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.8),
      );
    });
  }

  /** Kinematic legs so walking through hay shoves it aside. Starts where the player does, away from the pile. */
  private addPlayer(): void {
    const R = this.R;
    this.player = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.7, PLAYER_START_Z));
    this.world.createCollider(R.ColliderDesc.capsule(0.3, 0.28), this.player);
  }

  /**
   * Create the baked, already-settled pile asleep, turned by a random angle so levels differ.
   * The needle replaces one strand somewhere in the pile; harder levels allow it deeper.
   */
  private placePile(cfg: LevelConfig, data: Float32Array): void {
    const R = this.R;
    const rand = mulberry32(cfg.seed);
    const count = data.length / FLOATS_PER_STRAND;
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const poses: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
    for (let i = 0; i < count; i++) {
      const o = i * FLOATS_PER_STRAND;
      pos.set(data[o], data[o + 1], data[o + 2]).applyQuaternion(turn);
      rot.set(data[o + 3], data[o + 4], data[o + 5], data[o + 6]).premultiply(turn);
      poses.push({ p: pos.clone(), q: rot.clone() });
    }

    // Depth below the pile's outer surface, from a coarse height map.
    const cell = 0.5;
    const top = new Map<string, number>();
    const key = (x: number, z: number): string => `${Math.round(x / cell)},${Math.round(z / cell)}`;
    for (const { p } of poses) top.set(key(p.x, p.z), Math.max(top.get(key(p.x, p.z)) ?? 0, p.y));
    const depthFraction = THREE.MathUtils.clamp(cfg.needleDepth / 0.7, 0, 1);
    const maxDepth = THREE.MathUtils.lerp(0.5, 2.6, depthFraction);
    const candidates: number[] = [];
    poses.forEach(({ p }, i) => {
      const depth = (top.get(key(p.x, p.z)) ?? p.y) - p.y;
      if (p.y > 0.12 && depth <= maxDepth) candidates.push(i);
    });
    const needleIndex = candidates[Math.floor(rand() * candidates.length)];

    const color = new THREE.Color();
    const halfHeight = (STRAND_LENGTH - 2 * STRAND_RADIUS) / 2;
    this.needleIndex = needleIndex;
    for (let i = 0; i < count; i++) {
      const { p, q } = poses[i];
      color.setHSL(0.11 + rand() * 0.04, 0.5 + rand() * 0.25, 0.3 + rand() * 0.2);
      this.mesh.setColorAt(i, color);
      this.centers.set([p.x, p.y, p.z], i * 3);
      const desc = R.RigidBodyDesc.fixed()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(1.2)
        .setAngularDamping(2);
      const body = this.world.createRigidBody(desc);
      let collider;
      if (i === needleIndex) {
        const radius = cfg.needleRadius;
        body.enableCcd(true);
        collider = this.world.createCollider(
          R.ColliderDesc.capsule(Math.max(0.01, cfg.needleLength / 2 - radius), radius).setFriction(0.7).setDensity(2),
          body,
        );
        this.needleBody = body;
      } else {
        collider = this.world.createCollider(
          R.ColliderDesc.capsule(halfHeight, STRAND_RADIUS).setFriction(1.4).setRestitution(0).setDensity(0.5),
          body,
        );
      }
      this.bodies.push(body);
      this.colliderToStrand.set(collider.handle, i);
      this.insertInGrid(i);
    }
    this.sync(true);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // ---- activation --------------------------------------------------------

  private cellKey(x: number, y: number, z: number): number {
    return ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);
  }

  private insertInGrid(i: number): void {
    const key = this.cellKey(this.centers[i * 3], this.centers[i * 3 + 1], this.centers[i * 3 + 2]);
    this.cellOf[i] = key;
    const list = this.grid.get(key);
    if (list) list.push(i);
    else this.grid.set(key, [i]);
  }

  private removeFromGrid(i: number): void {
    const list = this.grid.get(this.cellOf[i]);
    if (!list) return;
    const at = list.indexOf(i);
    if (at >= 0) list.splice(at, 1);
  }

  /** Switch every fixed strand within `radius` of the point to dynamic. */
  private activateAround(x: number, y: number, z: number, radius: number): void {
    const r = Math.ceil(radius / CELL);
    const r2 = radius * radius;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const list = this.grid.get(((cx + dx + 512) * 1024 + (cy + dy + 512)) * 1024 + (cz + dz + 512));
          if (!list) continue;
          for (const i of list) {
            if (this.active.size >= MAX_ACTIVE) return;
            if (this.state[i] !== FIXED) continue;
            const ex = this.centers[i * 3] - x;
            const ey = this.centers[i * 3 + 1] - y;
            const ez = this.centers[i * 3 + 2] - z;
            if (ex * ex + ey * ey + ez * ez <= r2) this.activate(i);
          }
        }
      }
    }
  }

  private activate(i: number): void {
    this.bodies[i].setBodyType(this.R.RigidBodyType.Dynamic, true);
    this.state[i] = ACTIVE;
    this.lowFrames[i] = 0;
    this.activeFrames[i] = 0;
    this.active.add(i);
  }

  private freeze(i: number): void {
    const body = this.bodies[i];
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    body.setBodyType(this.R.RigidBodyType.Fixed, false);
    if (i !== this.needleIndex) {
      this.writeInstance(i);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    const p = body.translation();
    this.removeFromGrid(i);
    this.centers.set([p.x, p.y, p.z], i * 3);
    this.insertInGrid(i);
    this.state[i] = FIXED;
    this.active.delete(i);
  }

  /** Spread movement to touching fixed strands and freeze strands that have come to rest. */
  private manageActive(): void {
    for (const i of this.active) {
      const body = this.bodies[i];
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      this.activeFrames[i] += MANAGE_EVERY;
      if (speed > MOVING_SPEED) {
        const p = body.translation();
        this.activateAround(p.x, p.y, p.z, PROPAGATE_RADIUS);
      }
      const w = body.angvel();
      if (speed < FREEZE_SPEED && Math.hypot(w.x, w.y, w.z) < FREEZE_ANGULAR) this.lowFrames[i] += MANAGE_EVERY;
      else this.lowFrames[i] = 0;
      if (this.lowFrames[i] > FREEZE_FRAMES || this.activeFrames[i] > MAX_ACTIVE_FRAMES) this.freeze(i);
    }
  }

  // ---- per frame ---------------------------------------------------------

  private holdAt(held: { index: number; distance: number }): void {
    const target = this.camPos.clone().addScaledVector(this.camDir, held.distance);
    target.y = Math.max(target.y, 0.08);
    target.x = THREE.MathUtils.clamp(target.x, -BARN_HALF + 0.3, BARN_HALF - 0.3);
    target.z = THREE.MathUtils.clamp(target.z, -BARN_HALF + 0.3, BARN_HALF - 0.3);
    this.bodies[held.index].setNextKinematicTranslation({ x: target.x, y: target.y, z: target.z });
  }

  private movePlayer(): void {
    this.player.setNextKinematicTranslation({ x: this.camPos.x, y: 0.7, z: this.camPos.z });
  }

  private writeInstance(i: number): void {
    const t = this.dummy;
    const p = this.bodies[i].translation();
    const r = this.bodies[i].rotation();
    t.position.set(p.x, p.y, p.z);
    t.quaternion.set(r.x, r.y, r.z, r.w);
    t.updateMatrix();
    this.mesh.setMatrixAt(i, t.matrix);
  }

  /** Copy moving bodies' transforms to the instances (fixed strands keep their last matrix). */
  private sync(force = false): void {
    const t = this.dummy;
    const write = (i: number): void => this.writeInstance(i);
    if (force) {
      for (let i = 0; i < this.bodies.length; i++) {
        if (i === this.needleIndex) {
          // The needle is drawn by its own mesh; park this instance out of sight.
          t.position.set(0, -50, 0);
          t.quaternion.identity();
          t.updateMatrix();
          this.mesh.setMatrixAt(i, t.matrix);
        } else {
          write(i);
        }
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    } else {
      for (const i of this.active) if (i !== this.needleIndex) write(i);
      if (this.held && this.held.index !== this.needleIndex) write(this.held.index);
      if (this.active.size > 0 || this.held) this.mesh.instanceMatrix.needsUpdate = true;
    }

    const p = this.needleBody.translation();
    const r = this.needleBody.rotation();
    this.needle.group.position.set(p.x, p.y, p.z);
    this.needle.group.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
