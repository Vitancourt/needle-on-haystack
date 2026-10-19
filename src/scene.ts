import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Dust, createLooseHay } from './atmosphere.ts';
import { createBarn } from './barn.ts';
import { BARN_HALF, EYE_HEIGHT, GROUND_HALF, LANTERN_HEIGHT, LANTERN_SPREAD, PLAYER_START_Z } from './constants.ts';

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  barn: THREE.Object3D;
  /** Decorative straw on the floor; hidden in the physics mode. */
  looseHay: THREE.Object3D;
  /** Advance ambient animation (dust). */
  update(dt: number): void;
}

export function createWorld(canvas: HTMLCanvasElement): World {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const dusk = new THREE.Color(0x2b221a);
  scene.background = dusk;
  scene.fog = new THREE.Fog(dusk, 22, 70);

  // Soft image-based light so standard materials pick up believable ambient reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(0, EYE_HEIGHT, PLAYER_START_Z);

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x6a5430, 0.7));

  // Daylight leaking in through the boards: the only shadow-casting light.
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.6);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -BARN_HALF - 2;
  cam.right = cam.top = BARN_HALF + 2;
  cam.near = 1;
  cam.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // Warm lantern light, no shadows so it stays cheap.
  for (const x of [-LANTERN_SPREAD, LANTERN_SPREAD]) {
    for (const z of [-LANTERN_SPREAD, LANTERN_SPREAD]) {
      const lamp = new THREE.PointLight(0xffc27a, 55, 0, 2);
      lamp.position.set(x, LANTERN_HEIGHT, z);
      scene.add(lamp);
    }
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_HALF * 2 + 40, GROUND_HALF * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x6f8a3c }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const barn = createBarn();
  const looseHay = createLooseHay();
  scene.add(barn, looseHay);

  const dust = new Dust();
  scene.add(dust.points);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, barn, looseHay, update: (dt) => {
      dust.update(dt);
    }, };
}
