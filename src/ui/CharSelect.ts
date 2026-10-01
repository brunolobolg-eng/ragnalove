import * as THREE from 'three';
import { ATTRIBUTES_CONFIG, ATTR_KEYS, ATTR_LABEL, computeStats } from '../core/progression/attributes';
import type { HeroKind } from '../core/progression/skills';
import { ModelUnitView } from '../render/units/model/ModelUnitView';
import { gearBonus } from '../core/progression/equipment';
import { starterWeapon } from '../core/progression/profile';
import { SKILL_ICONS } from './icons';

/**
 * Seleção de personagem no estilo das telas clássicas de MMO: os heróis em pedestais
 * (modelos 3D animados), janela de informações com atributos e as duas habilidades
 * iniciais. Começa-se com 1 herói; os outros são liberados pelos chefes dos atos.
 */
const INFO: Record<HeroKind, { name: string; role: string; line: string; skills: [string, string][]; color: number }> = {
  warrior: {
    name: 'Guerreiro',
    role: 'Linha de frente',
    line: 'Segura o funil com escudo e espada. Muita vida, golpes em área curtos.',
    skills: [['cleave', 'Golpe em Área'], ['bash', 'Investida']],
    color: 0xff6a4a,
  },
  mage: {
    name: 'Mago',
    role: 'Controle de área',
    line: 'Três barreiras de fogo desviam a horda; raios gélidos à distância.',
    skills: [['fireBarrier', 'Barreiras de Fogo'], ['frostBolt', 'Raio Gélido']],
    color: 0x6aa8ff,
  },
  archer: {
    name: 'Arqueira',
    role: 'Dano à distância',
    line: 'Flechas de longo alcance e chuva de flechas sobre os grupos.',
    skills: [['arrowRain', 'Chuva de Flechas'], ['preciseShot', 'Flecha Precisa']],
    color: 0x7aff6a,
  },
};
const ORDER: HeroKind[] = ['warrior', 'mage', 'archer'];

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
  private locked: HeroKind[] = ['archer'];
  private onPick: (h: HeroKind) => void = () => {};
  private icons: Record<string, string> = {};

  constructor(private readonly onBack: () => void, private readonly onUi: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'charselect';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas class="cs-3d"></canvas>
      <header class="cs-title"><h1>Escolha seu herói</h1><p>Você começa com um. Os outros se juntam ao derrotar os chefes dos atos.</p></header>
      <div class="cs-slots"></div>
      <section class="win cs-info"><div class="win-title"><span>Informações</span><i class="dots"></i></div><div class="win-body"></div></section>
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
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const h = ORDER[Math.min(2, Math.max(0, Math.floor(x * 3)))];
      if (!this.locked.includes(h)) {
        this.onUi();
        this.select(h);
      }
    });
    window.addEventListener('resize', () => this.resize());
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(onPick: (h: HeroKind) => void, locked: HeroKind[] = ['archer']): void {
    this.onPick = onPick;
    this.locked = locked;
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
    const cycle = { warrior: 1.0, mage: 1.1, archer: 0.95 / 1.05 }[k];
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
      const x = (i - 1) * 2.3;
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
    this.camera.position.set(0, 4.6, 7.2);
    this.camera.lookAt(0, 1.0, 0);
  }

  private resize(): void {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private select(h: HeroKind): void {
    if (this.locked.includes(h)) return;
    this.sel = h;
    const v = this.views.get(h);
    v?.cast();
    this.renderSlots();
    this.renderInfo();
  }

  private renderSlots(): void {
    this.el.querySelector('.cs-slots')!.innerHTML = ORDER.map((k) => {
      const lock = this.locked.includes(k);
      return `<button class="cs-slot ${k === this.sel ? 'on' : ''} ${lock ? 'locked' : ''}" data-h="${k}" ${lock ? 'disabled' : ''}>
        <b>${lock ? '???' : INFO[k].name}</b><small>${lock ? '🔒 Chefe do Ato II' : INFO[k].role}</small></button>`;
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
    this.el.querySelector('.cs-info .win-body')!.innerHTML = `
      <div class="cs-head"><h2>${INFO[k].name}</h2><span>${INFO[k].role}</span></div>
      <p>${INFO[k].line}</p>
      <div class="cs-grid"><div>${bars}<div class="cs-attr hp"><span>HP</span><b>${st.maxHp}</b></div></div>
      <div class="cs-skills">${INFO[k].skills.map(([id, n]) => `<div><img src="${this.icon(id)}" alt=""><span>${n}</span></div>`).join('')}</div></div>`;
  }

  private frame(dt: number): void {
    this.t += dt;
    for (const [k, v] of this.views) {
      const on = k === this.sel;
      v.update(dt, 1, 1, this.camera.quaternion);
      const spot = this.spots.get(k)!;
      spot.intensity += ((on ? 0.7 : this.locked.includes(k) ? 0 : 0.1) - spot.intensity) * Math.min(1, dt * 6);
      const ring = this.rings.get(k)!;
      (ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.55 + Math.sin(this.t * 3) * 0.2 : 0;
      ring.rotation.y += dt * 0.6;
      // o selecionado vira levemente para a câmera
      v.setFacing(on ? Math.sin(this.t * 0.6) * 0.25 : 0, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
