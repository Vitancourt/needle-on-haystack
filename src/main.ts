import './style.css';
import { Game } from './game.ts';
import { createWorld } from './scene.ts';

function fatal(message: string): void {
  document.body.replaceChildren(Object.assign(document.createElement('p'), { className: 'fatal', textContent: message }));
}

const canvas = document.getElementById('game') as HTMLCanvasElement;

if (!('WebGL2RenderingContext' in window) || !canvas.getContext('webgl2')) {
  fatal('Sorry, this game needs WebGL2, which your browser or device does not support.');
} else {
  const world = createWorld(canvas);
  const game = new Game(world);
  let last = performance.now();

  world.renderer.setAnimationLoop(() => {
    const now = performance.now();
    game.update((now - last) / 1000);
    last = now;
    world.renderer.render(world.scene, world.camera);
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__game = { game, renderer: world.renderer };
  }
}
