import * as THREE from 'three';
import { GameAudio } from './audio.ts';
import { PLAYER_MIN_RADIUS } from './constants.ts';
import { Player } from './controls.ts';
import { Haystack } from './haystack.ts';
import { Hud, formatTime } from './hud.ts';
import { levelConfig, type LevelConfig } from './levels.ts';
import { Needle } from './needle.ts';
import { PhysicsHay } from './physicsHay.ts';
import type { World } from './scene.ts';
import { loadSave, writeSave } from './storage.ts';

export type Mode = 'static' | 'movable';
type State = 'menu' | 'loading' | 'playing' | 'paused' | 'won' | 'lost';

const MIN_DENSITY = 0.4;
/** Pulling a pile apart takes longer than looking at one. */
const MOVABLE_TIME_FACTOR = 1.5;

const KEYS_HINT: Record<Mode, string> = {
  static: 'WASD move · Shift sprint · Click to grab the needle · Esc pause · M mute',
  movable: 'WASD move · Shift sprint · Click hay to pick up, click again to drop · Click the needle to win · Esc pause · M mute',
};

export class Game {
  private state: State = 'menu';
  private mode: Mode = 'static';
  private readonly player: Player;
  private readonly hud = new Hud();
  private readonly save = loadSave();
  private readonly audio = new GameAudio(this.save.muted);
  private readonly raycaster = new THREE.Raycaster();

  private haystack: Haystack | null = null;
  private physics: PhysicsHay | null = null;
  private needle: Needle | null = null;
  private cfg!: LevelConfig;
  private level = 1;
  private runSeed = 1;
  private remaining = 0;
  private elapsed = 0;
  private hintShown = false;
  /** Invalidates an in-flight level build when the player leaves or restarts. */
  private buildToken = 0;

  /** Runs once pointer lock is granted (lock needs a user gesture, so actions wait for it). */
  private pending: (() => void) | null = null;

  // Adaptive quality (static pile only)
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

