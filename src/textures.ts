import * as THREE from 'three';
import { mulberry32 } from './rng.ts';

interface NoiseOptions {
  /** Base colour as 0-255 RGB. */
  base: [number, number, number];
  /** Per-speckle brightness variation (0-1). */
  variance: number;
  /** Number of speckles per 100x100 px. */
  density?: number;
  /** Draw vertical wood-grain streaks. */
  grain?: boolean;
  seed?: number;
}

/** Procedural tileable colour texture: speckled noise with optional vertical grain streaks. */
export function noiseTexture(size: number, opts: NoiseOptions): THREE.CanvasTexture {
  const rand = mulberry32(opts.seed ?? 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const [r, gr, b] = opts.base;
  g.fillStyle = `rgb(${r},${gr},${b})`;
  g.fillRect(0, 0, size, size);

  const shade = (k: number, a: number): string => {
    const f = 1 + k * opts.variance;
    return `rgba(${Math.min(255, r * f)},${Math.min(255, gr * f)},${Math.min(255, b * f)},${a})`;
  };

  const speckles = Math.floor(((size * size) / 10000) * (opts.density ?? 120));
  for (let i = 0; i < speckles; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const s = 1 + rand() * 3;
    g.fillStyle = shade(rand() * 2 - 1, 0.5);
    g.fillRect(x, y, s, s);
  }
  if (opts.grain) {
    for (let i = 0; i < size / 2; i++) {
      const x = rand() * size;
      g.fillStyle = shade(rand() * 2 - 1, 0.25);
      g.fillRect(x, 0, 1 + rand() * 2, size);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function repeated(tex: THREE.CanvasTexture, x: number, y: number): THREE.CanvasTexture {
  const t = tex.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}
