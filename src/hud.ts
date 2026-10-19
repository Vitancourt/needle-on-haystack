export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export class Hud {
  private readonly hud = el('hud');
  private readonly level = el('hud-level');
  private readonly timer = el('hud-timer');
  private readonly overlay = el('overlay');
  private readonly title = el('ov-title');
  private readonly body = el('ov-body');
  private readonly button = el<HTMLButtonElement>('ov-btn');
  private readonly toastEl = el('toast');
  private toastTimer = 0;
  private onButton: (() => void) | null = null;

  constructor() {
    this.button.addEventListener('click', () => this.onButton?.());
  }

  showHud(visible: boolean): void {
    this.hud.hidden = !visible;
  }

  setLevel(n: number): void {
    this.level.textContent = `Level ${n}`;
  }

  setTimer(seconds: number): void {
    this.timer.textContent = formatTime(seconds);
    this.timer.classList.toggle('low', seconds <= 10);
  }

  showOverlay(title: string, lines: { text: string; strong?: boolean }[], button: string, onClick: () => void): void {
    this.title.textContent = title;
    this.body.replaceChildren(
      ...lines.map((l) => {
        const p = document.createElement('p');
        p.textContent = l.text;
        if (l.strong) p.className = 'strong';
        return p;
      }),
    );
    this.button.textContent = button;
    this.onButton = onClick;
    this.overlay.hidden = false;
    this.button.focus();
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
    this.onButton = null;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2500);
  }
}
