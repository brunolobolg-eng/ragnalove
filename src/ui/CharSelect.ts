import * as THREE from 'three';
import { ATTRIBUTES_CONFIG, ATTR_KEYS, ATTR_LABEL, computeStats } from '../core/progression/attributes';
import type { HeroKind } from '../core/progression/skills';
import { ModelUnitView } from '../render/units/model/ModelUnitView';
import { gearBonus } from '../core/progression/equipment';
import { starterWeapon } from '../core/progression/profile';
import { SKILL_ICONS } from './icons';
import { HERO_INFO, HERO_ORDER, emptyMeta, type MetaStats } from '../config/heroes';
import { SKILL_BY_ID, heroSkills } from '../core/progression/skills';
import { CHARSELECT_ART } from '../config/visualConfig';

/**
 * Seleção de personagem: fileira de cartas ilustradas (brilho, faíscas e som ao passar o
 * mouse) e, embaixo, o painel do herói escolhido (frase, atributos, habilidades e chibi).
 * Os modelos 3D continuam carregados aqui (fora da tela) para gerar retratos e quadros
 * de caminhada usados no mapa e na HUD.
 */
const INFO = Object.fromEntries(
  HERO_ORDER.map((k) => {
    const h = HERO_INFO[k];
    return [k, { name: h.name, role: h.role, line: h.line, color: h.color, skills: [[h.area, SKILL_BY_ID[h.area].name], [h.basic, SKILL_BY_ID[h.basic].name]] as [string, string][] }];
  }),
) as Record<HeroKind, { name: string; role: string; line: string; skills: [string, string][]; color: number }>;
const ORDER: HeroKind[] = HERO_ORDER;
/** Distância entre os pedestais. */
const SPACING = 1.7;

