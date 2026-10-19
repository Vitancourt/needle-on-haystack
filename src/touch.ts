import type { Player } from './controls.ts';

/** Phones and tablets: the primary input is a finger, not a mouse. */
export function isTouchDevice(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Radians of camera turn per pixel dragged. */
const LOOK_SENSITIVITY = 0.005;

export interface TouchActions {
  onGrab: () => void;
  onPause: () => void;
  onMute: () => void;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** A virtual joystick: reports the knob offset as x (right) and y (up), each -1..1. */
class Stick {
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;

  constructor(private readonly base: HTMLElement, private readonly onChange: (x: number, y: number) => void) {
    this.knob = base.firstElementChild as HTMLElement;
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pointerId = e.pointerId;
      base.setPointerCapture(e.pointerId);
      this.move(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.reset();
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }

  reset(): void {
    this.pointerId = null;
    this.knob.style.transform = '';
    this.onChange(0, 0);
  }

  private move(e: PointerEvent): void {
    const rect = this.base.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = e.clientX - (rect.left + radius);
    let dy = e.clientY - (rect.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx *= radius / len;
      dy *= radius / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.onChange(dx / radius, -dy / radius);
  }
}

/** Two joysticks (left walks, right looks), drag anywhere else to look, and action buttons. */
export class TouchControls {
  private readonly layer = el('touch');
  private readonly grab = el<HTMLButtonElement>('touch-grab');
  private readonly sticks: Stick[];
  private readonly lookPointers = new Map<number, { x: number; y: number }>();

  constructor(private readonly player: Player, actions: TouchActions) {
    document.body.classList.add('touch');

    this.button('touch-grab', actions.onGrab);
    this.button('touch-pause', actions.onPause);
    this.button('touch-mute', actions.onMute);

    this.sticks = [
      new Stick(el('stick-move'), (x, y) => {
        player.move.x = x;
        player.move.y = y;
      }),
      new Stick(el('stick-look'), (x, y) => {
        player.lookRate.x = x;
        player.lookRate.y = y;
      }),
    ];

    this.layer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.layer.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    this.layer.addEventListener('pointermove', (e) => {
      const last = this.lookPointers.get(e.pointerId);
      if (!last) return;
      this.player.look((e.clientX - last.x) * LOOK_SENSITIVITY, (e.clientY - last.y) * LOOK_SENSITIVITY);
      last.x = e.clientX;
      last.y = e.clientY;
    });
    const endLook = (e: PointerEvent) => this.lookPointers.delete(e.pointerId);
    this.layer.addEventListener('pointerup', endLook);
    this.layer.addEventListener('pointercancel', endLook);
  }

  setHolding(holding: boolean): void {
    this.grab.textContent = holding ? 'Drop' : 'Grab';
  }

  /** Forget any fingers still down (e.g. when the game pauses). */
  reset(): void {
    this.lookPointers.clear();
    for (const stick of this.sticks) stick.reset();
  }

  private button(id: string, onPress: () => void): void {
    el(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPress();
    });
  }
}
