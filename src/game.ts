import * as THREE from 'three';
import { GameAudio } from './audio.ts';
import { Player } from './controls.ts';
import { Haystack } from './haystack.ts';
import { Hud, formatTime } from './hud.ts';
import { levelConfig, type LevelConfig } from './levels.ts';
import { Needle } from './needle.ts';
import type { World } from './scene.ts';
import { loadSave, writeSave } from './storage.ts';

type State = 'menu' | 'playing' | 'paused' | 'won' | 'lost';

const MIN_DENSITY = 0.4;

export class Game {
  private state: State = 'menu';
  private readonly player: Player;
  private readonly hud = new Hud();
  private readonly save = loadSave();
  private readonly audio = new GameAudio(this.save.muted);
  private readonly raycaster = new THREE.Raycaster();

  private haystack: Haystack | null = null;
  private needle: Needle | null = null;
  private cfg!: LevelConfig;
  private level = 1;
  private runSeed = 1;
  private remaining = 0;
  private elapsed = 0;
  private hintShown = false;

  /** Runs once pointer lock is granted (lock needs a user gesture, so actions wait for it). */
  private pending: (() => void) | null = null;

  // Adaptive quality
  private density = 1;
  private frames = 0;
  private frameTime = 0;

  constructor(private readonly world: World) {
    this.player = new Player(world.camera, world.renderer.domElement);
    this.player.controls.addEventListener('lock', () => {
      const run = this.pending;
      this.pending = null;
      run?.();
    });
    this.player.controls.addEventListener('unlock', () => {
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => this.hud.toast("Couldn't capture the mouse. Click again."));
    document.addEventListener('click', () => this.onClick());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMute();
    });

    this.buildLevel(1); // preview behind the menu
    this.showMenu();
  }

  /** Debug/inspection handle. */
  get info() {
    return { state: this.state, level: this.level, remaining: this.remaining, needle: this.needle?.position, cfg: this.cfg };
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.needle?.update(dt);
    if (this.state !== 'playing') return;

    this.player.update(dt);
    this.elapsed += dt;
    this.remaining -= dt;
    this.hud.setTimer(this.remaining);

    if (!this.hintShown && this.elapsed >= this.cfg.hintDelay) {
      this.hintShown = true;
      this.needle?.showHint();
      this.hud.toast('A faint glint appears...');
    }
    if (this.remaining <= 0) this.lose();
    this.adaptQuality(dt);
  }

  // ---- screens -----------------------------------------------------------

  private showMenu(): void {
    this.state = 'menu';
    this.hud.showHud(false);
    const lines = [
      { text: 'A needle is hidden in the haystack. Find it before time runs out.', strong: true },
      { text: 'WASD to walk, mouse to look, click to grab the needle. Esc pauses.' },
    ];
    if (this.save.highestLevel > 0) lines.push({ text: `Your best: level ${this.save.highestLevel}` });
    this.hud.showOverlay('Needle on Haystack', lines, 'Play', () => this.requestLock(() => this.startRun()));
  }

  private pause(): void {
    this.state = 'paused';
    this.audio.stopAmbient();
    this.hud.showOverlay('Paused', [{ text: 'The timer is stopped.' }], 'Resume', () =>
      this.requestLock(() => {
        this.state = 'playing';
        this.hud.hideOverlay();
        this.audio.startAmbient();
      }),
    );
  }

  private win(): void {
    this.state = 'won';
    this.audio.stopAmbient();
    this.audio.found();
    const time = this.elapsed;
    const key = String(this.level);
    const prev = this.save.bestTimes[key];
    const record = prev === undefined || time < prev;
    if (record) this.save.bestTimes[key] = time;
    this.save.highestLevel = Math.max(this.save.highestLevel, this.level);
    writeSave(this.save);
    this.player.unlock();
    this.hud.showOverlay(
      'Found it!',
      [
        { text: `Level ${this.level} cleared in ${formatTime(time)}${record ? ' (new best!)' : ''}`, strong: true },
        { text: 'The next needle will be harder to spot.' },
      ],
      `Start level ${this.level + 1}`,
      () => this.requestLock(() => this.startLevel(this.level + 1)),
    );
  }

  private lose(): void {
    this.state = 'lost';
    this.audio.stopAmbient();
    this.audio.lost();
    this.player.unlock();
    this.hud.showOverlay(
      "Time's up!",
      [{ text: `You reached level ${this.level}.`, strong: true }],
      'Retry',
      () => this.requestLock(() => this.startRun()),
    );
  }

  // ---- flow --------------------------------------------------------------

  private requestLock(then: () => void): void {
    this.audio.ensure();
    this.pending = then;
    this.player.lock();
  }

  private startRun(): void {
    this.runSeed = (Math.random() * 0xffffffff) >>> 0;
    this.startLevel(1);
  }

  private startLevel(n: number): void {
    this.buildLevel(n);
    this.state = 'playing';
    this.elapsed = 0;
    this.hintShown = false;
    this.remaining = this.cfg.timeLimit;
    this.hud.setLevel(n);
    this.hud.setTimer(this.remaining);
    this.hud.hideOverlay();
    this.hud.showHud(true);
    this.audio.startAmbient();
  }

  private buildLevel(n: number): void {
    this.haystack?.dispose();
    this.needle?.dispose();
    if (this.haystack) this.world.scene.remove(this.haystack.group);
    if (this.needle) this.world.scene.remove(this.needle.group);

    this.level = n;
    this.cfg = levelConfig(n, this.runSeed);
    this.haystack = new Haystack(this.cfg.seed, this.cfg.hayCount);
    this.haystack.setDensity(this.density);
    this.needle = new Needle(this.cfg);
    this.world.scene.add(this.haystack.group, this.needle.group);
    this.player.reset();
  }

  // ---- input -------------------------------------------------------------

  private onClick(): void {
    if (this.state !== 'playing' || !this.player.isLocked || !this.needle) return;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.world.camera);
    if (this.needle.isHit(this.raycaster)) this.win();
  }

  private toggleMute(): void {
    this.save.muted = !this.save.muted;
    this.audio.setMuted(this.save.muted);
    writeSave(this.save);
    this.hud.toast(this.save.muted ? 'Sound off' : 'Sound on');
  }

  // ---- performance -------------------------------------------------------

  /** If the frame rate stays low, render fewer hay strands. */
  private adaptQuality(dt: number): void {
    this.frames++;
    this.frameTime += dt;
    if (this.frameTime < 2) return;
    const fps = this.frames / this.frameTime;
    this.frames = 0;
    this.frameTime = 0;
    if (fps < 40 && this.density > MIN_DENSITY) {
      this.density = Math.max(MIN_DENSITY, this.density * 0.75);
      this.haystack?.setDensity(this.density);
    }
  }
}
