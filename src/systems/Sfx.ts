import Phaser from 'phaser';

interface ToneOptions {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  delay?: number;
}

interface WindNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
  lfo: OscillatorNode;
}

/**
 * 程序化音效：音频素材到位前，用 Web Audio 合成占位音效与森林氛围。
 * 接口保持稳定，B 的正式音频到货后在内部换成 this.scene.sound.play 即可，调用方不用改。
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private wind: WindNodes | null = null;
  private birdTimer: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
    this.startAmbient();
  }

  jump(): void {
    this.tone({ type: 'triangle', from: 200, to: 470, duration: 0.13, volume: 0.32 });
  }

  land(): void {
    this.tone({ type: 'sine', from: 150, to: 55, duration: 0.1, volume: 0.38 });
    this.noise(0.07, 0.16, 800);
  }

  step(): void {
    this.noise(0.045, 0.07, 1400);
  }

  key(): void {
    // A5-C#6-E6 大三和弦琶音，明亮的“获得”感
    this.tone({ from: 880, duration: 0.16, volume: 0.26 });
    this.tone({ from: 1108.7, duration: 0.18, volume: 0.26, delay: 0.09 });
    this.tone({ from: 1318.5, duration: 0.26, volume: 0.28, delay: 0.18 });
  }

  door(): void {
    this.tone({ type: 'triangle', from: 196, duration: 0.55, volume: 0.2 });
    this.tone({ type: 'triangle', from: 294, duration: 0.55, volume: 0.16, delay: 0.05 });
  }

  enter(): void {
    this.tone({ from: 523, to: 262, duration: 0.42, volume: 0.28 });
  }

  fall(): void {
    this.tone({ type: 'square', from: 330, to: 110, duration: 0.28, volume: 0.16 });
  }

  startAmbient(): void {
    this.startWind();
    // 音频可能在进入场景后才被用户手势解锁，解锁后补开风声
    this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.startWind());
    this.birdTimer = this.scene.time.addEvent({
      delay: 5600,
      loop: true,
      callback: () => {
        if (Math.random() < 0.75) {
          this.chirp();
        }
      },
    });
  }

  destroy(): void {
    this.birdTimer?.remove(false);
    this.birdTimer = null;
    if (this.wind) {
      try {
        this.wind.source.stop();
        this.wind.lfo.stop();
      } catch {
        // 节点可能已随 AudioContext 关闭
      }
      this.wind = null;
    }
  }

  private chirp(): void {
    const base = 1700 + Math.random() * 1100;
    const notes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < notes; i++) {
      const f = base * (1 + i * 0.12);
      this.tone({ from: f, to: f * 1.18, duration: 0.07, volume: 0.05, delay: i * 0.11 });
    }
  }

  private startWind(): void {
    if (this.wind || !this.ready() || !this.context || !this.master || !this.ensureNoise()) {
      return;
    }
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.02;
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    lfo.start();
    this.wind = { source, gain, lfo };
  }

  /** 首次用户手势后 Phaser 才解锁音频；未解锁前静默跳过 */
  private ready(): boolean {
    if (!this.context) {
      const manager = this.scene.sound as unknown as { context?: AudioContext };
      const context = manager.context;
      if (!context) {
        return false;
      }
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(context.destination);
    }
    return this.context.state === 'running';
  }

  private ensureNoise(): boolean {
    if (this.noiseBuffer || !this.context) {
      return this.noiseBuffer !== null;
    }
    const ctx = this.context;
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return true;
  }

  private tone(options: ToneOptions): void {
    if (!this.ready() || !this.context || !this.master) {
      return;
    }
    const ctx = this.context;
    const t0 = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.from, t0);
    if (options.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), t0 + options.duration);
    }
    const volume = options.volume ?? 0.35;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + options.duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + options.duration + 0.05);
  }

  private noise(duration: number, volume: number, lowpass: number, delay = 0): void {
    if (!this.ready() || !this.context || !this.master || !this.ensureNoise()) {
      return;
    }
    const ctx = this.context;
    const t0 = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }
}
