import { HERO_NAME } from '../config/heroes';
import type { HeroKind } from '../core/progression/skills';
import { NODE_COLOR, nodeIconUrl } from './nodeArt';
import { ACTS, BIOME_LABEL, NODE_LABEL, REGIONS, REGION_BY_ID, type NodeType } from '../config/world';
import { MAP_ART } from '../config/visualConfig';
import { HeroCard, type HeroCardVM } from './HeroCard';

/**
 * Mapa-múndi de Aurenthal: terreno pintado em canvas (original), grade de regiões por cima,
 * cidades com cadeado, trilha da party e painel da próxima fase. Só apresentação: quem decide
 * é o main (run.ts).
 */
export interface MapState {
  act: number;
  node: number;
  phase: number;
  totalPhases: number;
  zeni: number;
  souls: number;
  /** Vida da cidade (segundo objetivo da jornada). */
  cityHp?: number;
  cityMaxHp?: number;
  heroes: {
    kind: HeroKind;
    level: number;
    dead: boolean;
    points: number;
    skillPoints: number;
    maxHp: number;
    /** Ícone da arma equipada (vazio = sem arma). */
    weaponIcon?: string;
    weaponColor?: string;
  }[];
  /** Regiões já percorridas (em ordem). */
  visited: string[];
  current: string;
  options: NodeType[];
  cityName?: string;
  reviveCost: number;
}

export interface MapCallbacks {
  onChoose(t: NodeType): void;
  onCharacter(kind?: HeroKind): void;
  onSkills(kind?: HeroKind): void;
  /** Dados da janelinha do herói (clique na party). */
  heroCard(kind: HeroKind): HeroCardVM;
  onAbandon(): void;
  onRevive(kind: HeroKind): void;
  onUi(): void;
}

/** Retratos dos heróis (a Arqueira recebe o retrato renderizado do modelo 3D). */
export const PORTRAITS: Record<string, string> = {
  warrior: 'sprites/portrait_warrior.png', mage: 'sprites/portrait_mage.png', archer: 'sprites/portrait_archer.png',
  sorcerer: 'sprites/portrait_sorcerer.png', warlock: 'sprites/portrait_warlock.png', assassin: 'sprites/portrait_assassin.png',
};

const W = MAP_ART.width;
const H = MAP_ART.height;
const FOG = MAP_ART.fog;

const NODE_DESC: Record<NodeType, string> = {
  horde: 'Enfrente a horda da região (sem chefe). Zen, almas, EXP e chance de itens.',
  elite: '★★ Horda menor com um mini-chefe caçador no fim (ignora provocação). Todos os heróis sobem 1 nível e o drop é garantido.',
  event: 'Um encontro na estrada: escolhas com riscos e recompensas.',
  city: 'Descanse e gaste Zen: loja, ferreiro, mestre de armas, oráculo e templo.',
  boss: '★★★ O chefe do ato. Vença para seguir viagem — todos sobem 1 nível e um novo herói se junta.',
  survival: 'Hordas infinitas, cada vez mais fortes. Quanto mais durar, melhor a roleta de prêmios. Cair aqui não encerra a jornada.',
};

export class WorldMap {
  readonly el: HTMLElement;
  private readonly base: HTMLCanvasElement;
  private readonly over: HTMLCanvasElement;
  private readonly panel: HTMLElement;
  private readonly info: HTMLElement;
  private state?: MapState;
  private raf = 0;
  private t = 0;
  private travel?: { from: string; to: string; t: number; done: () => void };
  private painted = false;
  private readonly choices: HTMLElement;
  private readonly card: HeroCard;
  private walkers: Partial<Record<HeroKind, HTMLImageElement[]>> = {};
  /** arte do mapa, a mesma arte desfocada (névoa) e a camada de névoa recortada a cada quadro */
  private readonly art = new Image();
  private fogArt?: HTMLCanvasElement;
  private readonly fog = document.createElement('canvas');
  /** progresso da revelação de cada região (0 → 1) */
  private readonly reveal = new Map<string, number>();

