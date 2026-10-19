import * as THREE from 'three';
import { mulberry32 } from './rng.ts';

const RADIAL = 14;
const SAMPLES = 24;

type Pt = [number, number, number];

interface TaperOptions {
  /** Width (z) scale of the cross-section. */
  across?: number;
  /** Height scale of the cross-section within the path's plane. */
  up?: number;
  /** Darker back, lighter belly via vertex colours (needs vertexColors on the material). */
  countershade?: number;
}

/** Smooth tapered tube through points (spline) with per-point radii and elliptical section; ends are capped. */
function taper(points: Pt[], radii: number[], opts: TaperOptions = {}): THREE.BufferGeometry {
  const { across = 1, up = 1, countershade = 0 } = opts;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const radiusAt = (t: number): number => {
    const f = t * (radii.length - 1);
    const i = Math.min(Math.floor(f), radii.length - 2);
    const k = f - i;
    const s = k * k * (3 - 2 * k);
    return radii[i] + (radii[i + 1] - radii[i]) * s;
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const t = s / SAMPLES;
    const c = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const nx = -tan.y;
    const ny = tan.x;
    const r = radiusAt(t);
    for (let j = 0; j < RADIAL; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      const n = Math.cos(a) * r * up;
      const b = Math.sin(a) * r * across;
      positions.push(c.x + nx * n, c.y + ny * n, c.z + b);
      // cos(a) > 0 faces "up" along the path normal; shade by world-up component of that normal.
      const lift = Math.cos(a) * Math.sign(ny || 1);
      const v = 1 - countershade * (0.5 - 0.5 * lift) * 0.5 + countershade * 0.1;
      colors.push(v, v, v);
      uvs.push(t, j / RADIAL);
    }
  }
  for (let s = 0; s < SAMPLES; s++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = s * RADIAL + j;
      const b = s * RADIAL + ((j + 1) % RADIAL);
      indices.push(a, a + RADIAL, b, b, a + RADIAL, b + RADIAL);
    }
  }
  for (const [ring, flip] of [[0, true], [SAMPLES, false]] as const) {
    const end = curve.getPointAt(ring === 0 ? 0 : 1);
    const center = positions.length / 3;
    positions.push(end.x, end.y, end.z);
    colors.push(1, 1, 1);
    uvs.push(ring === 0 ? 0 : 1, 0.5);
    for (let j = 0; j < RADIAL; j++) {
      const a = ring * RADIAL + j;
      const b = ring * RADIAL + ((j + 1) % RADIAL);
      if (flip) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ---- Signed-distance horse body -------------------------------------------------
// One smooth surface (smooth union of round cones and ellipsoids) polygonised with surface nets,
// so muscles blend into each other the way a sculpted mesh does.

type Sdf = (x: number, y: number, z: number) => number;

/** Capped cone with different end radii (iq's sdRoundCone), optionally squashed across z. */
function roundCone(a: Pt, b: Pt, r1: number, r2: number, sz = 1): Sdf {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0];
    const pay = y - a[1];
    const paz = (z - a[2]) / sz;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy;
    const qy = pay * l2 - bay * yy;
    const qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    let d: number;
    if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - r2;
    else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - r1;
    else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    return d * Math.min(1, sz);
  };
}

function ellipsoidSdf(c: Pt, rx: number, ry: number, rz: number): Sdf {
  const m = Math.min(rx, ry, rz);
  return (x, y, z) => {
    const dx = (x - c[0]) / rx;
    const dy = (y - c[1]) / ry;
    const dz = (z - c[2]) / rz;
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * m;
  };
}

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

interface Part {
  sdf: Sdf;
  /** Blend radius when merged into the rest. */
  k: number;
}

const mirror = (f: (z: number) => Sdf, z: number): Sdf[] => [f(z), f(-z)];

