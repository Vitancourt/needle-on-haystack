import * as THREE from 'three';
import { EYE_HEIGHT, GROUND_HALF, PLAYER_START_Z } from './constants.ts';

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createWorld(canvas: HTMLCanvasElement): World {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x9ec9e8);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 25, 90);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(0, EYE_HEIGHT, PLAYER_START_Z);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7a6a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.2);
  sun.position.set(12, 20, 8);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_HALF * 2 + 40, GROUND_HALF * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x6f8a3c }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}
