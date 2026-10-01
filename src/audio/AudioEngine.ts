/**
 * Áudio em canais: Mestre → { Música, Efeitos (SFX), Ambiente }.
 *
 * Ainda não há arquivos de som: tudo é sintetizado com Web Audio (placeholders
 * originais). Quando os áudios definitivos chegarem, basta trocar o corpo de
 * `sfx()` / `startMusic()` / `startAmbient()` por buffers carregados — os canais,
 * volumes e o painel de Configurações continuam iguais.
 */
export type SfxName =
  | 'growlWin'
  | 'growlLose'
  | 'fireBarrier'
  | 'frostBolt'
  | 'frostHit'
  | 'cleave'
  | 'bash'
  | 'hit'
  | 'enemyDeath'
  | 'heroDeath'
  | 'soul'
  | 'levelup'
  | 'drop'
  | 'victory'
  | 'defeat'
  | 'ui'
  | 'nova'
  | 'thunder'
  | 'roar'
  | 'shock'
  | 'coin'
  | 'refineOk'
  | 'refineFail'
  | 'bow'
  | 'rainArrows'
  | 'meteor'
  | 'spell'
  | 'roulette'
  | 'jackpot'
  | 'cityHit'
  | 'ruin'
  | 'mud'
  | 'sandstorm';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  muted: boolean;
}

/** Evita que 40 zumbis morrendo no mesmo tick virem uma parede de ruído. */
const MIN_GAP: Partial<Record<SfxName, number>> = { hit: 0.06, enemyDeath: 0.08, soul: 0.05, frostBolt: 0.05, frostHit: 0.05, cityHit: 0.35, sandstorm: 2 };

