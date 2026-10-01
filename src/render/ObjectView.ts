import * as THREE from 'three';
import type { Simulation } from '../core/sim/Simulation';
import type { MapObject, SimEvent } from '../core/sim/types';
import { OBJECT_RULES } from '../core/sim/objects';
import { tileToWorld } from './coords';
import type { ParticleLayer } from './fx/Particles';
import { softCircle } from './textures';

/**
 * Objetos interativos do mapa — só visual. Lê o estado autoritativo (`sim.objects`) e reage aos
 * eventos (acendeu, derramou, quebrou, desabou, virou lama). Nunca altera a simulação.
 */
interface Piece {
  obj: MapObject;
  group: THREE.Group;
  state: MapObject['state'];
  /** Anima o objeto (chama, brilho, queda). */
  tick?(dt: number, p: ParticleLayer): void;
  /** Muda o visual para o novo estado. */
  apply?(state: MapObject['state']): void;
  shake: number;
  hpBar?: THREE.Sprite;
}

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const shadow = <T extends THREE.Object3D>(m: T): T => {
  m.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return m;
};

const C_FIRE = new THREE.Color(3.0, 1.3, 0.35);
const C_FIRE_END = new THREE.Color(0.6, 0.1, 0.02);
const C_HOLY = new THREE.Color(0.9, 1.8, 1.1);
const C_DUST = new THREE.Color(0.55, 0.45, 0.32);

export class ObjectView {
  readonly group = new THREE.Group();
  private readonly pieces = new Map<number, Piece>();
  private readonly oilDecals = new Map<number, THREE.Mesh>();
  private readonly mudDecals = new Map<number, THREE.Mesh>();
  private readonly highlight: THREE.Mesh[] = [];
  private t = 0;

  constructor(sim: Simulation) {
    for (const o of sim.objects.values()) this.build(o);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
  }