export class CharSelect {
  readonly el: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 50);
  private readonly views = new Map<HeroKind, ModelUnitView>();
  private readonly spots = new Map<HeroKind, THREE.SpotLight>();
  private readonly rings = new Map<HeroKind, THREE.Mesh>();
  private sel: HeroKind = 'warrior';
  private raf = 0;
  private last = 0;
  private t = 0;
  private locked: HeroKind[] = [];
  private meta: MetaStats = emptyMeta();
  private onPick: (h: HeroKind) => void = () => {};
  private icons: Record<string, string> = {};
  /** faíscas da camada de efeitos (sobre as cartas) */
  private readonly fx: HTMLCanvasElement;
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }[] = [];
  private hover?: HTMLElement;
  private sparkAcc = 0;

  constructor(
    private readonly onBack: () => void,
    private readonly onUi: () => void,
    private readonly onHover: () => void = () => {},
  ) {
    this.el = document.createElement('div');
    this.el.className = 'charselect';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas class="cs-3d"></canvas>
      <div class="cs-bg" style="background-image:url('${CHARSELECT_ART.background}')"></div>
      <header class="cs-top">
        <div class="cs-brand"><i class="cs-star">✦</i><b>ROGUARD</b><span>Conheça os guardiões</span></div>
        <p class="cs-motto">O destino de um reino<small>é construído por aqueles que o defendem.</small></p>
      </header>
      <div class="cs-cards"></div>
      <div class="cs-divider"><span>Escolha seu campeão</span></div>
      <section class="cs-detail"></section>
      <canvas class="cs-fx"></canvas>
      <div class="cs-actions"><button data-a="back">Voltar</button><button class="primary" data-a="go">Começar jornada ➜</button></div>`;
    document.body.appendChild(this.el);
    const canvas = this.el.querySelector<HTMLCanvasElement>('.cs-3d')!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.buildScene();
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a],[data-h]');
      if (!b || b.hasAttribute('disabled')) return;
      this.onUi();
      if (b.dataset.h) this.select(b.dataset.h as HeroKind);
      else if (b.dataset.a === 'go') this.onPick(this.sel);
      else if (b.dataset.a === 'back') this.onBack();
    });
    this.fx = this.el.querySelector<HTMLCanvasElement>('.cs-fx')!;
    // passar o mouse: som + brilho (só ao entrar numa carta nova)
    this.el.addEventListener('mouseover', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.cs-card');
      if (card === this.hover) return;
      this.hover = card ?? undefined;
      if (card) this.onHover();
    });
    window.addEventListener('resize', () => this.resize());
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** O modelo 3D do herói mudou (GLB carregou): recria o boneco no pedestal. */
  refreshHero(k: HeroKind): void {
    const old = this.views.get(k);
    if (!old) return;
    const v = new ModelUnitView(k, 'party');
    v.hideHp();
    v.root.position.copy(old.root.position);
    v.setFacing(0, 1, true);
    v.dark = old.dark;
    old.dispose();
    this.scene.add(v.root);
    this.views.set(k, v);
  }

  open(onPick: (h: HeroKind) => void, locked: HeroKind[] = [], meta: MetaStats = emptyMeta()): void {
    this.onPick = onPick;
    this.locked = locked;
    this.meta = meta;
    for (const [k, v] of this.views) v.dark = locked.includes(k);
    this.el.hidden = false;
    this.resize();
    this.select(ORDER.find((h) => !locked.includes(h))!);
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.el.hidden) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close(): void {
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  /**
   * Quadros do herói andando (renderizados do modelo 3D, fundo transparente) —
   * usados como marcador animado da party no mapa-múndi.
   */
  walkFrames(k: HeroKind, n = 8, size = 160, face: [number, number] = [1, 0.35]): string[] {
    const v = this.views.get(k)!;
    // anda no lugar: a duração de um ciclo de passos fecha o laço dos quadros sem pulo
    const cycle = v.walkInPlace(true);
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const wasDark = v.dark;
    v.dark = false;
    const p = v.root.position;
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
    cam.position.set(p.x + 1.7, 2.9, p.z + 5.0);
    cam.lookAt(p.x, 1.15, p.z);
    // luz extra só para a captura (o palco da seleção é escuro de propósito)
    const fill = new THREE.HemisphereLight(0xfff4e0, 0x404860, 1.6);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(p.x + 3, 6, p.z + 5);
    sun.target.position.copy(p);
    this.scene.add(fill, sun, sun.target);
    // esconde o resto do cenário (pedestais, outros heróis); mantém as luzes
    const hidden: THREE.Object3D[] = [];
    for (const o of this.scene.children) {
      if (o === v.root || (o as THREE.Light).isLight || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
    v.setFacing(face[0], face[1], true);
    for (let i = 0; i < 30; i++) v.update(1 / 60, 0.5, 1, cam.quaternion);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);
    const bg = this.scene.background;
    this.scene.background = null;
    const frames: string[] = [];
    for (let f = 0; f < n; f++) {
      v.update(cycle / n, 0.5, 1, cam.quaternion);
      this.renderer.render(this.scene, cam);
      frames.push(this.renderer.domElement.toDataURL('image/png'));
    }
    this.scene.background = bg;
    for (const o of hidden) o.visible = true;
    this.scene.remove(fill, sun, sun.target);
    v.walkInPlace(false);
    v.setFacing(0, 1, true);
    for (let i = 0; i < 30; i++) v.update(1 / 60, 1, 1, this.camera.quaternion);
    v.dark = wasDark;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(oldSize.x || 1, oldSize.y || 1, false);
    return frames;
  }

  /** Corpo inteiro do herói, parado de frente (ficha do personagem). Fundo transparente. */
  fullBody(k: HeroKind, w = 300, h = 400): string {
    const v = this.views.get(k)!;
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const wasDark = v.dark;
    v.dark = false;
    const p = v.root.position;
    const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 30);
    cam.position.set(p.x + 0.5, 1.9, p.z + 5.4);
    cam.lookAt(p.x, 1.12, p.z);
    const hidden: THREE.Object3D[] = [];
    for (const o of this.scene.children) {
      if (o === v.root || (o as THREE.Light).isLight || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
    const fill = new THREE.HemisphereLight(0xfff4e0, 0x404860, 1.5);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(p.x + 2, 5, p.z + 5);
    sun.target.position.copy(p);
    this.scene.add(fill, sun, sun.target);
    v.setFacing(0.25, 1, true);
    for (let i = 0; i < 20; i++) v.update(1 / 60, 1, 1, cam.quaternion);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0);
    const bg = this.scene.background;
    this.scene.background = null;
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.background = bg;
    this.scene.remove(fill, sun, sun.target);
    for (const o of hidden) o.visible = true;
    v.setFacing(0, 1, true);
    v.dark = wasDark;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(oldSize.x || 1, oldSize.y || 1, false);
    return url;
  }

  /** Retrato do herói renderizado do modelo 3D (usado na HUD e no mapa). */
  portrait(k: HeroKind, size = 128): string {
    const v = this.views.get(k)!;
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const wasDark = v.dark;
    v.dark = false;
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    const p = v.root.position;
    cam.position.set(p.x, 1.65, p.z + 2.2);
    cam.lookAt(p.x, 1.25, p.z);
    for (const [, o] of this.views) o.update(0.016, 1, 1, cam.quaternion);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);
    const bg = this.scene.background;
    this.scene.background = null;
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.background = bg;
    v.dark = wasDark;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(oldSize.x || 1, oldSize.y || 1, false);
    return url;
  }

  private buildScene(): void {
    const S = this.scene;
    S.fog = new THREE.Fog(0x0a0c18, 12, 26);
    S.add(new THREE.HemisphereLight(0x8a9ad8, 0x1a1410, 0.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 0.85);
    key.position.set(-3, 8, 6);
    key.castShadow = true;
    S.add(key);
    // chão de pedra escura + névoa
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1c28 }));
    floor.receiveShadow = true;
    S.add(floor);
    ORDER.forEach((k, i) => {
      const x = (i - (ORDER.length - 1) / 2) * SPACING;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.84, 0.3, 24), new THREE.MeshLambertMaterial({ color: 0x3a3e52 }));
      ped.position.set(x, 0.15, 0);
      ped.receiveShadow = true;
      ped.castShadow = true;
      S.add(ped);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.82, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: INFO[k].color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.set(x, 0.31, 0);
      S.add(ring);
      this.rings.set(k, ring);
      const v = new ModelUnitView(k, 'party');
      v.hideHp();
      v.root.position.set(x, 0.3, 0);
      v.setFacing(0, 1, true);
      S.add(v.root);
      this.views.set(k, v);
      const spot = new THREE.SpotLight(INFO[k].color, 0, 9, 0.45, 0.6, 1.2);
      spot.position.set(x, 5.5, 2);
      spot.target.position.set(x, 0.5, 0);
      S.add(spot, spot.target);
      this.spots.set(k, spot);
    });
    this.camera.position.set(0, 5.4, 12.6);
    this.camera.lookAt(0, 1.0, 0);
  }

  private resize(): void {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.width = window.innerWidth;
    this.fx.height = window.innerHeight;
  }

  private select(h: HeroKind): void {
    if (this.locked.includes(h)) return;
    const changed = h !== this.sel;
    this.sel = h;
    this.renderSlots();
    this.renderInfo();
    if (changed || this.sparks.length === 0) {
      const card = this.el.querySelector<HTMLElement>(`.cs-card[data-h="${h}"]`);
      if (card) this.burst(card, CHARSELECT_ART.selectBurst);
    }
  }

  private renderSlots(): void {
    this.el.querySelector('.cs-cards')!.innerHTML = ORDER.map((k, i) => {
      const lock = this.locked.includes(k);
      const u = HERO_INFO[k].unlock;
      const [a, b] = u ? u.progress(this.meta) : [0, 0];
      return `<button class="cs-card ${k === this.sel ? 'on' : ''} ${lock ? 'locked' : ''}" data-h="${k}" ${lock ? 'disabled' : ''}
          style="--c:${hex(INFO[k].color)};--i:${i}" title="${lock && u ? u.text : INFO[k].role}">
        <span class="cs-art" style="background-image:url('${CHARSELECT_ART.cards[k]}')"></span>
        <i class="cs-shine"></i><i class="cs-frame"></i>
        <span class="cs-plate"><b>${lock ? '???' : INFO[k].name}</b><small>${lock ? 'Bloqueado' : INFO[k].role}</small></span>
        ${lock && u ? `<span class="cs-lock">🔒<small>${u.text}</small><em><i style="width:${b ? (a / b) * 100 : 0}%"></i></em><small>${a}/${b}</small></span>` : ''}
      </button>`;
    }).join('');
  }

  private icon(id: string): string {
    return (this.icons[id] ??= SKILL_ICONS[id]());
  }

  private renderInfo(): void {
    const k = this.sel;
    const base = ATTRIBUTES_CONFIG.base[k];
    const st = computeStats(k, base, gearBonus([starterWeapon(k)]));
    const bars = ATTR_KEYS.map((a) => `<div class="cs-attr"><span>${ATTR_LABEL[a]}</span><i><em style="width:${(base[a] / 7) * 100}%"></em></i><b>${base[a]}</b></div>`).join('');
    // habilidades iniciais primeiro, depois as da árvore (até 4)
    const skills = heroSkills(k)
      .slice()
      .sort((x, y) => (y.start > 0 ? 1 : 0) - (x.start > 0 ? 1 : 0) || x.tier - y.tier)
      .slice(0, 4)
      .map((sk) => {
        const ic = SKILL_ICONS[sk.id] ? `<img src="${this.icon(sk.id)}" alt="">` : '<img alt="">';
        return `<div class="cs-skill">${ic}<span><b>${sk.name}</b><em>${sk.kind === 'passive' ? 'Passiva' : 'Ativa'}${sk.start > 0 ? ' · inicial' : ''}</em><small>${sk.desc}</small></span></div>`;
      })
      .join('');
    const chibi = CHARSELECT_ART.chibis[k];
    const det = this.el.querySelector<HTMLElement>('.cs-detail')!;
    det.style.setProperty('--c', hex(INFO[k].color));
    det.innerHTML = `
      <div class="cs-big" style="background-image:url('${CHARSELECT_ART.cards[k]}')"><span><b>${INFO[k].name}</b><small>${INFO[k].role}</small></span></div>
      <div class="cs-text">
        <q>${CHARSELECT_ART.quotes[k] ?? ''}</q>
        <p>${INFO[k].line}</p>
        <div class="cs-attrs">${bars}<div class="cs-attr hp"><span>HP</span><b>${st.maxHp}</b></div></div>
      </div>
      <div class="cs-skills"><h3>Habilidades</h3>${skills}</div>
      <div class="cs-chibi"><i class="cs-circle"></i>${chibi ? `<img src="${chibi}" alt="">` : `<span class="cs-chibi-card" style="background-image:url('${CHARSELECT_ART.cards[k]}')"></span>`}</div>`;
    // reinicia a animação de entrada
    det.classList.remove('in');
    void det.offsetWidth;
    det.classList.add('in');
  }

  /** Explosão de faíscas a partir de uma carta. */
  private burst(card: HTMLElement, n: number): void {
    const r = card.getBoundingClientRect();
    const color = getComputedStyle(card).getPropertyValue('--c').trim() || '#ffd67a';
    for (let i = 0; i < n; i++) this.spawn(r.left + Math.random() * r.width, r.top + r.height * (0.3 + Math.random() * 0.7), color, true);
  }

  private spawn(x: number, y: number, color: string, fast = false): void {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (fast ? 2.4 : 0.9);
    const sp = fast ? 60 + Math.random() * 160 : 18 + Math.random() * 40;
    const max = 0.7 + Math.random() * 0.9;
    this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, size: 1 + Math.random() * 2.2, color: Math.random() < 0.35 ? '#fff4d0' : color });
  }

  private drawFx(dt: number): void {
    // faíscas contínuas sobre a carta com o mouse em cima
    if (this.hover && !this.hover.classList.contains('locked')) {
      this.sparkAcc += dt * CHARSELECT_ART.sparksPerSecond;
      const r = this.hover.getBoundingClientRect();
      const color = getComputedStyle(this.hover).getPropertyValue('--c').trim();
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        const edge = Math.random();
        const x = edge < 0.5 ? r.left + Math.random() * r.width : Math.random() < 0.5 ? r.left : r.right;
        const y = edge < 0.5 ? r.bottom - Math.random() * 12 : r.top + Math.random() * r.height;
        this.spawn(x, y, color);
      }
    }
    const g = this.fx.getContext('2d')!;
    g.clearRect(0, 0, this.fx.width, this.fx.height);
    if (!this.sparks.length) return;
    g.globalCompositeOperation = 'lighter';
    this.sparks = this.sparks.filter((p) => (p.life -= dt) > 0);
    for (const p of this.sparks) {
      p.vy -= 30 * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 8;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-over';
  }

  private frame(dt: number): void {
    this.t += dt;
    // os modelos 3D só são desenhados nas capturas (retrato, caminhada); aqui só seguem animando
    for (const [, v] of this.views) v.update(dt, 1, 1, this.camera.quaternion);
    this.drawFx(dt);
  }
}

/** Cor 0xRRGGBB → '#rrggbb'. */
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