  constructor(private readonly cb: MapCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'worldmap';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="wm-frame">
        <div class="wm-title"><span>Aurenthal</span><em>mapa-múndi</em></div>
        <div class="wm-canvas"><canvas class="wm-base"></canvas><canvas class="wm-over"></canvas><div class="wm-info" hidden></div></div>
        <div class="wm-choices"></div>
      </div>
      <aside class="wm-panel"></aside>`;
    document.body.appendChild(this.el);
    this.base = this.el.querySelector('.wm-base')!;
    this.over = this.el.querySelector('.wm-over')!;
    this.panel = this.el.querySelector('.wm-panel')!;
    this.info = this.el.querySelector('.wm-info')!;
    this.choices = this.el.querySelector('.wm-choices')!;
    this.card = new HeroCard(this.el.querySelector('.wm-frame')!, {
      onBag: (k) => this.cb.onCharacter(k),
      onAttributes: (k) => this.cb.onCharacter(k),
      onSkills: (k) => this.cb.onSkills(k),
      onAbandon: () => this.cb.onAbandon(),
      onUi: () => this.cb.onUi(),
    });
    this.choices.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b || this.travel) return;
      this.cb.onUi();
      if (b.dataset.a === 'go') this.cb.onChoose(b.dataset.t as NodeType);
      else if (b.dataset.a === 'fold') this.choices.classList.toggle('folded');
    });
    for (const c of [this.base, this.over]) {
      c.width = W;
      c.height = H;
    }
    this.over.addEventListener('click', (e) => this.clickRegion(e));
    this.panel.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b || b.hasAttribute('disabled') || this.travel) return;
      this.cb.onUi();
      const a = b.dataset.a!;
      if (a === 'go') this.cb.onChoose(b.dataset.t as NodeType);
      else if (a === 'char') this.cb.onCharacter();
      else if (a === 'skills') this.cb.onSkills();
      else if (a === 'abandon') this.cb.onAbandon();
      else if (a === 'revive') this.cb.onRevive(b.dataset.k as HeroKind);
      else if (a === 'hero') this.openHero(b.dataset.k as HeroKind);
    });
  }

  /** Quadros de caminhada (renderizados do modelo 3D) para o marcador da party. */
  setWalkFrames(kind: HeroKind, urls: string[]): void {
    this.walkers[kind] = urls.map((u) => {
      const im = new Image();
      im.src = u;
      return im;
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(s: MapState): void {
    if (!this.painted) {
      this.painted = true;
      this.fog.width = W;
      this.fog.height = H;
      this.art.onload = () => {
        this.base.getContext('2d')!.drawImage(this.art, 0, 0, W, H);
        // névoa: a arte desfocada e clareada — dá para adivinhar o bioma, não os detalhes
        const f = document.createElement('canvas');
        f.width = W;
        f.height = H;
        const fg = f.getContext('2d')!;
        fg.filter = `blur(${FOG.blurPx}px) saturate(0.7)`;
        fg.drawImage(this.art, 0, 0, W, H);
        fg.filter = 'none';
        fg.fillStyle = FOG.tint;
        fg.fillRect(0, 0, W, H);
        this.fogArt = f;
      };
      this.art.src = MAP_ART.file;
    }
    // jornada nova: a névoa volta
    if (this.state && s.visited.length < this.state.visited.length) this.reveal.clear();
    // regiões já conhecidas aparecem reveladas de imediato; a nova (atual) revela animando
    for (const id of s.visited) if (id !== s.current && !this.reveal.has(id)) this.reveal.set(id, 1);
    if (!this.reveal.has(s.current)) this.reveal.set(s.current, 0);
    this.state = s;
    this.el.hidden = false;
    this.renderPanel();
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.t += dt;
      if (this.travel) {
        this.travel.t += dt / 2.2;
        if (this.travel.t >= 1) {
          const d = this.travel.done;
          this.travel = undefined;
          d();
        }
      }
      this.drawOverlay();
      if (!this.el.hidden) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Herói com a janelinha aberta (ou undefined). */
  get heroOpen(): HeroKind | undefined {
    return this.card.kind;
  }

  /** Abre (ou fecha, se já aberta) a janelinha do herói. */
  openHero(kind: HeroKind): void {
    if (this.card.kind === kind) return this.card.close();
    this.card.open(this.cb.heroCard(kind));
    this.panel.querySelectorAll('.wm-hero').forEach((r) => r.classList.toggle('on', (r as HTMLElement).dataset.k === kind));
  }

  hide(): void {
    this.card.close();
    this.el.hidden = true;
    this.info.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  /** Animação de viagem (caravana) entre atos. */
  travelTo(from: string, to: string, done: () => void): void {
    this.travel = { from, to, t: 0, done };
    this.choices.hidden = true;
  }

  private renderPanel(): void {
    const s = this.state!;
    const act = ACTS[s.act];
    const reg = REGION_BY_ID[s.current];
    const dots = Array.from({ length: s.totalPhases }, (_, i) => `<i class="${i + 1 < s.phase ? 'done' : i + 1 === s.phase ? 'now' : ''} ${(i + 1) % 5 === 0 ? 'boss' : ''}"></i>`).join('');
    const cards = s.options
      .map(
        (t) => `<button class="wm-node ${t}" data-a="go" data-t="${t}" style="--nc:${NODE_COLOR[t]}">
          <img src="${nodeIconUrl(t)}" alt="">
          <b>${NODE_LABEL[t]}</b>${t === 'city' && s.cityName ? `<em>${s.cityName}</em>` : t === 'boss' ? `<em>${act.bossName}</em>` : ''}
          <small>${NODE_DESC[t]}</small></button>`,
      )
      .join('');
    this.choices.hidden = !!this.travel;
    this.choices.classList.remove('folded');
    // se o marcador da party cair atrás do painel, desce o painel um pouco
    const [cx, cy] = center(s.current);
    this.choices.classList.toggle('low', cx / W > 0.22 && cx / W < 0.78 && cy / H > 0.2 && cy / H < 0.72);
    this.choices.innerHTML = `
      <div class="wm-ch-head"><span>${act.name} · Fase ${s.phase} de ${s.totalPhases}</span><b>${s.options.length > 1 ? 'Escolha o caminho' : 'Próxima fase'}</b></div>
      <div class="wm-ch-row">${cards}</div>
      <button class="wm-fold" data-a="fold"><span class="a">Ver o mapa ▾</span><span class="b">Escolher caminho ▴</span></button>`;
    const open = this.card.kind;
    const heroes = s.heroes
      .map(
        (h) => `<div class="wm-hero ${h.dead ? 'dead' : ''} ${open === h.kind ? 'on' : ''}" data-a="hero" data-k="${h.kind}" title="Ver equipamento e status">
          <img class="wm-pic" src="${PORTRAITS[h.kind] ?? ''}" alt="">
          <span class="wm-who"><b>${HERO_NAME[h.kind]}</b><small>Nv. ${h.level}</small>
            <span class="wm-chips"><em class="hp">♥ ${h.dead ? 0 : h.maxHp}/${h.maxHp}</em>${h.points ? `<em class="pt">${h.points} atr.</em>` : ''}${h.skillPoints ? `<em class="pt sk">${h.skillPoints} hab.</em>` : ''}</span>
          </span>
          ${h.weaponIcon ? `<img class="wm-wpn" src="${h.weaponIcon}" alt="" style="--rc:${h.weaponColor}">` : '<i class="wm-wpn none"></i>'}
          ${h.dead ? `<button data-a="revive" data-k="${h.kind}" ${s.zeni >= s.reviveCost ? '' : 'disabled'} title="Reviver custa 50% do Zen">Reviver (${s.reviveCost} Zen)</button>` : ''}
        </div>`,
      )
      .join('');
    if (this.card.kind) this.card.open(this.cb.heroCard(this.card.kind));
    this.panel.innerHTML = `
      <div class="win wm-card">
        <div class="win-title"><span>${act.name}</span><i class="dots"></i></div>
        <div class="win-body">
          <div class="wm-phase">Fase ${s.phase} de ${s.totalPhases}</div>
          <div class="wm-dots">${dots}</div>
          <div class="wm-region"><b>${reg.name}</b><span>${BIOME_LABEL[reg.biome]}</span></div>
        </div>
      </div>
      <div class="win wm-card">
        <div class="win-title"><span>Party</span><i class="dots"></i></div>
        <div class="win-body">
          ${heroes}
          <div class="wm-bank"><span><i class="zeni-ico"></i>${s.zeni.toLocaleString('pt-BR')} Zen</span><span><i class="soul-ico"></i>${s.souls} almas</span>${s.cityMaxHp ? `<span class="wm-city ${s.cityHp! / s.cityMaxHp < 0.4 ? 'low' : ''}" title="Vida da cidade — repare no Templo das cidades">🏰 ${s.cityHp}/${s.cityMaxHp}</span>` : ''}</div>
          <div class="wm-btns"><button data-a="char">Personagem (C)</button><button data-a="skills">Habilidades (K)</button></div>
          <button class="wm-abandon" data-a="abandon">Abandonar jornada</button>
        </div>
      </div>`;
  }

  /** Região mais perto do clique (na arte). */
  private regionAt(e: MouseEvent): string | undefined {
    const r = this.over.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    let best: string | undefined;
    let bd = FOG.clickRadius;
    for (const reg of REGIONS) {
      const [cx, cy] = center(reg.id);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) {
        bd = d;
        best = reg.id;
      }
    }
    return best;
  }

  private clickRegion(e: MouseEvent): void {
    const id = this.regionAt(e);
    const reg = id ? REGION_BY_ID[id] : undefined;
    if (!reg) {
      this.info.hidden = true;
      return;
    }
    this.cb.onUi();
    const known = (this.reveal.get(reg.id) ?? 0) > 0.5;
    if (!known) {
      // sem spoiler: só o tipo de terreno que se vê através da névoa
      this.info.innerHTML = `<b>Terras inexploradas</b><span>${BIOME_LABEL[reg.biome]}${reg.future ? ' · em breve' : ''}</span><small>Viaje até lá para descobrir o que existe nesta região.</small>`;
    } else {
      const cities = (reg.cities ?? [])
        .map((c) => `<div class="wm-city ${c.access}">${c.access === 'locked' ? '🔒' : '⌂'} <b>${c.name}</b>${c.reason ? `<small>${c.reason}</small>` : ''}</div>`)
        .join('');
      const actTxt = reg.future ? 'Região futura (em breve)' : reg.act !== undefined ? `Ato ${['I', 'II', 'III'][reg.act]}${reg.bossOfAct !== undefined ? ' · chefe do ato' : ''}` : '';
      this.info.innerHTML = `<b>${reg.name}</b><span>${BIOME_LABEL[reg.biome]} · ${actTxt}</span>${reg.enemies ? `<small>Inimigos: ${reg.enemies}</small>` : ''}${cities}`;
    }
    const r = this.over.getBoundingClientRect();
    const [ax, ay] = center(reg.id);
    const x = (ax / W) * r.width;
    const y = (ay / H) * r.height + 30;
    this.info.style.left = `${Math.min(r.width - 230, Math.max(0, x - 110))}px`;
    this.info.style.top = `${Math.min(r.height - 120, y)}px`;
    this.info.hidden = false;
  }

  // ---------------- Camada dinâmica: névoa, rota, trilha, marcador ----------------
  private drawOverlay(): void {
    const s = this.state;
    if (!s) return;
    const g = this.over.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const dt = 1 / 60;
    for (const [id, v] of this.reveal) if (v < 1) this.reveal.set(id, Math.min(1, v + dt * FOG.revealSpeed));
    const actRegions = new Set(ACTS[s.act].nodes.map((n) => n.region));
    // posição da party (viagem animada entre atos)
    let [mx, my] = center(s.current);
    if (this.travel) {
      const a = center(this.travel.from);
      const b = center(this.travel.to);
      const k = easeInOut(this.travel.t);
      mx = a[0] + (b[0] - a[0]) * k;
      my = a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 40;
    }
    // névoa: arte desfocada por cima, com buracos suaves onde a party já esteve
    if (this.fogArt) {
      const f = this.fog.getContext('2d')!;
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, W, H);
      f.drawImage(this.fogArt, 0, 0);
      f.globalCompositeOperation = 'destination-out';
      const hole = (x: number, y: number, rad: number) => {
        if (rad <= 1) return;
        const gr = f.createRadialGradient(x, y, rad * (1 - FOG.softEdge), x, y, rad);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        f.fillStyle = gr;
        f.beginPath();
        f.arc(x, y, rad, 0, Math.PI * 2);
        f.fill();
      };
      for (const [id, v] of this.reveal) hole(...center(id), FOG.revealRadius * easeInOut(v));
      if (this.travel) hole(mx, my, FOG.travelRadius);
      g.drawImage(this.fog, 0, 0);
    } else {
      g.fillStyle = 'rgba(20,24,36,0.9)';
      g.fillRect(0, 0, W, H);
    }
    // rota do ato (pontilhada) e trilha já percorrida (sólida)
    const route = ACTS[s.act].nodes.map((n) => n.region).filter((id, i, a) => a.indexOf(id) === i);
    g.setLineDash([10, 10]);
    g.lineDashOffset = -this.t * 18;
    g.strokeStyle = 'rgba(255,236,190,0.85)';
    g.lineWidth = 3;
    path(g, route.map(center));
    g.setLineDash([]);
    if (s.visited.length > 1) {
      g.strokeStyle = 'rgba(160,40,30,0.9)';
      g.lineWidth = 4;
      path(g, s.visited.map(center));
    }
    // regiões do ato: anel pulsante (sem nome enquanto não forem exploradas)
    for (const id of actRegions) {
      const [cx, cy] = center(id);
      g.strokeStyle = `rgba(255,214,120,${0.35 + 0.25 * Math.sin(this.t * 2)})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(cx, cy + 6, 46, 18, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // placas com o nome das regiões já descobertas
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const r of REGIONS) {
      const v = this.reveal.get(r.id) ?? 0;
      if (v <= 0.3) continue;
      const [cx, cy] = center(r.id);
      const locked = (r.cities ?? []).some((c) => c.access === 'locked');
      const label = `${locked ? '🔒 ' : ''}${r.name}`;
      g.save();
      g.globalAlpha = Math.min(1, (v - 0.3) / 0.5);
      g.font = '700 15px Cinzel, serif';
      const tw = g.measureText(label).width + 26;
      plaque(g, cx - tw / 2, cy - 13, tw, 26);
      g.fillStyle = '#fff3d6';
      g.fillText(label, cx, cy + 1);
      g.restore();
    }
    // chefes dos atos (a caveira marca o objetivo mesmo na névoa)
    for (const r of REGIONS) if (r.bossOfAct !== undefined) drawSkull(g, center(r.id)[0], center(r.id)[1] - 34, r.bossOfAct <= s.act);
    if (this.travel) {
      const a = center(this.travel.from);
      const b = center(this.travel.to);
      const k = easeInOut(this.travel.t);
      // poeira da caravana
      g.fillStyle = 'rgba(230,210,170,0.35)';
      for (let i = 0; i < 6; i++) {
        const kk = Math.max(0, k - i * 0.03);
        g.beginPath();
        g.arc(a[0] + (b[0] - a[0]) * kk, a[1] + (b[1] - a[1]) * kk - Math.sin(kk * Math.PI) * 40 + 16, 6 - i * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    let dir = 1;
    if (this.travel) dir = center(this.travel.to)[0] >= center(this.travel.from)[0] ? 1 : -1;
    this.drawParty(g, mx, my, dir);
  }

  /** Marcador da party: os heróis andando (quadros do modelo 3D) sobre um círculo dourado pulsante. */
  private drawParty(g: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
    const heroes = (this.state?.heroes ?? []).filter((h) => !h.dead);
    const kinds = heroes.map((h) => h.kind);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    // halo e círculo no chão
    g.save();
    const halo = g.createRadialGradient(x, y + 22, 4, x, y + 22, 70);
    halo.addColorStop(0, `rgba(255,214,110,${0.45 + pulse * 0.2})`);
    halo.addColorStop(1, 'rgba(255,214,110,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.ellipse(x, y + 22, 70, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(255,226,140,${0.7 + pulse * 0.3})`;
    g.lineWidth = 3;
    g.setLineDash([10, 6]);
    g.lineDashOffset = -this.t * 20;
    g.beginPath();
    g.ellipse(x, y + 22, 44 + pulse * 4, 15 + pulse * 1.5, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.restore();
    const lead = kinds[0];
    const frames = lead && this.walkers[lead];
    if (!frames?.length || !frames[0].complete) {
      drawBanner(g, x, y - 8 + Math.sin(this.t * 3) * 2.5);
      return;
    }
    // seguidores atrás (menores), depois o líder
    const order: [string, number, number, number][] = [];
    kinds.slice(1).forEach((k, i) => order.push([k, -dir * (34 + i * 26), i % 2 ? 10 : -6, 0.78]));
    order.push([lead, 0, 0, 1]);
    for (const [k, ox, oy, sc] of order) {
      const fr = this.walkers[k as HeroKind];
      if (!fr?.length) continue;
      const idx = Math.floor((this.t * 8 + ox * 0.05) % fr.length + fr.length) % fr.length;
      const im = fr[idx];
      const size = 150 * sc;
      const px = x + ox;
      const py = y + 26 + oy;
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(px, py, 18 * sc, 6 * sc, 0, 0, Math.PI * 2);
      g.fill();
      g.translate(px, py);
      if (dir < 0) g.scale(-1, 1);
      g.shadowColor = 'rgba(255,230,160,0.9)';
      g.shadowBlur = 8;
      g.drawImage(im, -size / 2, -size * 0.8, size, size);
      g.restore();
    }
    // estandarte pequeno sobre o líder
    g.save();
    g.fillStyle = '#ffd67a';
    g.font = '700 16px Cinzel, serif';
    g.textAlign = 'center';
    g.strokeStyle = '#1a1208';
    g.lineWidth = 4;
    const ty = y - 106 + Math.sin(this.t * 3) * 3;
    g.beginPath();
    g.moveTo(x - 7, ty);
    g.lineTo(x + 7, ty);
    g.lineTo(x, ty + 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

// ---------------- Pintura do mundo (feita uma vez) ----------------

const center = (id: string): [number, number] => MAP_ART.anchors[id] ?? [W / 2, H / 2];

/** Placa escura com borda dourada para o nome da região. */
function plaque(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(14,16,28,0.86)';
  g.strokeStyle = 'rgba(214,176,96,0.95)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(x, y, w, h, 7);
  g.fill();
  g.stroke();
}
const line = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
};
function path(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    g.quadraticCurveTo((px + x) / 2 + (y - py) * 0.15, (py + y) / 2 - (x - px) * 0.15, x, y);
  }
  g.stroke();
}
const easeInOut = (k: number) => k * k * (3 - 2 * k);

function drawSkull(g: CanvasRenderingContext2D, x: number, y: number, active: boolean): void {
  g.save();
  g.translate(x + 62, y - 44);
  g.globalAlpha = active ? 1 : 0.7;
  g.fillStyle = active ? '#f2e8d8' : '#b8b0a4';
  g.beginPath();
  g.arc(0, 0, 11, Math.PI, 0);
  g.lineTo(8, 8);
  g.lineTo(-8, 8);
  g.closePath();
  g.fill();
  g.fillStyle = '#3a1a14';
  g.beginPath();
  g.arc(-4, 0, 3, 0, Math.PI * 2);
  g.arc(4, 0, 3, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-4, 6, 2, 3);
  g.fillRect(2, 6, 2, 3);
  g.restore();
}

function drawBanner(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(0, 26, 12, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = 3;
  line(g, 0, 26, 0, -22);
  g.fillStyle = '#b0302a';
  g.beginPath();
  g.moveTo(1, -22);
  g.lineTo(24, -16);
  g.lineTo(18, -9);
  g.lineTo(24, -2);
  g.lineTo(1, -4);
  g.closePath();
  g.fill();
  g.strokeStyle = '#ffd67a';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#ffd67a';
  g.beginPath();
  g.arc(0, -24, 3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
