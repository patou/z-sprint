const MUTE_STORAGE_KEY = 'z_sprint_muted';

class RetroSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      this.muted = false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(mute));
    } catch {
      // Ignore storage errors
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'square',
    volume: number = 0.08,
    delay: number = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public playStart(): void {
    this.playTone(330, 330, 0.07, 'square', 0.07, 0);
    this.playTone(440, 440, 0.07, 'square', 0.07, 0.08);
    this.playTone(660, 880, 0.14, 'square', 0.08, 0.16);
  }

  public playLaneSwitch(): void {
    this.playTone(220, 340, 0.055, 'triangle', 0.06);
  }

  public playJump(): void {
    this.playTone(260, 620, 0.12, 'square', 0.065);
  }

  public playFastDrop(): void {
    this.playTone(460, 150, 0.08, 'triangle', 0.06);
  }

  public playCoin(): void {
    this.playTone(987.77, 987.77, 0.045, 'square', 0.065, 0);
    this.playTone(1318.51, 1318.51, 0.09, 'square', 0.065, 0.045);
  }

  public playStamina(): void {
    this.playTone(440, 440, 0.05, 'triangle', 0.08, 0);
    this.playTone(554.37, 554.37, 0.05, 'triangle', 0.08, 0.05);
    this.playTone(659.25, 880, 0.12, 'triangle', 0.08, 0.1);
  }

  public playTurbo(): void {
    this.playTone(523.25, 523.25, 0.05, 'sawtooth', 0.06, 0);
    this.playTone(659.25, 659.25, 0.05, 'sawtooth', 0.06, 0.05);
    this.playTone(783.99, 783.99, 0.05, 'sawtooth', 0.06, 0.1);
    this.playTone(1046.5, 1318.51, 0.18, 'square', 0.07, 0.15);
  }

  public playSmash(): void {
    this.playTone(300, 90, 0.12, 'sawtooth', 0.07);
    this.playTone(700, 920, 0.08, 'square', 0.05, 0.04);
  }

  public playHit(): void {
    this.playTone(180, 55, 0.22, 'sawtooth', 0.1);
    this.playTone(110, 42, 0.25, 'square', 0.08, 0.03);
  }

  public playGameOver(): void {
    this.playTone(392, 370, 0.12, 'square', 0.07, 0);
    this.playTone(349.23, 329.63, 0.12, 'square', 0.07, 0.13);
    this.playTone(293.66, 196, 0.28, 'sawtooth', 0.08, 0.26);
  }
}

export const soundFX = new RetroSoundEngine();
