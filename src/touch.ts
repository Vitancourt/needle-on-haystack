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

/** On-screen joystick (walk), drag anywhere else (look), and action buttons. */
export class TouchControls {
  private readonly layer = el('touch');
  private readonly stick = el('stick');
  private readonly knob = el('stick-knob');
  private readonly grab = el<HTMLButtonElement>('touch-grab');
  private stickId: number | null = null;
  private readonly lookPointers = new Map<number, { x: number; y: number }>();

  constructor(private readonly player: Player, actions: TouchActions) {
    document.body.classList.add('touch');

    this.button('touch-grab', actions.onGrab);
    this.button('touch-pause', actions.onPause);
    this.button('touch-mute', actions.onMute);

    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.stickId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.moveStick(e);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.player.move.x = this.player.move.y = 0;
      this.knob.style.transform = '';
    };
    this.stick.addEventListener('pointerup', endStick);
    this.stick.addEventListener('pointercancel', endStick);

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
    this.stickId = null;
    this.lookPointers.clear();
    this.player.move.x = this.player.move.y = 0;
    this.knob.style.transform = '';
  }

  private button(id: string, onPress: () => void): void {
    el(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPress();
    });
  }

  private moveStick(e: PointerEvent): void {
    const rect = this.stick.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = e.clientX - (rect.left + radius);
    let dy = e.clientY - (rect.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx *= radius / len;
      dy *= radius / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.player.move.x = dx / radius;
    this.player.move.y = -dy / radius;
  }
}