  /** Anel de destaque nos objetos que ainda dá para acionar (planejamento). */
  setHighlight(ids: number[], on: boolean): void {
    for (const h of this.highlight) h.removeFromParent();
    this.highlight.length = 0;
    if (!on) return;
    for (const id of ids) {
      const p = this.pieces.get(id);
      if (!p) continue;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42 * Math.max(p.obj.w, p.obj.h), 0.52 * Math.max(p.obj.w, p.obj.h), 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 1.9), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.copy(this.center(p.obj)).setY(0.03);
      ring.renderOrder = 3;
      this.group.add(ring);
      this.highlight.push(ring);
    }
  }

  private center(o: MapObject): THREE.Vector3 {
    const a = tileToWorld(o.x, o.y);
    const b = tileToWorld(o.x + o.w - 1, o.y + o.h - 1);
    return a.add(b).multiplyScalar(0.5);
  }

  handle(events: SimEvent[], particles: ParticleLayer): void {
    for (const e of events) {
      if (e.type === 'objectHit') {
        const p = this.pieces.get(e.objectId);
        if (!p) continue;
        p.shake = 0.25;
        const c = this.center(p.obj).setY(0.7);
        particles.smoke.emit({ pos: c, posJitter: 0.3, vel: new THREE.Vector3(0, 0.6, 0), velJitter: 0.8, life: 0.8, size: 0.25, sizeEnd: 0.6, color: p.obj.type === 'roots' ? new THREE.Color(0.25, 0.18, 0.1) : C_DUST, alpha: 0.6, count: 4 });
      } else if (e.type === 'objectState' || e.type === 'oilIgnite' || e.type === 'mud' || e.type === 'ruinCollapse') {
        const p = this.pieces.get(e.objectId);
        if (p) this.syncState(p, false, particles);
      }
    }
  }

  private syncState(p: Piece, silent: boolean, particles?: ParticleLayer): void {
    const o = p.obj;
    if (o.state !== p.state) {
      p.state = o.state;
      p.apply?.(o.state);
      if (!silent && particles && (o.state === 'broken' || o.state === 'collapsed')) {
        const c = this.center(o).setY(0.5);
        particles.smoke.emit({ pos: c, posJitter: 0.6, vel: new THREE.Vector3(0, 1.1, 0), velJitter: 1.4, life: 1.6, size: 0.6, sizeEnd: 1.8, color: o.type === 'roots' ? new THREE.Color(0.3, 0.22, 0.12) : C_DUST, alpha: 0.7, drag: 1.2, count: 18 });
      }
    }
    // óleo derramado / lama: decalques no chão
    if ((o.state === 'spilled' || o.state === 'burning') && !this.oilDecals.has(o.id)) this.oilDecals.set(o.id, this.puddle(o.area, 0x3a2c1a, 0.62));
    if (o.state === 'used' && o.type === 'oilBarrel') {
      const d = this.oilDecals.get(o.id);
      if (d) (d.material as THREE.MeshLambertMaterial).color.set(0x0a0908);
    }
    if (o.state === 'muddy' && !this.mudDecals.has(o.id)) this.mudDecals.set(o.id, this.puddle(o.area, 0x5a4026, 0.85, true));
  }

  /** Mancha contínua no chão cobrindo os tiles (óleo, lama). */
  private puddle(tiles: { x: number; y: number }[], color: number, opacity: number, wet = false): THREE.Mesh {
    const geos: THREE.BufferGeometry[] = [];
    const v = new THREE.Vector3();
    for (const t of tiles) {
      tileToWorld(t.x, t.y, v);
      const g = new THREE.CircleGeometry(0.5 + ((t.x * 7 + t.y * 3) % 5) * 0.05, 14).rotateX(-Math.PI / 2);
      g.translate(v.x + (((t.x * 13) % 5) - 2) * 0.03, 0.015, v.z + (((t.y * 11) % 5) - 2) * 0.03);
      geos.push(g);
    }
    const merged = mergeFlat(geos);
    // óleo: mancha escura com brilho de película; lama: marrom úmido
    const mat = new THREE.MeshPhongMaterial({
      color,
      emissive: wet ? 0x140c06 : 0x0c0804,
      specular: wet ? 0x6a5a48 : 0xc8b890,
      shininess: wet ? 30 : 90,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const m = new THREE.Mesh(merged, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.group.add(m);
    return m;
  }

  update(dt: number, particles: ParticleLayer): void {
    this.t += dt;
    for (const p of this.pieces.values()) {
      if (p.shake > 0) {
        p.shake = Math.max(0, p.shake - dt);
        p.group.position.x = this.center(p.obj).x + Math.sin(this.t * 60) * 0.04 * (p.shake / 0.25);
      }
      p.tick?.(dt, particles);
      if (p.hpBar) {
        const o = p.obj;
        const show = o.maxHp > 0 && o.hp < o.maxHp && o.hp > 0;
        p.hpBar.visible = show;
        if (show) p.hpBar.scale.set(0.9 * (o.hp / o.maxHp), 0.07, 1);
      }
    }
    for (const h of this.highlight) {
      const m = h.material as THREE.MeshBasicMaterial;
      m.opacity = 0.45 + Math.sin(this.t * 4) * 0.3;
    }
  }

  // ---------------- Construção por tipo ----------------

  private build(o: MapObject): void {
    const g = new THREE.Group();
    g.position.copy(this.center(o));
    this.group.add(g);
    const p: Piece = { obj: o, group: g, state: o.state, shake: 0 };
    const b = BUILDERS[o.type];
    b(p, this.t);
    if (OBJECT_RULES[o.type].hp) {
      const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xd8b060, depthTest: false }));
      bar.position.set(0, 1.9, 0);
      bar.renderOrder = 9;
      bar.visible = false;
      g.add(bar);
      p.hpBar = bar;
    }
    this.pieces.set(o.id, p);
    if (o.state !== 'idle') {
      p.state = 'idle';
      this.syncState(p, true);
    }
  }
}

// ---------------- Peças low-poly ----------------

type Builder = (p: Piece, t: number) => void;

function flame(g: THREE.Group, y: number, size: number): { glow: THREE.Sprite; light: THREE.PointLight } {
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle(), color: C_FIRE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = y;
  glow.scale.setScalar(size * 3);
  glow.renderOrder = 5;
  const light = new THREE.PointLight(0xff8a3a, 0, 6, 1.6);
  light.position.y = y + 0.2;
  g.add(glow, light);
  return { glow, light };
}

