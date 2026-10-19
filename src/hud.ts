export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export interface OverlayAction {
  label: string;
  onClick: () => void;
  secondary?: boolean;
}

export class Hud {
  private readonly hud = el('hud');
  private readonly level = el('hud-level');
  private readonly timer = el('hud-timer');
  private readonly overlay = el('overlay');
  private readonly title = el('ov-title');
  private readonly body = el('ov-body');
  private readonly actions = el('ov-actions');
  private readonly keys = el('hud-keys');
  private readonly crosshair = el('crosshair');
  private readonly toastEl = el('toast');
  private toastTimer = 0;

  showHud(visible: boolean): void {
    this.hud.hidden = !visible;
  }

  setKeys(text: string): void {
    this.keys.textContent = text;
  }

  setHolding(holding: boolean): void {
    this.crosshair.classList.toggle('holding', holding);
  }

  setLevel(n: number): void {
    this.level.textContent = `Level ${n}`;
  }

  setTimer(seconds: number): void {
    this.timer.textContent = formatTime(seconds);
    this.timer.classList.toggle('low', seconds <= 10);
  }

  showOverlay(title: string, lines: { text: string; strong?: boolean }[], actions: OverlayAction[]): void {
    this.title.textContent = title;
    this.body.replaceChildren(
      ...lines.map((l) => {
        const p = document.createElement('p');
        p.textContent = l.text;
        if (l.strong) p.className = 'strong';
        return p;
      }),
    );
    this.actions.className = 'actions';
    this.actions.replaceChildren(
      ...actions.map((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.label;
        if (a.secondary) b.className = 'secondary';
        b.addEventListener('click', a.onClick);
        return b;
      }),
    );
    this.overlay.hidden = false;
    this.actions.querySelector('button')?.focus();
  }

  /** Replace the text of the first overlay line (used for progress). */
  setOverlayLine(text: string): void {
    const first = this.body.firstElementChild;
    if (first) first.textContent = text;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2500);
  }
}