export class AudioEngine {
  private ctx?: AudioContext;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private ambient!: GainNode;
  private noise!: AudioBuffer;
  private vol: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.6, muted: false };
  private readonly lastPlay = new Map<SfxName, number>();
  /** Música da tela inicial (arquivo real); só toca no menu. */
  private menuTrack?: HTMLAudioElement;
  private menuFade = 1;
  private menuWanted = false;

  /**
   * Começa a música do menu. Na versão desktop toca na hora; no navegador, se o autoplay
   * for bloqueado, começa no primeiro clique/tecla do jogador ainda na tela inicial.
   */
  playMenuMusic(url = 'audio/menu.mp3'): void {
    this.menuWanted = true;
    this.menuFade = 1;
    this.applyMenu();
    void this.menuReady(url).then(() => this.tryPlayMenu());
  }

  /**
   * O arquivo é lido inteiro para a memória (blob) antes de tocar: o protocolo interno do
   * executável (app://) não faz streaming de mídia, então tocar direto pela URL ficava mudo.
   */
  private menuLoad?: Promise<void>;
  private menuReady(url: string): Promise<void> {
    this.menuLoad ??= fetch(new URL(url, document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => {
        const a = (this.menuTrack = new Audio(URL.createObjectURL(b)));
        a.loop = true;
        this.applyMenu();
      })
      .catch((err) => console.warn('Música do menu indisponível.', err));
    return this.menuLoad;
  }

  private tryPlayMenu = (): void => {
    const a = this.menuTrack;
    if (!this.menuWanted || !a) return;
    a.play().then(
      () => {
        window.removeEventListener('pointerdown', this.tryPlayMenu, true);
        window.removeEventListener('keydown', this.tryPlayMenu, true);
      },
      () => {
        // sem permissão de autoplay: tenta de novo no primeiro gesto do jogador
        window.addEventListener('pointerdown', this.tryPlayMenu, true);
        window.addEventListener('keydown', this.tryPlayMenu, true);
      },
    );
  };

  /** Sai do menu: a música some suavemente e para (não toca durante a partida). */
  stopMenuMusic(fadeMs = 1400): void {
    this.menuWanted = false;
    const a = this.menuTrack;
    if (!a) return;
    const t0 = performance.now();
    const step = () => {
      if (this.menuWanted) return; // voltou ao menu durante o fade
      this.menuFade = Math.max(0, 1 - (performance.now() - t0) / fadeMs);
      this.applyMenu();
      if (this.menuFade > 0) requestAnimationFrame(step);
      else {
        a.pause();
        a.currentTime = 0;
      }
    };
    requestAnimationFrame(step);
  }

  private applyMenu(): void {
    if (!this.menuTrack) return;
    const v = this.vol.muted ? 0 : this.vol.master * this.vol.music;
    this.menuTrack.volume = Math.min(1, Math.max(0, v * 0.9 * this.menuFade));
  }

  /** Precisa de um gesto do jogador (clique/tecla) — chamado ao sair da tela de login. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      this.startGameMusic();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // segura picos de hordas grandes
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = this.bus();
    this.sfxBus = this.bus();
    this.ambient = this.bus();
    // 2 s de ruído branco reaproveitado por todos os sons
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    this.gameMusic = ctx.createGain();
    this.gameMusic.connect(this.music);
    this.startAmbient();
    this.startGameMusic();
  }

  private gameMusic!: GainNode;
  private gameMusicOn = false;
  private gameLoopRunning = false;

  /** Trilha da partida (entra suave ao sair do menu). */
  startGameMusic(): void {
    if (!this.ctx) return;
    this.gameMusicOn = true;
    const t = this.ctx.currentTime;
    this.gameMusic.gain.cancelScheduledValues(t);
    this.gameMusic.gain.setTargetAtTime(1, t, 0.6);
    if (!this.gameLoopRunning) this.startMusic();
  }

  /** Voltando ao menu: a trilha da partida some (o menu tem a própria música). */
  stopGameMusic(): void {
    if (!this.ctx) return;
    this.gameMusicOn = false;
    const t = this.ctx.currentTime;
    this.gameMusic.gain.cancelScheduledValues(t);
    this.gameMusic.gain.setTargetAtTime(0, t, 0.25);
  }

  setVolumes(v: Volumes): void {
    this.vol = { ...v };
    this.apply();
    this.applyMenu();
  }

  get started(): boolean {
    return !!this.ctx;
  }

  private bus(): GainNode {
    const g = this.ctx!.createGain();
    g.connect(this.master);
    return g;
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.05);
    ramp(this.master, this.vol.muted ? 0 : this.vol.master);
    ramp(this.music, this.vol.music * 0.35);
    ramp(this.sfxBus, this.vol.sfx);
    ramp(this.ambient, this.vol.ambient * 0.5);
  }

  // ---------------- blocos de síntese ----------------

  private env(g: GainNode, t: number, a: number, peak: number, dec: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private noiseHit(t: number, o: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number; peak: number; a: number; dec: number; out?: AudioNode }): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.a + o.dec);
    const g = c.createGain();
    this.env(g, t, o.a, o.peak, o.dec);
    src.connect(f).connect(g).connect(o.out ?? this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + o.a + o.dec + 0.05);
  }

  private tone(t: number, o: { type: OscillatorType; freq: number; freqEnd?: number; peak: number; a: number; dec: number; out?: AudioNode; detune?: number }): void {
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.a + o.dec);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    this.env(g, t, o.a, o.peak, o.dec);
    osc.connect(g).connect(o.out ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + o.a + o.dec + 0.05);
  }

  // ---------------- efeitos ----------------

  sfx(name: SfxName): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.vol.muted) return;
    const t = c.currentTime;
    const gap = MIN_GAP[name];
    if (gap && t - (this.lastPlay.get(name) ?? -1) < gap) return;
    this.lastPlay.set(name, t);
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'fireBarrier': // rugido de chama subindo
        this.noiseHit(t, { type: 'lowpass', freq: 300, freqEnd: 2400, q: 0.7, peak: 0.55, a: 0.25, dec: 1.1 });
        this.noiseHit(t + 0.05, { type: 'bandpass', freq: 900, freqEnd: 300, q: 0.8, peak: 0.25, a: 0.15, dec: 0.9 });
        this.tone(t, { type: 'sawtooth', freq: 70, freqEnd: 45, peak: 0.12, a: 0.1, dec: 0.9 });
        break;
      case 'frostBolt': // sopro cristalino rápido
        this.noiseHit(t, { type: 'highpass', freq: 3000, freqEnd: 7000, peak: 0.12, a: 0.01, dec: 0.18 });
        this.tone(t, { type: 'sine', freq: r(1300, 1500), freqEnd: 2200, peak: 0.08, a: 0.005, dec: 0.15 });
        break;
      case 'frostHit': // estilhaço de gelo
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.025, { type: 'triangle', freq: r(2400, 4200), peak: 0.07, a: 0.002, dec: 0.12 });
        this.noiseHit(t, { type: 'highpass', freq: 4000, peak: 0.14, a: 0.002, dec: 0.12 });
        break;
      case 'cleave': // lâmina cortando o ar + baque
        this.noiseHit(t, { type: 'bandpass', freq: 600, freqEnd: 2600, q: 1.5, peak: 0.35, a: 0.03, dec: 0.2 });
        this.tone(t + 0.08, { type: 'sine', freq: 120, freqEnd: 55, peak: 0.35, a: 0.004, dec: 0.22 });
        break;
      case 'bash': // golpe pesado: baque grave + estalo metálico
        this.tone(t, { type: 'sine', freq: 95, freqEnd: 38, peak: 0.6, a: 0.003, dec: 0.3 });
        this.noiseHit(t, { type: 'lowpass', freq: 1400, freqEnd: 200, peak: 0.45, a: 0.002, dec: 0.25 });
        this.tone(t, { type: 'square', freq: r(1700, 1900), peak: 0.05, a: 0.001, dec: 0.08 });
        break;
      case 'hit':
        this.noiseHit(t, { type: 'lowpass', freq: r(700, 1100), freqEnd: 150, peak: 0.18, a: 0.002, dec: 0.1 });
        break;
      case 'enemyDeath': // gemido curto e grave
        this.tone(t, { type: 'sawtooth', freq: r(150, 190), freqEnd: 60, peak: 0.07, a: 0.02, dec: 0.4 });
        this.noiseHit(t, { type: 'lowpass', freq: 500, freqEnd: 120, peak: 0.12, a: 0.01, dec: 0.3 });
        break;
      case 'heroDeath':
        this.tone(t, { type: 'triangle', freq: 330, freqEnd: 110, peak: 0.2, a: 0.02, dec: 1.2 });
        break;
      case 'soul': // sininho etéreo subindo
        this.tone(t, { type: 'sine', freq: r(880, 990), freqEnd: 1760, peak: 0.05, a: 0.02, dec: 0.35 });
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, { type: 'triangle', freq: f, peak: 0.16, a: 0.01, dec: 0.5 }));
        break;
      case 'drop':
        [988, 1319].forEach((f, i) => this.tone(t + i * 0.07, { type: 'sine', freq: f, peak: 0.12, a: 0.005, dec: 0.4 }));
        break;
      case 'victory':
        [392, 494, 587, 784].forEach((f, i) => this.tone(t + i * 0.16, { type: 'triangle', freq: f, peak: 0.18, a: 0.02, dec: 0.9 }));
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => this.tone(t + i * 0.22, { type: 'triangle', freq: f, peak: 0.16, a: 0.03, dec: 1.0 }));
        break;
      case 'ui':
        this.tone(t, { type: 'sine', freq: 660, peak: 0.07, a: 0.002, dec: 0.06 });
        break;
      case 'nova': // estalo de gelo em expansão
        this.noiseHit(t, { type: 'highpass', freq: 2500, freqEnd: 6000, peak: 0.3, a: 0.01, dec: 0.5 });
        for (let i = 0; i < 5; i++) this.tone(t + i * 0.04, { type: 'triangle', freq: r(1800, 3600), peak: 0.06, a: 0.002, dec: 0.25 });
        this.tone(t, { type: 'sine', freq: 180, freqEnd: 60, peak: 0.25, a: 0.005, dec: 0.4 });
        break;
      case 'thunder': // trovão: estalo seco + ronco grave
        this.noiseHit(t, { type: 'highpass', freq: 1800, peak: 0.45, a: 0.001, dec: 0.12 });
        this.noiseHit(t + 0.04, { type: 'lowpass', freq: 600, freqEnd: 80, peak: 0.5, a: 0.02, dec: 1.2 });
        break;
      case 'roar': // grito de guerra
        this.tone(t, { type: 'sawtooth', freq: 140, freqEnd: 95, peak: 0.22, a: 0.05, dec: 0.6 });
        this.tone(t, { type: 'sawtooth', freq: 212, freqEnd: 150, peak: 0.12, a: 0.05, dec: 0.55 });
        this.noiseHit(t, { type: 'bandpass', freq: 700, q: 1.2, peak: 0.18, a: 0.05, dec: 0.5 });
        break;
      case 'shock': // golpe no chão
        this.tone(t, { type: 'sine', freq: 80, freqEnd: 30, peak: 0.8, a: 0.003, dec: 0.6 });
        this.noiseHit(t, { type: 'lowpass', freq: 1200, freqEnd: 120, peak: 0.6, a: 0.003, dec: 0.7 });
        break;
      case 'coin':
        [1320, 1760].forEach((f, i) => this.tone(t + i * 0.06, { type: 'triangle', freq: f, peak: 0.08, a: 0.003, dec: 0.18 }));
        break;
      case 'refineOk':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(t + i * 0.08, { type: 'triangle', freq: f, peak: 0.14, a: 0.005, dec: 0.45 }));
        this.noiseHit(t, { type: 'highpass', freq: 3000, peak: 0.12, a: 0.002, dec: 0.2 });
        break;
      case 'bow': // corda do arco + zunido
        this.tone(t, { type: 'triangle', freq: r(220, 250), freqEnd: 140, peak: 0.12, a: 0.002, dec: 0.12 });
        this.noiseHit(t + 0.01, { type: 'bandpass', freq: 2400, freqEnd: 900, q: 2, peak: 0.12, a: 0.005, dec: 0.18 });
        break;
      case 'rainArrows':
        for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.04, { type: 'bandpass', freq: r(1800, 3000), q: 3, peak: 0.08, a: 0.005, dec: 0.12 });
        this.noiseHit(t + 0.2, { type: 'lowpass', freq: 700, freqEnd: 150, peak: 0.25, a: 0.01, dec: 0.3 });
        break;
      case 'spell': // magia sombria de monstro
        this.tone(t, { type: 'sawtooth', freq: 160, freqEnd: 420, peak: 0.08, a: 0.05, dec: 0.3 });
        this.noiseHit(t, { type: 'bandpass', freq: 600, q: 4, peak: 0.1, a: 0.05, dec: 0.3 });
        break;
      case 'meteor':
        this.noiseHit(t, { type: 'lowpass', freq: 2000, freqEnd: 90, peak: 0.6, a: 0.005, dec: 0.9 });
        this.tone(t, { type: 'sine', freq: 70, freqEnd: 30, peak: 0.6, a: 0.005, dec: 0.7 });
        break;
      case 'roulette':
        this.tone(t, { type: 'square', freq: 1400, peak: 0.03, a: 0.001, dec: 0.03 });
        break;
      case 'jackpot':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.07, { type: 'triangle', freq: f, peak: 0.16, a: 0.005, dec: 0.6 }));
        this.noiseHit(t, { type: 'highpass', freq: 4000, peak: 0.15, a: 0.002, dec: 0.5 });
        break;
      case 'growlWin': // chefe vitorioso: rosnado em sílabas ("OR-CUS CAS-CA GROS-SA") + gargalhada grave
        [0, 0.26, 0.62, 0.86, 1.22, 1.46].forEach((d, i) => {
          const f = 92 - (i % 2) * 14 + (i > 3 ? -10 : 0);
          this.tone(t + d, { type: 'sawtooth', freq: f, freqEnd: f * 0.78, peak: 0.26, a: 0.03, dec: 0.24, detune: r(-20, 20) });
          this.tone(t + d, { type: 'square', freq: f * 1.5, freqEnd: f * 1.1, peak: 0.06, a: 0.03, dec: 0.2 });
          this.noiseHit(t + d, { type: 'bandpass', freq: 520 + (i % 3) * 180, q: 2.2, peak: 0.2, a: 0.02, dec: 0.22 });
        });
        for (let k = 0; k < 5; k++) this.tone(t + 2.0 + k * 0.17, { type: 'sawtooth', freq: 110 - k * 6, freqEnd: 80 - k * 5, peak: 0.18, a: 0.02, dec: 0.14 });
        this.noiseHit(t + 1.9, { type: 'lowpass', freq: 400, freqEnd: 90, peak: 0.3, a: 0.2, dec: 1.4 });
        break;
      case 'growlLose': // chefe caído: fala arrastada e um urro final que some
        [0, 0.24, 0.46, 0.74, 0.98, 1.22, 1.5, 1.76].forEach((d, i) => {
          const f = 84 - i * 2;
          this.tone(t + d, { type: 'sawtooth', freq: f, freqEnd: f * 0.8, peak: 0.2, a: 0.03, dec: 0.2, detune: r(-25, 25) });
          this.noiseHit(t + d, { type: 'bandpass', freq: 450 + (i % 3) * 160, q: 2, peak: 0.16, a: 0.02, dec: 0.2 });
        });
        this.tone(t + 2.2, { type: 'sawtooth', freq: 150, freqEnd: 42, peak: 0.3, a: 0.15, dec: 2.0 });
        this.tone(t + 2.2, { type: 'sawtooth', freq: 226, freqEnd: 60, peak: 0.14, a: 0.15, dec: 1.8 });
        this.noiseHit(t + 2.2, { type: 'lowpass', freq: 900, freqEnd: 80, peak: 0.35, a: 0.1, dec: 2.0 });
        break;
      case 'refineFail':
        this.noiseHit(t, { type: 'bandpass', freq: 900, q: 3, peak: 0.25, a: 0.002, dec: 0.3 });
        [392, 311].forEach((f, i) => this.tone(t + i * 0.15, { type: 'square', freq: f, peak: 0.06, a: 0.005, dec: 0.3 }));
        break;
      case 'cityHit': // sino de alarme da muralha
        [587, 740].forEach((f, i) => {
          this.tone(t + i * 0.18, { type: 'triangle', freq: f, peak: 0.14, a: 0.004, dec: 1.1 });
          this.tone(t + i * 0.18, { type: 'sine', freq: f * 2.76, peak: 0.04, a: 0.004, dec: 0.6 });
        });
        break;
      case 'ruin': // pedra desabando: estrondo grave + cascalho
        this.noiseHit(t, { type: 'lowpass', freq: 500, freqEnd: 90, peak: 0.55, a: 0.01, dec: 0.9 });
        for (let i = 0; i < 6; i++) this.noiseHit(t + 0.08 + i * r(0.05, 0.1), { type: 'bandpass', freq: r(900, 2200), q: 3, peak: 0.12, a: 0.003, dec: 0.08 });
        break;
      case 'mud': // chapinhar
        this.noiseHit(t, { type: 'lowpass', freq: 700, freqEnd: 200, peak: 0.25, a: 0.02, dec: 0.35 });
        this.tone(t, { type: 'sine', freq: 180, freqEnd: 90, peak: 0.08, a: 0.01, dec: 0.25 });
        break;
      case 'sandstorm': // rajada de vento com areia
        this.noiseHit(t, { type: 'bandpass', freq: 600, freqEnd: 1800, q: 0.7, peak: 0.3, a: 0.8, dec: 2.2, out: this.ambient });
        this.noiseHit(t + 0.2, { type: 'highpass', freq: 3000, peak: 0.08, a: 0.6, dec: 2.0, out: this.ambient });
        break;
    }
  }

  // ---------------- ambiência do bioma ----------------
  private biome = '';
  private biomeTimer = 0;
  private wind?: { gain: GainNode; filter: BiquadFilterNode };

  /** Sons de fundo do bioma: grilos, corvos e galhos na floresta; vento forte no deserto. */
  setAmbience(theme: string): void {
    this.biome = theme;
    if (!this.ctx) return;
    if (this.wind) {
      const t = this.ctx.currentTime;
      const strong = theme === 'desert' || theme === 'mountain' || theme === 'ash';
      this.wind.gain.gain.setTargetAtTime(strong ? 0.55 : 0.35, t, 1.5);
      this.wind.filter.frequency.setTargetAtTime(strong ? 700 : 420, t, 1.5);
    }
    if (!this.biomeTimer) this.biomeTimer = window.setInterval(() => this.ambienceTick(), 250);
  }

  private ambienceTick(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.vol.muted || !this.gameMusicOn) return;
    const t = c.currentTime;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    const out = this.ambient;
    if (this.biome === 'forest') {
      // grilos: pares de trinados agudos
      if (Math.random() < 0.35) {
        const f = r(4200, 5200);
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.055, { type: 'sine', freq: f, peak: 0.018, a: 0.005, dec: 0.035, out });
      }
      // corvo distante
      if (Math.random() < 0.012)
        for (let i = 0; i < (Math.random() < 0.5 ? 2 : 3); i++) {
          const tt = t + i * 0.32;
          this.noiseHit(tt, { type: 'bandpass', freq: r(900, 1200), q: 4, peak: 0.07, a: 0.02, dec: 0.18, out });
          this.tone(tt, { type: 'sawtooth', freq: r(420, 480), freqEnd: 330, peak: 0.02, a: 0.02, dec: 0.18, out });
        }
      // galho quebrando
      if (Math.random() < 0.01) {
        this.noiseHit(t, { type: 'highpass', freq: 1800, peak: 0.08, a: 0.002, dec: 0.04, out });
        this.noiseHit(t + 0.07, { type: 'bandpass', freq: 1200, q: 2, peak: 0.05, a: 0.002, dec: 0.06, out });
      }
    } else if (this.biome === 'desert') {
      if (Math.random() < 0.02) this.noiseHit(t, { type: 'bandpass', freq: r(500, 900), freqEnd: r(1200, 1600), q: 0.8, peak: 0.1, a: 0.9, dec: 1.6, out });
      // abutre ao longe
      if (Math.random() < 0.006) this.tone(t, { type: 'triangle', freq: 1300, freqEnd: 900, peak: 0.025, a: 0.05, dec: 0.5, out });
    } else if (this.biome === 'bridge') {
      // água batendo nos pilares
      if (Math.random() < 0.08) this.noiseHit(t, { type: 'lowpass', freq: r(300, 600), peak: 0.05, a: 0.1, dec: 0.5, out });
    }
  }

  // ---------------- ambiente e música ----------------

  /** Vento noturno contínuo com rajadas lentas. */
  private startAmbient(): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(f.frequency);
    const g = c.createGain();
    g.gain.value = 0.35;
    src.connect(f).connect(g).connect(this.ambient);
    src.start();
    lfo.start();
    this.wind = { gain: g, filter: f };
    if (this.biome) this.setAmbience(this.biome);
  }

  /** Trilha gerada: acordes menores lentos, pad escuro (placeholder original). */
  private startMusic(): void {
    const c = this.ctx!;
    const chords = [
      [110, 130.8, 164.8], // Lá menor
      [87.3, 110, 130.8], // Fá
      [98, 123.5, 146.8], // Sol
      [82.4, 98, 123.5], // Mi menor
    ];
    const len = 6; // s por acorde
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(this.gameMusic);
    let i = 0;
    this.gameLoopRunning = true;
    const schedule = () => {
      if (!this.ctx || !this.gameMusicOn) {
        this.gameLoopRunning = false;
        lp.disconnect();
        return;
      }
      const t = c.currentTime + 0.1;
      for (const f of chords[i % chords.length]) {
        for (const det of [-6, 6]) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 2);
          g.gain.linearRampToValueAtTime(0.0001, t + len + 1.5);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + len + 1.6);
        }
      }
      // nota aguda esparsa por cima
      if (i % 2 === 0) this.tone(t + 2.5, { type: 'sine', freq: chords[i % chords.length][2] * 4, peak: 0.04, a: 0.4, dec: 2.5, out: lp });
      i++;
      window.setTimeout(schedule, len * 1000);
    };
    schedule();
  }
}
