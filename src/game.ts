import * as THREE from 'three';
import { GameAudio } from './audio.ts';
import { PLAYER_MIN_RADIUS } from './constants.ts';
import { Player } from './controls.ts';
import { Haystack } from './haystack.ts';
import { Hud, formatTime, type OverlayAction } from './hud.ts';
import { levelConfig, type LevelConfig } from './levels.ts';
import { Needle } from './needle.ts';
import { PhysicsHay } from './physicsHay.ts';
import type { World } from './scene.ts';
import { loadSave, writeSave } from './storage.ts';
import { TouchControls, isTouchDevice } from './touch.ts';

export type Mode = 'static' | 'movable';
type State = 'menu' | 'loading' | 'playing' | 'paused' | 'won';

const MIN_DENSITY = 0.4;

const KEYS_HINT: Record<Mode, string> = {
  static: 'WASD move · Shift sprint · Click to grab the needle · Esc pause · M mute',
  movable: 'WASD move · Shift sprint · Click hay to pick up, click again to drop · Click the needle to win · Esc pause · M mute',
};

const TOUCH_HINT: Record<Mode, string> = {
  static: 'Left stick walks · Right stick looks · Aim at the needle and press Grab',
  movable: 'Left stick walks · Right stick looks · Grab picks up / drops hay · Grab the needle to win',
};

export class Game {
  private state: State = 'menu';
  private mode: Mode = 'static';
  private readonly player: Player;
  private readonly touch = isTouchDevice();
  private readonly touchControls: TouchControls | null = null;
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
    this.player = new Player(world.camera, world.renderer.domElement, this.touch);
    if (this.touch) {
      this.touchControls = new TouchControls(this.player, {
        onGrab: () => this.interact(),
        onPause: () => this.player.unlock(),
        onMute: () => this.toggleMute(),
      });
    }
    this.player.controls.addEventListener('lock', () => {
      const run = this.pending;
      this.pending = null;
      run?.();
    });
    this.player.controls.addEventListener('unlock', () => {
      this.touchControls?.reset();
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => this.hud.toast("Couldn't capture the mouse. Click again."));
    // On touch devices only the Grab button interacts, so stray taps never grab.
    if (!this.touch) document.addEventListener('click', () => this.interact());
    // Phones switch apps often; don't let the timer run in the background.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.player.unlock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMute();
    });

    this.showMenu();
  }

  /** Debug/inspection handle. */
  get info() {
    return { state: this.state, mode: this.mode, level: this.level, elapsed: this.elapsed, needle: this.needle?.position, cfg: this.cfg };
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.needle?.update(dt);
    if (this.state !== 'playing') return;

    this.player.update(dt);
    this.physics?.update(dt, this.world.camera);
    this.elapsed += dt;
    this.hud.setTimer(this.elapsed);

    if (!this.hintShown && this.elapsed >= this.cfg.hintDelay) {
      this.hintShown = true;
      this.needle?.showHint();
      this.hud.toast('A faint glint appears...');
    }
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
      { text: 'A needle is hidden in the haystack. Find it as fast as you can.', strong: true },
      { text: 'Static: a solid pile to search with your eyes.' },
      { text: 'Movable: every strand is physical. Pick hay up, carry it, drop it anywhere.' },
      {
        text: this.touch
          ? 'Left stick to walk, right stick to look, and the Grab button to interact.'
          : 'WASD to walk, mouse to look, click to interact. Esc pauses.',
      },
    ];
    const best = [this.save.highestLevel, this.save.highestLevelMovable];
    if (best[0] > 0 || best[1] > 0) lines.push({ text: `Your best: static level ${best[0]} · movable level ${best[1]}` });
    const resume = { static: this.save.currentLevel, movable: this.save.currentLevelMovable };
    const actions: OverlayAction[] = [];
    for (const mode of ['static', 'movable'] as const) {
      const level = resume[mode];
      if (level > 0) actions.push({ label: `Continue ${mode} · level ${level}`, onClick: () => this.requestLock(() => this.startRun(mode, level)) });
    }
    const hasContinue = actions.length > 0;
    actions.push(
      { label: hasContinue ? 'New static game' : 'Static haystack', onClick: () => this.requestLock(() => this.startRun('static')), secondary: hasContinue },
      { label: hasContinue ? 'New movable game' : 'Movable haystack', onClick: () => this.requestLock(() => this.startRun('movable')), secondary: hasContinue },
    );
    this.hud.showOverlay('Needle on Haystack', lines, actions);
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
    this.saveProgress(this.level + 1);
    this.player.unlock();
    this.hud.showOverlay(
      'Found it!',
      [
        { text: `Level ${this.level} cleared in ${formatTime(time)}${record ? ' (new best!)' : ''}`, strong: true },
        ...(prev !== undefined && !record ? [{ text: `Your record: ${formatTime(prev)}` }] : []),
        { text: 'The next needle will be harder to spot.' },
      ],
      [
        { label: `Start level ${this.level + 1}`, onClick: () => this.requestLock(() => void this.startLevel(this.level + 1)) },
        { label: 'Main menu', onClick: () => this.showMenu(), secondary: true },
      ],
    );
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

  private startRun(mode: Mode, level = 1): void {
    this.mode = mode;
    this.runSeed = (Math.random() * 0xffffffff) >>> 0;
    void this.startLevel(level);
  }

  /** Remember which level Continue should start in the current mode. */
  private saveProgress(level: number): void {
    if (this.mode === 'static') this.save.currentLevel = level;
    else this.save.currentLevelMovable = level;
    writeSave(this.save);
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
    this.saveProgress(n);
    this.hud.setLevel(n);
    this.hud.setTimer(0);
    this.hud.setBest(this.save.bestTimes[this.bestKey(n)]);
    this.hud.setKeys((this.touch ? TOUCH_HINT : KEYS_HINT)[this.mode]);
    this.setHolding(false);
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
    this.cfg = levelConfig(n, this.runSeed);
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
    this.setHolding(false);
  }

  private setHolding(holding: boolean): void {
    this.hud.setHolding(holding);
    this.touchControls?.setHolding(holding);
  }

  // ---- input -------------------------------------------------------------

  private interact(): void {
    if (this.state !== 'playing' || !this.player.isLocked || !this.needle) return;
    if (this.physics?.isHolding) {
      this.releaseHeld();
      return;
    }
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.world.camera);
    if (this.needle.isHit(this.raycaster)) {
      this.win();
    } else if (this.physics?.grab(this.raycaster)) {
      this.setHolding(true);
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