const BUILDERS: Record<MapObject['type'], Builder> = {
  cart(p) {
    const g = p.group;
    const wood = lambert(0x7a5634);
    const dark = lambert(0x3a2a1c);
    const iron = lambert(0x2f3036);
    const cart = new THREE.Group();
    cart.rotation.y = 0.22 + (p.obj.h > p.obj.w ? 0 : Math.PI / 2);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 1.9), wood);
    bed.position.set(0.32, 0.4, 0);
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.9), wood);
    s1.position.set(0, 0.04, 0);
    const s2 = s1.clone();
    s2.position.y = 0.76;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.08), dark);
    back.position.set(0, 0.4, 0.92);
    const wheel = () => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 16), wood));
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.04), wood);
        sp.rotation.z = (i * Math.PI) / 4;
        w.add(sp);
      }
      w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8).rotateX(Math.PI / 2), iron));
      return w;
    };
    const w1 = wheel();
    w1.position.set(0.45, 0.4, -0.55);
    w1.rotation.y = Math.PI / 2;
    const w2 = wheel();
    w2.position.set(-0.7, 0.06, 0.8);
    w2.rotation.x = -Math.PI / 2 + 0.1;
    cart.add(bed, s1, s2, back, w1, w2);
    const sack = lambert(0xa08a64);
    for (const [x, z, r] of [[-0.4, -0.5, 0.22], [-0.55, 0.15, 0.18], [-0.25, 0.55, 0.16]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), sack);
      m.scale.set(1.2, 0.7, 0.9);
      m.position.set(x, r * 0.6, z);
      cart.add(m);
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), wood);
    crate.position.set(-0.5, 0.18, -0.95);
    crate.rotation.y = 0.5;
    cart.add(crate);
    g.add(shadow(cart));
    // saque aberto: caixote virado e moedas espalhadas
    const loot = new THREE.Group();
    const coin = lambert(0xe8c050, { emissive: 0x3a2a00 });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 8), coin);
      c.position.set(-0.6 + Math.sin(i * 2.1) * 0.25, 0.01, -0.3 + Math.cos(i * 1.7) * 0.3);
      loot.add(c);
    }
    loot.visible = false;
    g.add(loot);
    p.apply = (s) => {
      loot.visible = s === 'used';
      crate.rotation.z = s === 'used' ? 1.2 : 0;
    };
    p.apply(p.obj.state);
  },
  oilBarrel(p) {
    const g = p.group;
    const wood = lambert(0x5a3a22);
    const iron = lambert(0x26272c);
    const barrel = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.66, 12), wood);
    const bulge = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.38, 12), wood);
    const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 16).rotateX(Math.PI / 2), iron);
    h1.position.y = 0.22;
    const h2 = h1.clone();
    h2.position.y = -0.22;
    // marca de "inflamável": gota escura pintada
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), lambert(0x1a0f06));
    mark.position.set(0, 0.02, 0.305);
    barrel.add(body, bulge, h1, h2, mark);
    barrel.position.y = 0.33;
    g.add(shadow(barrel));
    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x100c08, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7, depthWrite: false }));
    stain.position.y = 0.012;
    g.add(stain);
    p.apply = (s) => {
      // derramado: barril tombado de lado, vazio
      if (s !== 'idle') {
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0.1, 0.28, 0);
      }
    };
    p.apply(p.obj.state);
  },
  torch(p) {
    const g = p.group;
    const wood = lambert(0x4a3220);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 6), wood);
    post.rotation.z = 0.5;
    post.position.set(0.22, 0.35, 0);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.22, 7), lambert(0x2a1a10));
    head.position.set(-0.2, 0.62, 0);
    head.rotation.z = 0.5;
    const stones = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), lambert(0x7a7a70));
    stones.position.set(0.35, 0.08, 0.1);
    stones.scale.set(1.3, 0.6, 1);
    g.add(shadow(post), shadow(head), shadow(stones));
    const f = flame(g, 0.8, 0.28);
    f.glow.position.x = -0.24;
    f.light.position.x = -0.24;
    f.glow.visible = false;
    let lit = false;
    let acc = 0;
    p.apply = (s) => {
      lit = s === 'lit';
      f.glow.visible = lit;
      head.rotation.z = lit ? 0 : 0.5;
      post.rotation.z = lit ? 0 : 0.5;
      post.position.set(lit ? 0 : 0.22, lit ? 0.55 : 0.35, 0);
      head.position.set(lit ? 0 : -0.2, lit ? 1.12 : 0.62, 0);
      f.glow.position.set(0, 1.3, 0);
      f.light.position.set(0, 1.5, 0);
    };
    p.tick = (dt, parts) => {
      if (!lit) return;
      const k = 0.85 + Math.sin(performance.now() * 0.013) * 0.1 + Math.sin(performance.now() * 0.007) * 0.08;
      f.light.intensity = 3.2 * k;
      f.light.distance = 9;
      f.glow.scale.setScalar(0.9 * k);
      acc += dt;
      if (acc > 1 / 24) {
        acc = 0;
        parts.glow.emit({ pos: g.position.clone().setY(1.35), posJitter: 0.05, vel: new THREE.Vector3(0, 1.1, 0), velJitter: 0.25, life: 0.45, size: 0.16, sizeEnd: 0.02, color: C_FIRE, colorEnd: C_FIRE_END, gravity: -0.6, count: 2 });
      }
    };
    p.apply(p.obj.state);
  },
  roots(p) {
    const g = p.group;
    const bark = lambert(0x4a3522);
    const moss = lambert(0x4e6a2a);
    const w = p.obj.w;
    const h = p.obj.h;
    const len = Math.max(w, h);
    const alongX = w >= h;
    const parts: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * (len - 0.3);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a - 0.4, 0, -0.45),
        new THREE.Vector3(a - 0.1, 0.55 + (i % 3) * 0.15, -0.1),
        new THREE.Vector3(a + 0.25, 0.45 + (i % 2) * 0.2, 0.2),
        new THREE.Vector3(a + 0.45, 0, 0.5),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.07 + (i % 3) * 0.02, 5), i % 3 === 0 ? moss : bark);
      parts.push(tube);
    }
    const root = new THREE.Group();
    root.add(...parts);
    if (!alongX) root.rotation.y = Math.PI / 2;
    g.add(shadow(root));
    p.apply = (s) => {
      if (s !== 'broken') return;
      // raízes arrebentadas: pedaços caídos, rentes ao chão
      parts.forEach((m, i) => {
        m.scale.set(1, i % 2 ? 0.2 : 0.35, 1);
        m.rotation.z = (i % 2 ? 1 : -1) * 0.3;
      });
    };
    p.apply(p.obj.state);
  },
  altar(p) {
    const g = p.group;
    const stone = lambert(0x8a8c80);
    const mossy = lambert(0x5e7a44);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.7), stone);
    base.position.y = 0.11;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), stone);
    top.position.y = 0.45;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.6), mossy);
    slab.position.y = 0.72;
    const rune = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.9, 0.6) }));
    rune.position.set(0, 0.45, 0.255);
    g.add(shadow(base), shadow(top), shadow(slab), rune);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle(), color: C_HOLY, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    glow.position.y = 1.0;
    glow.scale.setScalar(1.6);
    g.add(glow);
    let used = false;
    let acc = 0;
    p.apply = (s) => {
      used = s === 'used';
      (rune.material as THREE.MeshBasicMaterial).color.set(used ? new THREE.Color(1.4, 2.4, 1.6) : new THREE.Color(0.4, 0.9, 0.6));
    };
    p.tick = (dt, parts) => {
      (glow.material as THREE.SpriteMaterial).opacity = used ? 0.55 + Math.sin(performance.now() * 0.003) * 0.2 : 0.1;
      if (!used) return;
      acc += dt;
      if (acc > 0.2) {
        acc = 0;
        parts.glow.emit({ pos: g.position.clone().setY(0.8), posJitter: 0.3, vel: new THREE.Vector3(0, 0.7, 0), velJitter: 0.2, life: 1.4, size: 0.07, sizeEnd: 0.02, color: C_HOLY, count: 1 });
      }
    };
    p.apply(p.obj.state);
  },
  sandColumn(p) {
    const g = p.group;
    const sand = lambert(0xcfa36a);
    const dark = lambert(0xa87c48);
    const col = new THREE.Group();
    // coluna de arenito gasta pelo vento: tambores irregulares
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const h = 0.36 + (i % 2) * 0.08;
      const r = 0.34 - i * 0.025 + (i % 2 ? 0.03 : 0);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r, h, 9), i % 2 ? dark : sand);
      d.position.y = y + h / 2;
      d.rotation.y = i * 0.7;
      col.add(d);
      y += h;
    }
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), sand);
    cap.position.y = y + 0.1;
    cap.scale.set(1.2, 0.5, 1.1);
    col.add(cap);
    g.add(shadow(col));
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 9), sand);
    pile.position.y = 0.17;
    pile.visible = false;
    g.add(shadow(pile));
    let fall = -1;
    p.apply = (s) => {
      if (s === 'broken') fall = 0;
    };
    p.tick = (dt) => {
      if (fall < 0 || fall > 1) return;
      fall = Math.min(1.01, fall + dt * 1.6);
      col.rotation.z = fall * 1.35;
      col.position.y = -fall * 0.4;
      col.scale.setScalar(1 - fall * 0.35);
      if (fall >= 1) {
        col.visible = false;
        pile.visible = true;
      }
    };
    if (p.obj.state === 'broken') {
      col.visible = false;
      pile.visible = true;
    }
  },
  unstableRuin(p) {
    const g = p.group;
    const stone = lambert(0xc9a878);
    const crack = lambert(0x5a4632);
    const ruin = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.85), stone);
    base.position.y = 0.1;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 1.9, 10), stone);
    col.position.y = 1.1;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.42), stone);
    lintel.position.set(0.25, 2.1, 0);
    lintel.rotation.z = -0.18;
    // rachaduras escuras e cunhas de pedra soltas: dá para ler que vai cair
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.02), crack);
      c.position.set(Math.sin(i * 2.2) * 0.2, 0.7 + i * 0.4, Math.cos(i * 2.2) * 0.26);
      c.rotation.set(0.2, i, 0.3 * (i % 2 ? 1 : -1));
      ruin.add(c);
    }
    ruin.add(base, col, lintel);
    ruin.rotation.z = 0.12;
    g.add(shadow(ruin));
    const debris = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.3 + (i % 3) * 0.1, 0.18, 0.26), i % 2 ? stone : crack);
      d.position.set(Math.sin(i * 1.9) * 0.9, 0.09, Math.cos(i * 1.3) * 0.8);
      d.rotation.y = i;
      debris.add(d);
    }
    debris.visible = false;
    g.add(shadow(debris));
    let fall = -1;
    p.apply = (s) => {
      if (s === 'collapsed') fall = 0;
    };
    p.tick = (dt) => {
      if (fall < 0 || fall > 1) return;
      fall = Math.min(1.01, fall + dt * 2.2);
      ruin.rotation.z = 0.12 + fall * fall * 1.45;
      ruin.position.x = fall * 0.7;
      if (fall >= 1) {
        ruin.visible = false;
        debris.visible = true;
      }
    };
    if (p.obj.state === 'collapsed') {
      ruin.visible = false;
      debris.visible = true;
    }
  },
  dryOasis(p) {
    const g = p.group;
    // bacia seca e rachada, com pedras e um tronco de palmeira morto
    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14).rotateX(-Math.PI / 2), lambert(0x9a7448));
    pit.position.y = 0.01;
    const rim: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.03, 0), lambert(0xb89a6e));
      s.position.set(Math.cos(a) * 0.95, 0.06, Math.sin(a) * 0.95);
      rim.push(s);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6), lambert(0x6a5a44));
    trunk.position.set(0.7, 0.35, -0.5);
    trunk.rotation.z = 0.7;
    g.add(pit, ...rim.map(shadow), shadow(trunk));
    const cracks = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.7, 12, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a3e22, wireframe: true }));
    cracks.position.y = 0.02;
    g.add(cracks);
    p.apply = (s) => {
      if (s !== 'muddy') return;
      (pit.material as THREE.MeshLambertMaterial).color.set(0x3e2c1a);
      cracks.visible = false;
    };
    p.apply(p.obj.state);
  },
  campfire(p) {
    const g = p.group;
    const wood = lambert(0x5a3a22);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6), wood);
      l.rotation.z = Math.PI / 2 - 0.35;
      l.rotation.y = (i * Math.PI) / 2;
      l.position.y = 0.12;
      g.add(shadow(l));
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), lambert(0x6a6a62));
      s.position.set(Math.cos(a) * 0.36, 0.05, Math.sin(a) * 0.36);
      g.add(shadow(s));
    }
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.2, 0.1) }));
    coals.position.y = 0.03;
    g.add(coals);
    const f = flame(g, 0.35, 0.3);
    let lit = false;
    let acc = 0;
    p.apply = (s) => {
      lit = s === 'used';
      (coals.material as THREE.MeshBasicMaterial).color.set(lit ? new THREE.Color(2.6, 0.8, 0.2) : new THREE.Color(0.5, 0.2, 0.1));
    };
    p.tick = (dt, parts) => {
      const k = 0.85 + Math.sin(performance.now() * 0.012) * 0.1;
      f.glow.visible = lit;
      f.light.intensity = lit ? 3.4 * k : 0;
      f.light.distance = 8;
      f.glow.scale.setScalar(1.0 * k);
      if (!lit) return;
      acc += dt;
      if (acc > 1 / 20) {
        acc = 0;
        parts.glow.emit({ pos: g.position.clone().setY(0.35), posJitter: 0.12, vel: new THREE.Vector3(0, 1.2, 0), velJitter: 0.3, life: 0.6, size: 0.2, sizeEnd: 0.03, color: C_FIRE, colorEnd: C_FIRE_END, gravity: -0.6, count: 2 });
        if (Math.random() < 0.2) parts.smoke.emit({ pos: g.position.clone().setY(0.9), posJitter: 0.1, vel: new THREE.Vector3(0.1, 0.8, 0), velJitter: 0.1, life: 2.2, size: 0.3, sizeEnd: 0.9, color: new THREE.Color(0.2, 0.2, 0.2), alpha: 0.35 });
      }
    };
    p.apply(p.obj.state);
  },
};

/** Junta geometrias sem índice (poças/lama). */
function mergeFlat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
