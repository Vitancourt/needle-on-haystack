/** Procedural sound (WebAudio): no asset files. The context is created on first user gesture. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: AudioBufferSourceNode | null = null;

  constructor(public muted: boolean) {}

  ensure(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  startAmbient(): void {
    if (!this.ctx || !this.master || this.ambient) return;
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 450;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambient = src;
  }

  stopAmbient(): void {
    this.ambient?.stop();
    this.ambient = null;
  }

  /** Bright two-note chime. */
  found(): void {
    this.tone(880, 0, 0.25, 'sine', 0.25);
    this.tone(1318, 0.12, 0.45, 'sine', 0.25);
  }

  /** Low buzz. */
  lost(): void {
    this.tone(150, 0, 0.5, 'sawtooth', 0.15);
  }

  private tone(freq: number, delay: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
}
