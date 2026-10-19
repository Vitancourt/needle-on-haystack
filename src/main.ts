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
  const fpsLabel = document.getElementById('fps')!;
  let last = performance.now();
  let frames = 0;
  let fpsStart = last;

  world.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    game.update(dt);
    world.update(dt);
    last = now;
    frames++;
    if (now - fpsStart >= 500) {
      fpsLabel.textContent = `${Math.round((frames * 1000) / (now - fpsStart))} FPS`;
      frames = 0;
      fpsStart = now;
    }
    world.renderer.render(world.scene, world.camera);
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__game = { game, renderer: world.renderer };
  }
}
