import * as THREE from 'three';
import { noiseTexture } from './textures.ts';
import { createStalls } from './stalls.ts';
import { BARN_HALF, BARN_RIDGE_HEIGHT, BARN_WALL_HEIGHT, LANTERN_HEIGHT, LANTERN_SPREAD } from './constants.ts';

const WALL_THICKNESS = 0.4;

function plankTexture(base: string, groove: string): THREE.CanvasTexture {
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const tex = noiseTexture(256, { base: rgb(base), variance: 0.3, grain: true, density: 200, seed: base.length * 31 + base.charCodeAt(2) });
  const g = (tex.image as HTMLCanvasElement).getContext('2d')!;
  g.fillStyle = groove;
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 4, 256);
  tex.needsUpdate = true;
  return tex;
}

function plankMaterial(tex: THREE.CanvasTexture, repeatX: number, repeatY: number): THREE.MeshStandardMaterial {
  const t = tex.clone();
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.85, side: THREE.DoubleSide });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** A closed square barn around the haystack: walls, gabled roof, floor and a (closed) door. */
export function createBarn(): THREE.Group {
  const barn = new THREE.Group();
  const H = BARN_HALF;
  const WH = BARN_WALL_HEIGHT;
  const RH = BARN_RIDGE_HEIGHT;

  const redPlanks = plankTexture('#9b3b2c', '#6e2518');
  const woodPlanks = plankTexture('#7a5a3a', '#4f3822');
  const wallMat = (len: number) => plankMaterial(redPlanks, len / 2, 1);
  const wood = new THREE.MeshStandardMaterial({ map: woodPlanks, color: 0x8a6a48, roughness: 0.85 });

  const dirt = noiseTexture(256, { base: [138, 109, 67], variance: 0.4, density: 500, seed: 3 });
  dirt.repeat.set(7, 7);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2, H * 2),
    new THREE.MeshStandardMaterial({ map: dirt, bumpMap: dirt, bumpScale: 2, roughness: 1 }),
  );
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  barn.add(floor);

  // Walls: interior faces sit at +/-H.
  const c = H + WALL_THICKNESS / 2;
  const len = H * 2 + WALL_THICKNESS * 2;
  barn.add(box(len, WH, WALL_THICKNESS, wallMat(len), 0, WH / 2, -c));
  barn.add(box(len, WH, WALL_THICKNESS, wallMat(len), 0, WH / 2, c));
  barn.add(box(WALL_THICKNESS, WH, len, wallMat(len), -c, WH / 2, 0));
  barn.add(box(WALL_THICKNESS, WH, len, wallMat(len), c, WH / 2, 0));

  // Gable triangles above the +/-x walls (the ridge runs along x).
  const tri = new THREE.Shape([new THREE.Vector2(-H, WH), new THREE.Vector2(H, WH), new THREE.Vector2(0, RH)]);
  for (const side of [-1, 1]) {
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), wallMat(len));
    gable.rotation.y = Math.PI / 2;
    gable.position.x = side * (H + 0.05);
    barn.add(gable);
  }

  // Roof panels.
  const rise = RH - WH;
  const angle = Math.atan2(rise, H);
  const slope = Math.hypot(H, rise) + 0.8;
  const roofMat = plankMaterial(woodPlanks, 6, slope / 2);
  for (const side of [-1, 1]) {
    const panel = box(len + 1.2, 0.3, slope, roofMat, 0, WH + rise / 2 + 0.1, (side * H) / 2);
    panel.rotation.x = side * angle;
    barn.add(panel);
  }

  // Tie beams and ridge beam.
  for (const x of [-H * 0.6, 0, H * 0.6]) barn.add(box(0.35, 0.35, H * 2, wood, x, WH - 0.2, 0));
  barn.add(box(H * 2, 0.4, 0.4, wood, 0, RH - 0.3, 0));

  // Corner posts.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) barn.add(box(0.6, WH, 0.6, wood, sx * (H - 0.3), WH / 2, sz * (H - 0.3)));

  // Double door on the far (-z) wall, with cross braces.
  const doorZ = -H + 0.06;
  const doorMat = plankMaterial(woodPlanks, 2, 1);
  for (const side of [-1, 1]) {
    const leaf = box(2.2, 5, 0.1, doorMat, side * 1.1, 2.5, doorZ);
    barn.add(leaf);
    for (const dir of [-1, 1]) {
      const brace = box(0.2, Math.hypot(2.2, 5) - 0.3, 0.12, wood, side * 1.1, 2.5, doorZ + 0.05);
      brace.rotation.z = dir * Math.atan2(2.2, 5);
      barn.add(brace);
    }
  }
  barn.add(box(0.3, 5.3, 0.15, wood, -2.35, 2.65, doorZ + 0.03));
  barn.add(box(0.3, 5.3, 0.15, wood, 2.35, 2.65, doorZ + 0.03));
  barn.add(box(5, 0.3, 0.15, wood, 0, 5.15, doorZ + 0.03));

  // Hanging lanterns (the lights themselves live in the scene).
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const x of [-LANTERN_SPREAD, LANTERN_SPREAD]) {
    for (const z of [-LANTERN_SPREAD, LANTERN_SPREAD]) {
      barn.add(box(0.03, WH - LANTERN_HEIGHT - 0.2, 0.03, wood, x, (WH + LANTERN_HEIGHT) / 2, z));
      barn.add(box(0.3, 0.4, 0.3, glow, x, LANTERN_HEIGHT, z));
      barn.add(box(0.4, 0.08, 0.4, wood, x, LANTERN_HEIGHT + 0.25, z));
    }
  }

  const stalls = createStalls();
  barn.add(stalls);
  barn.userData.update = stalls.userData.update;

  // Structure casts shadows; the roof and gables don't, so daylight still reaches the floor.
  const noShadow = new Set<THREE.Object3D>([...barn.children.filter((o) => o.position.y > WH && o !== floor)]);
  barn.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o === floor || noShadow.has(o)) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });

  return barn;
}