    this.showMenu();
  }

  /** Debug/inspection handle. */
  get info() {
    return { state: this.state, mode: this.mode, level: this.level, remaining: this.remaining, needle: this.needle?.position, cfg: this.cfg };
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.needle?.update(dt);
    if (this.state !== 'playing') return;

    this.player.update(dt);
    this.physics?.update(dt, this.world.camera);
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
    this.buildToken++;
    this.releaseHeld();
    this.hud.showHud(false);
    this.audio.stopAmbient();
    // A static pile always sits behind the menu.
    if (!this.haystack) {
      this.runSeed = (Math.random() * 0xffffffff) >>> 0;
      this.buildStatic(1);
    }
    const lines = [
      { text: 'A needle is hidden in the haystack. Find it before time runs out.', strong: true },
      { text: 'Static: a solid pile to search with your eyes.' },
      { text: 'Movable: every strand is physical. Pick hay up, carry it, drop it anywhere.' },
      { text: 'WASD to walk, mouse to look, click to interact. Esc pauses.' },
    ];
    const best = [this.save.highestLevel, this.save.highestLevelMovable];
    if (best[0] > 0 || best[1] > 0) lines.push({ text: `Your best: static level ${best[0]} · movable level ${best[1]}` });
    this.hud.showOverlay('Needle on Haystack', lines, [
      { label: 'Static haystack', onClick: () => this.requestLock(() => this.startRun('static')) },
      { label: 'Movable haystack', onClick: () => this.requestLock(() => this.startRun('movable')) },
    ]);
  }

  private pause(): void {
    this.state = 'paused';
    this.audio.stopAmbient();
    this.releaseHeld();
    this.hud.showOverlay('Paused', [{ text: 'The timer is stopped.' }], [
      {
        label: 'Resume',
        onClick: () =>
          this.requestLock(() => {
            this.state = 'playing';
            this.hud.hideOverlay();
            this.audio.startAmbient();
          }),
      },
      { label: 'Main menu', onClick: () => this.showMenu(), secondary: true },
    ]);
  }

  private win(): void {
    this.state = 'won';
    this.audio.stopAmbient();
    this.audio.found();
    this.releaseHeld();
    const time = this.elapsed;
    const key = this.bestKey(this.level);
    const prev = this.save.bestTimes[key];
    const record = prev === undefined || time < prev;
    if (record) this.save.bestTimes[key] = time;
    if (this.mode === 'static') this.save.highestLevel = Math.max(this.save.highestLevel, this.level);
    else this.save.highestLevelMovable = Math.max(this.save.highestLevelMovable, this.level);
    writeSave(this.save);
    this.player.unlock();
    this.hud.showOverlay(
      'Found it!',
      [
        { text: `Level ${this.level} cleared in ${formatTime(time)}${record ? ' (new best!)' : ''}`, strong: true },
        { text: 'The next needle will be harder to spot.' },
      ],
      [
        { label: `Start level ${this.level + 1}`, onClick: () => this.requestLock(() => void this.startLevel(this.level + 1)) },
        { label: 'Main menu', onClick: () => this.showMenu(), secondary: true },
      ],
    );
  }

  private lose(): void {
    this.state = 'lost';
    this.audio.stopAmbient();
    this.audio.lost();
    this.releaseHeld();
    this.player.unlock();
    this.hud.showOverlay("Time's up!", [{ text: `You reached level ${this.level}.`, strong: true }], [
      { label: 'Retry', onClick: () => this.requestLock(() => this.startRun(this.mode)) },
      { label: 'Main menu', onClick: () => this.showMenu(), secondary: true },
    ]);
  }

  // ---- flow --------------------------------------------------------------

  private requestLock(then: () => void): void {
    this.audio.ensure();
    this.pending = then;
    this.player.lock();
  }

  private bestKey(level: number): string {
    return this.mode === 'static' ? String(level) : `movable:${level}`;
  }

  private startRun(mode: Mode): void {
    this.mode = mode;
    this.runSeed = (Math.random() * 0xffffffff) >>> 0;
    void this.startLevel(1);
  }

  private async startLevel(n: number): Promise<void> {
    const token = ++this.buildToken;
    this.state = 'loading';
    this.hud.showHud(false);
    if (this.mode === 'movable') this.hud.showOverlay('Piling up the hay...', [{ text: 'Strands are falling into place.' }], []);

    await this.buildLevel(n, token);
    if (token !== this.buildToken) return;

    this.state = 'playing';
    this.elapsed = 0;
    this.hintShown = false;
    this.remaining = this.cfg.timeLimit;
    this.hud.setLevel(n);
    this.hud.setTimer(this.remaining);
    this.hud.setKeys(KEYS_HINT[this.mode]);
    this.hud.setHolding(false);
    this.hud.hideOverlay();
    this.hud.showHud(true);
    this.audio.startAmbient();
    // The mouse may have been released while a big pile was building.
    if (!this.player.isLocked) this.pause();
  }

  private clearLevel(): void {
    this.releaseHeld();
    this.haystack?.dispose();
    this.physics?.dispose();
    this.needle?.dispose();
    if (this.haystack) this.world.scene.remove(this.haystack.group);
    if (this.physics) this.world.scene.remove(this.physics.group);
    if (this.needle) this.world.scene.remove(this.needle.group);
    this.haystack = this.physics = this.needle = null;
    this.player.blocked = null;
  }

  private buildStatic(n: number): void {
    this.clearLevel();
    this.level = n;
    this.cfg = levelConfig(n, this.runSeed);
    this.haystack = new Haystack(this.cfg.seed, this.cfg.hayCount);
    this.haystack.setDensity(this.density);
    this.needle = new Needle(this.cfg);
    this.world.scene.add(this.haystack.group, this.needle.group);
    this.world.looseHay.visible = true;
    this.player.minRadius = PLAYER_MIN_RADIUS;
    this.player.blocked = null;
    this.player.reset();
  }

  private async buildLevel(n: number, token: number): Promise<void> {
    if (this.mode === 'static') {
      this.buildStatic(n);
      return;
    }
    this.clearLevel();
    this.level = n;
    const base = levelConfig(n, this.runSeed);
    this.cfg = { ...base, timeLimit: Math.round(base.timeLimit * MOVABLE_TIME_FACTOR) };
    const needle = new Needle(this.cfg, false);
    const physics = await PhysicsHay.create(this.cfg, needle, this.world.barn);
    if (token !== this.buildToken) {
      physics.dispose();
      needle.dispose();
      return;
    }
    this.needle = needle;
    this.physics = physics;
    this.world.scene.add(physics.group, needle.group);
    this.world.looseHay.visible = false;
    this.player.minRadius = 0;
    this.player.blocked = (x, z) => physics.blocksPlayer(x, z);
    this.player.reset();
  }

  private releaseHeld(): void {
    this.physics?.release();
    this.hud.setHolding(false);
  }

  // ---- input -------------------------------------------------------------

  private onClick(): void {
    if (this.state !== 'playing' || !this.player.isLocked || !this.needle) return;
    if (this.physics?.isHolding) {
      this.releaseHeld();
      return;
    }
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.world.camera);
    if (this.needle.isHit(this.raycaster)) {
      this.win();
    } else if (this.physics?.grab(this.raycaster)) {
      this.hud.setHolding(true);
    }
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
    if (!this.haystack) return;
    this.frames++;
    this.frameTime += dt;
    if (this.frameTime < 2) return;
    const fps = this.frames / this.frameTime;
    this.frames = 0;
    this.frameTime = 0;
    if (fps < 40 && this.density > MIN_DENSITY) {
      this.density = Math.max(MIN_DENSITY, this.density * 0.75);
      this.haystack.setDensity(this.density);
    }
  }
}