function horseParts(): Part[] {
  const parts: Part[] = [];
  const add = (sdf: Sdf, k = 0.07): void => void parts.push({ sdf, k });

  // Barrel and chest.
  add(roundCone([-0.6, 1.24, 0], [0.4, 1.16, 0], 0.39, 0.44, 0.82), 0.1);
  add(roundCone([0.1, 1.12, 0], [0.55, 1.2, 0], 0.48, 0.38, 0.8), 0.1);
  // Hindquarters and shoulders.
  for (const sdf of mirror((z) => ellipsoidSdf([-0.6, 1.1, z], 0.43, 0.46, 0.23), 0.12)) add(sdf, 0.04);
  for (const sdf of mirror((z) => ellipsoidSdf([0.5, 1.06, z], 0.34, 0.42, 0.2), 0.13)) add(sdf, 0.035);
  // Thick, arched neck and heavy head.
  add(roundCone([0.55, 1.38, 0], [1.2, 2.04, 0], 0.34, 0.135, 0.7), 0.1);
  add(roundCone([1.24, 2.08, 0], [1.76, 1.66, 0], 0.125, 0.07, 0.72), 0.03);
  add(ellipsoidSdf([1.46, 1.88, 0], 0.15, 0.13, 0.095), 0.04);
  // Legs: front.
  for (const z of [0.15, -0.15]) {
    add(roundCone([0.6, 1.05, z], [0.64, 0.55, z], 0.17, 0.085), 0.08);
    add(roundCone([0.64, 0.55, z], [0.66, 0.18, z], 0.055, 0.045), 0.04);
    add(ellipsoidSdf([0.66, 0.17, z], 0.06, 0.06, 0.055), 0.03);
    add(roundCone([0.66, 0.17, z], [0.72, 0.07, z], 0.045, 0.052), 0.03);
    add(roundCone([0.72, 0.075, z], [0.72, 0.0, z], 0.056, 0.07), 0.01);
  }
  // Legs: hind (long gaskin, strong hock).
  for (const z of [0.17, -0.17]) {
    add(roundCone([-0.6, 1.1, z], [-0.8, 0.56, z], 0.24, 0.09), 0.1);
    add(roundCone([-0.8, 0.56, z], [-0.7, 0.18, z], 0.06, 0.045), 0.04);
    add(ellipsoidSdf([-0.7, 0.17, z], 0.06, 0.06, 0.055), 0.03);
    add(roundCone([-0.7, 0.17, z], [-0.76, 0.07, z], 0.045, 0.052), 0.03);
    add(roundCone([-0.76, 0.075, z], [-0.76, 0.0, z], 0.056, 0.07), 0.01);
  }
  return parts;
}

/** Naive surface nets over the horse SDF; returns a smooth, SDF-shaded mesh with colours and UVs. */
function buildHorseGeometry(): THREE.BufferGeometry {
  const parts = horseParts();
  const sdf: Sdf = (x, y, z) => {
    let d = parts[0].sdf(x, y, z);
    for (let i = 1; i < parts.length; i++) d = smin(d, parts[i].sdf(x, y, z), parts[i].k);
    return d;
  };

  const h = 0.028;
  const ox = -1.1;
  const oy = -0.05;
  const oz = -0.5;
  const nx = Math.ceil(3.1 / h);
  const ny = Math.ceil(2.5 / h);
  const nz = Math.ceil(1.0 / h);
  const field = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) field[idx(i, j, k)] = sdf(ox + i * h, oy + j * h, oz + k * h);
    }
  }

  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = corner.map(([a, b, c]) => field[idx(i + a, j + b, k + c)]);
        let inside = 0;
        for (let c = 0; c < 8; c++) if (v[c] < 0) inside++;
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          if (v[e0] < 0 === v[e1] < 0) continue;
          const t = v[e0] / (v[e0] - v[e1]);
          sx += corner[e0][0] + t * (corner[e1][0] - corner[e0][0]);
          sy += corner[e0][1] + t * (corner[e1][1] - corner[e0][1]);
          sz += corner[e0][2] + t * (corner[e1][2] - corner[e0][2]);
          n++;
        }
        vid[idx(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
      }
    }
  }

  const count = pos.length / 3;
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const e = h * 0.5;
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const len = Math.hypot(gx, gy, gz) || 1;
    gx /= len;
    gy /= len;
    gz /= len;
    normals.set([gx, gy, gz], v * 3);
    // Darker back, lighter belly; hooves nearly black.
    // Cheap ambient occlusion from the SDF: creases (armpit, groin, under the jaw) read darker.
    const ao1 = Math.min(1, Math.max(0, sdf(x + gx * 0.08, y + gy * 0.08, z + gz * 0.08) / 0.08));
    const ao2 = Math.min(1, Math.max(0, sdf(x + gx * 0.25, y + gy * 0.25, z + gz * 0.25) / 0.25));
    let shade = (0.84 + 0.2 * (0.5 - 0.5 * gy)) * (0.38 + 0.62 * ao1) * (0.65 + 0.35 * ao2);
    let tint = [1, 1, 1];
    if (y < 0.085) {
      shade = 0.22;
      tint = [1.1, 1, 0.9];
    }
    colors.set([shade * tint[0], shade * tint[1], shade * tint[2]], v * 3);
    uvs.set([x * 1.4, y * 1.4 + z * 0.8], v * 2);
  }

  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const f0 = field[idx(i, j, k)] < 0;
        if (f0 !== field[idx(i + 1, j, k)] < 0) {
          quad(vid[idx(i, j - 1, k - 1)], vid[idx(i, j, k - 1)], vid[idx(i, j, k)], vid[idx(i, j - 1, k)], !f0);
        }
        if (f0 !== field[idx(i, j + 1, k)] < 0) {
          quad(vid[idx(i - 1, j, k - 1)], vid[idx(i - 1, j, k)], vid[idx(i, j, k)], vid[idx(i, j, k - 1)], !f0);
        }
        if (f0 !== field[idx(i, j, k + 1)] < 0) {
          quad(vid[idx(i - 1, j - 1, k)], vid[idx(i, j - 1, k)], vid[idx(i, j, k)], vid[idx(i - 1, j, k)], !f0);
        }
      }
    }
  }

  // Make sure triangles face outward (along the SDF gradient); flip every triangle if most don't.
  let outward = 0;
  const stride = Math.max(3, Math.floor(index.length / 3 / 400) * 3);
  for (let t = 0; t < index.length; t += stride) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    const ux = pos[b * 3] - pos[a * 3];
    const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
    const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3];
    const vy = pos[c * 3 + 1] - pos[a * 3 + 1];
    const vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const dot = (uy * vz - uz * vy) * normals[a * 3] + (uz * vx - ux * vz) * normals[a * 3 + 1] + (ux * vy - uy * vx) * normals[a * 3 + 2];
    outward += dot > 0 ? 1 : -1;
  }
  if (outward < 0) {
    for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

let bodyGeometry: THREE.BufferGeometry | null = null;

export interface HorseColors {
  coat: number;
  mane: number;
}

export interface Horse extends THREE.Group {
  /** Idle animation: breathing, ear flicks, tail swish. `t` is seconds. */
  animate(t: number): void;
}

/** Fine hair streaks plus soft mottling, baked in the coat colour (used as map and bump). */
function coatTexture(hex: number, seed: number): THREE.CanvasTexture {
  const rand = mulberry32(seed);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const base = new THREE.Color(hex);
  const rgb = (k: number, a = 1): string =>
    `rgba(${Math.min(255, base.r * 255 * k)},${Math.min(255, base.g * 255 * k)},${Math.min(255, base.b * 255 * k)},${a})`;
  g.fillStyle = rgb(1);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const k = 0.85 + rand() * 0.3;
    grad.addColorStop(0, rgb(k, 0.4));
    grad.addColorStop(1, rgb(k, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = rgb(0.82 + rand() * 0.36, 0.35);
    g.lineWidth = 1;
    const x = rand() * size;
    const y = rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6 + rand() * 14, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Sculpted-style horse (signed-distance body), ~1.6 m at the withers, at the origin facing +x. */
export function createHorse(colors: HorseColors, phase = 0): Horse {
  const horse = new THREE.Group() as Horse;
  bodyGeometry ??= buildHorseGeometry();
  const coatMap = coatTexture(colors.coat, Math.floor(phase * 100) + 11);
  const fur = new THREE.MeshPhysicalMaterial({
    map: coatMap,
    bumpMap: coatMap,
    bumpScale: 0.8,
    roughness: 0.85,
    sheen: 0.5,
    sheenColor: new THREE.Color(colors.coat).lerp(new THREE.Color(0xffffff), 0.45),
    sheenRoughness: 0.7,
    vertexColors: true,
  });
  const mane = new THREE.MeshStandardMaterial({ color: colors.mane, roughness: 0.85, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.1 });
  const earMat = fur.clone();
  earMat.vertexColors = false;

  const body = new THREE.Mesh(bodyGeometry, fur);
  horse.add(body);

  const addGeo = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = horse): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    return m;
  };

  // Eyes and nostrils.
  for (const z of [-0.085, 0.085]) {
    addGeo(new THREE.SphereGeometry(0.024, 12, 10).scale(1, 1, 0.8).translate(1.44, 1.97, z), dark);
    addGeo(new THREE.SphereGeometry(0.016, 8, 6).scale(1, 0.7, 0.6).translate(1.76, 1.67, z * 0.55), dark);
  }

  // Ears.
  const ears: THREE.Mesh[] = [];
  for (const z of [-0.06, 0.06]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.13, 8).translate(0, 0.065, 0), earMat);
    ear.position.set(1.17, 2.15, z * 1.2);
    ear.rotation.set(z > 0 ? 0.2 : -0.2, 0, -0.35);
    horse.add(ear);
    ears.push(ear);
  }

  // Mane along the crest and forelock.
  const crest: Pt[] = [[0.36, 1.66, 0], [0.56, 1.8, 0], [0.79, 1.97, 0], [1.04, 2.16, 0], [1.2, 2.24, 0]];
  for (const dz of [0, 0.03, -0.03]) {
    addGeo(taper(crest.map(([x, y, z]) => [x, y + (dz === 0 ? 0.03 : 0), z + dz] as Pt), [0.04, 0.07, 0.07, 0.06, 0.03], { across: 0.8 }), mane);
  }
  addGeo(taper([[1.24, 2.22, 0], [1.32, 2.12, 0], [1.36, 2.0, 0]], [0.03, 0.035, 0.012], { across: 0.8 }), mane);

  // Tail pivots at the dock.
  const dock: Pt = [-0.95, 1.3, 0];
  const tail = new THREE.Group();
  tail.position.set(...dock);
  horse.add(tail);
  for (const dz of [-0.04, 0, 0.04]) {
    const g = taper([[-0.95, 1.3, dz], [-1.07, 1.18, dz * 2], [-1.13, 0.85, dz * 3], [-1.1, 0.38, dz * 4]], [0.04, 0.075, 0.07, 0.015], { across: 0.9 });
    g.translate(-dock[0], -dock[1], -dock[2]);
    addGeo(g, mane, tail);
  }

  horse.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });

  horse.animate = (t: number): void => {
    const s = t + phase;
    const breath = Math.sin(s * 1.5);
    body.scale.set(1, 1 + breath * 0.004, 1 + breath * 0.012);
    tail.rotation.z = Math.sin(s * 1.1) * 0.08;
    tail.rotation.y = Math.sin(s * 0.9) * 0.2;
    const flick = Math.max(0, Math.sin(s * 0.8 + 1)) ** 12 * 0.35;
    ears[0].rotation.x = -0.2 - flick;
    ears[1].rotation.x = 0.2 + flick * 0.3;
  };
  return horse;
}
