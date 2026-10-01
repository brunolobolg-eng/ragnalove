import { NODE_COLOR, nodeIconUrl } from './nodeArt';
import { ACTS, BIOME_LABEL, NODE_LABEL, REGIONS, REGION_BY_ID, WORLD, type Biome, type NodeType, type Region } from '../config/world';

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
  heroes: { kind: 'warrior' | 'mage' | 'archer'; level: number; dead: boolean; points: number; skillPoints: number }[];
  /** Regiões já percorridas (em ordem). */
  visited: string[];
  current: string;
  options: NodeType[];
  cityName?: string;
  reviveCost: number;
}

export interface MapCallbacks {
  onChoose(t: NodeType): void;
  onCharacter(): void;
  onSkills(): void;
  onAbandon(): void;
  onRevive(kind: 'warrior' | 'mage' | 'archer'): void;
  onUi(): void;
}

/** Retratos dos heróis (a Arqueira recebe o retrato renderizado do modelo 3D). */
export const PORTRAITS: Record<string, string> = { warrior: 'sprites/warrior_front.png', mage: 'sprites/mage_front.png', archer: '' };

const CW = 200;
const W = WORLD.cols * CW;
const H = WORLD.rows * CW;

const NODE_DESC: Record<NodeType, string> = {
  horde: 'Enfrente a horda da região. Zeni, almas, EXP e chance de itens.',
  elite: 'Horda menor com um mini-chefe no fim. Todos os heróis sobem 1 nível e o drop é garantido.',
  event: 'Um encontro na estrada: escolhas com riscos e recompensas.',
  city: 'Descanse e gaste Zeni: loja, ferreiro, mestre de armas, oráculo e templo.',
  boss: 'O chefe do ato. Vença para seguir viagem — todos sobem 1 nível e um novo herói se junta.',
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
  private walkers: Partial<Record<'warrior' | 'mage' | 'archer', HTMLImageElement[]>> = {};

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
      if (!b || b.hasAttribute('disabled')) return;
      this.cb.onUi();
      const a = b.dataset.a!;
      if (a === 'go') this.cb.onChoose(b.dataset.t as NodeType);
      else if (a === 'char') this.cb.onCharacter();
      else if (a === 'skills') this.cb.onSkills();
      else if (a === 'abandon') this.cb.onAbandon();
      else if (a === 'revive') this.cb.onRevive(b.dataset.k as 'warrior' | 'mage' | 'archer');
    });
  }

  /** Quadros de caminhada (renderizados do modelo 3D) para o marcador da party. */
  setWalkFrames(kind: 'warrior' | 'mage' | 'archer', urls: string[]): void {
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
      paintWorld(this.base.getContext('2d')!);
      this.painted = true;
    }
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

  hide(): void {
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
    const heroes = s.heroes
      .map(
        (h) => `<div class="wm-hero ${h.dead ? 'dead' : ''}">
          <img src="${PORTRAITS[h.kind] ?? ''}" alt=""><span><b>${{ mage: 'Mago', warrior: 'Guerreiro', archer: 'Arqueira' }[h.kind]}</b> Nv. ${h.level}
          ${h.points ? `<em class="pt">${h.points} atr.</em>` : ''}${h.skillPoints ? `<em class="pt sk">${h.skillPoints} hab.</em>` : ''}</span>
          ${h.dead ? `<button data-a="revive" data-k="${h.kind}" ${s.zeni > 0 ? '' : 'disabled'} title="Reviver custa 50% do Zeni">Reviver (${s.reviveCost} z)</button>` : ''}
        </div>`,
      )
      .join('');
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
          <div class="wm-bank"><span><i class="zeni-ico"></i>${s.zeni.toLocaleString('pt-BR')} Zeni</span><span><i class="soul-ico"></i>${s.souls} almas</span>${s.cityMaxHp ? `<span class="wm-city ${s.cityHp! / s.cityMaxHp < 0.4 ? 'low' : ''}" title="Vida da cidade — repare no Templo das cidades">🏰 ${s.cityHp}/${s.cityMaxHp}</span>` : ''}</div>
          <div class="wm-btns"><button data-a="char">Personagem (C)</button><button data-a="skills">Habilidades (K)</button></div>
          <button class="wm-abandon" data-a="abandon">Abandonar jornada</button>
        </div>
      </div>`;
  }

  private cellAt(e: MouseEvent): { gx: number; gy: number } {
    const r = this.over.getBoundingClientRect();
    return { gx: Math.floor(((e.clientX - r.left) / r.width) * WORLD.cols), gy: Math.floor(((e.clientY - r.top) / r.height) * WORLD.rows) };
  }

  private clickRegion(e: MouseEvent): void {
    const { gx, gy } = this.cellAt(e);
    const reg = REGIONS.find((r) => r.gx === gx && r.gy === gy);
    if (!reg) {
      this.info.hidden = true;
      return;
    }
    this.cb.onUi();
    const cities = (reg.cities ?? [])
      .map((c) => `<div class="wm-city ${c.access}">${c.access === 'locked' ? '🔒' : '⌂'} <b>${c.name}</b>${c.reason ? `<small>${c.reason}</small>` : ''}</div>`)
      .join('');
    const actTxt = reg.future ? 'Região futura (em breve)' : reg.act !== undefined ? `Ato ${['I', 'II', 'III'][reg.act]}${reg.bossOfAct !== undefined ? ' · chefe do ato' : ''}` : '';
    this.info.innerHTML = `<b>${reg.name}</b><span>${BIOME_LABEL[reg.biome]} · ${actTxt}</span>${reg.enemies ? `<small>Inimigos: ${reg.enemies}</small>` : ''}${cities}`;
    const r = this.over.getBoundingClientRect();
    const x = ((reg.gx + 0.5) / WORLD.cols) * r.width;
    const y = ((reg.gy + 1) / WORLD.rows) * r.height;
    this.info.style.left = `${Math.min(r.width - 230, Math.max(0, x - 110))}px`;
    this.info.style.top = `${Math.min(r.height - 120, y - 10)}px`;
    this.info.hidden = false;
  }

  // ---------------- Camada dinâmica: névoa, rota, trilha, marcador ----------------
  private drawOverlay(): void {
    const s = this.state;
    if (!s) return;
    const g = this.over.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const actRegions = new Set(ACTS[s.act].nodes.map((n) => n.region));
    const past = new Set(s.visited);
    for (const r of REGIONS) {
      const x = r.gx * CW;
      const y = r.gy * CW;
      if (r.future) {
        g.fillStyle = 'rgba(10,12,20,0.55)';
        g.fillRect(x, y, CW, CW);
        g.fillStyle = 'rgba(230,220,200,0.55)';
        g.font = '600 15px Cinzel, serif';
        g.textAlign = 'center';
        g.fillText('em breve', x + CW / 2, y + CW - 16);
      } else if (!actRegions.has(r.id) && !past.has(r.id)) {
        g.fillStyle = 'rgba(10,12,24,0.38)';
        g.fillRect(x, y, CW, CW);
      }
    }
    // grade das regiões
    g.strokeStyle = 'rgba(255,245,220,0.16)';
    g.lineWidth = 1;
    for (let i = 1; i < WORLD.cols; i++) line(g, i * CW, 0, i * CW, H);
    for (let j = 1; j < WORLD.rows; j++) line(g, 0, j * CW, W, j * CW);
    // regiões do ato atual: borda iluminada
    for (const id of actRegions) {
      const r = REGION_BY_ID[id];
      g.strokeStyle = `rgba(255,214,120,${0.45 + 0.2 * Math.sin(this.t * 2)})`;
      g.lineWidth = 3;
      g.strokeRect(r.gx * CW + 3, r.gy * CW + 3, CW - 6, CW - 6);
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
    // nomes das regiões
    g.textAlign = 'center';
    for (const r of REGIONS) {
      const [cx, cy] = center(r.id);
      g.font = '700 14px Cinzel, serif';
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(20,14,8,0.85)';
      const label = r.name.length > 22 ? r.name.replace(' de ', '\nde ') : r.name;
      label.split('\n').forEach((ln, i) => {
        g.strokeText(ln, cx, r.gy * CW + 22 + i * 16);
        g.fillStyle = r.future ? 'rgba(220,210,190,0.6)' : '#fff3d6';
        g.fillText(ln, cx, r.gy * CW + 22 + i * 16);
      });
      void cy;
    }
    // cidades (ícones) e cadeados
    for (const r of REGIONS) {
      (r.cities ?? []).forEach((c, i) => {
        const [cx, cy] = center(r.id);
        const ox = (r.cities!.length > 1 ? (i === 0 ? -34 : 34) : 0) + 0;
        drawCity(g, cx + ox, cy + 26, c.access === 'locked', c.name === 'Acampamento dos Refugiados');
        g.font = '600 11px Tahoma, sans-serif';
        g.fillStyle = c.access === 'locked' ? 'rgba(230,200,190,0.9)' : '#fff6dc';
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.lineWidth = 3;
        const nm = c.name.length > 14 ? c.name.split(' ').slice(0, 1).join(' ') : c.name;
        g.strokeText(nm, cx + ox, cy + 62);
        g.fillText(nm, cx + ox, cy + 62);
      });
      if (r.bossOfAct !== undefined) drawSkull(g, ...center(r.id), r.bossOfAct <= (this.state?.act ?? 0));
    }
    // marcador da party (estandarte) — com viagem animada entre atos
    let [mx, my] = center(s.current);
    if (this.travel) {
      const a = center(this.travel.from);
      const b = center(this.travel.to);
      const k = easeInOut(this.travel.t);
      mx = a[0] + (b[0] - a[0]) * k;
      my = a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 40;
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
      const fr = this.walkers[k as 'warrior'];
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

const center = (id: string): [number, number] => {
  const r = REGION_BY_ID[id];
  return [r.gx * CW + CW / 2, r.gy * CW + CW / 2 + 4];
};
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

const BIOME_COL: Record<Biome, [string, string, string]> = {
  forest: ['#3e6a34', '#2e5428', '#5a8a44'],
  plains: ['#8a9a5a', '#76864a', '#a8b070'],
  desert: ['#d8b070', '#c89858', '#e8c890'],
  mountain: ['#8a8a8a', '#6a6a70', '#c8ccd4'],
  coast: ['#c8c090', '#a8b080', '#e0d8b0'],
  island: ['#6a8a4a', '#4e6e3a', '#c8c090'],
  sea: ['#2a5a80', '#1e4a6e', '#3a6a90'],
  ash: ['#4a3a34', '#3a2a26', '#6a4a3a'],
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paintWorld(g: CanvasRenderingContext2D): void {
  const r = rng(90210);
  // mar
  const sea = g.createLinearGradient(0, 0, W, H);
  sea.addColorStop(0, '#1c4466');
  sea.addColorStop(1, '#12324e');
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(180,220,240,0.12)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = r() * H;
    g.beginPath();
    g.arc(x, y, 8 + r() * 10, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  // máscara de terra (união de blocos arredondados)
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const m = mask.getContext('2d')!;
  m.fillStyle = '#fff';
  for (const reg of REGIONS) {
    const pad = reg.biome === 'island' ? -30 : 26;
    const x = reg.gx * CW - pad;
    const y = reg.gy * CW - pad;
    m.beginPath();
    m.roundRect(x, y, CW + pad * 2, CW + pad * 2, reg.biome === 'island' ? 70 : 56);
    m.fill();
    // costa irregular
    for (let i = 0; i < 18; i++) {
      m.beginPath();
      m.arc(x + r() * (CW + pad * 2), y + r() * (CW + pad * 2), 18 + r() * 26, 0, Math.PI * 2);
      m.fill();
    }
  }
  // pintura dos biomas
  const land = document.createElement('canvas');
  land.width = W;
  land.height = H;
  const l = land.getContext('2d')!;
  for (const reg of REGIONS) {
    const [a, b, c] = BIOME_COL[reg.biome];
    const x = reg.gx * CW;
    const y = reg.gy * CW;
    const gr = l.createRadialGradient(x + CW / 2, y + CW / 2, 20, x + CW / 2, y + CW / 2, CW * 0.95);
    gr.addColorStop(0, a);
    gr.addColorStop(0.7, b);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = gr;
    l.fillRect(x - 60, y - 60, CW + 120, CW + 120);
    l.fillStyle = a;
    l.fillRect(x + 10, y + 10, CW - 20, CW - 20);
    // manchas
    for (let i = 0; i < 40; i++) {
      l.globalAlpha = 0.25 + r() * 0.3;
      l.fillStyle = [a, b, c][Math.floor(r() * 3)];
      l.beginPath();
      l.ellipse(x + r() * CW, y + r() * CW, 10 + r() * 30, 6 + r() * 20, r() * Math.PI, 0, Math.PI * 2);
      l.fill();
    }
    l.globalAlpha = 1;
    biomeDetail(l, reg, r);
  }
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(mask, 0, 0);
  l.globalCompositeOperation = 'source-over';
  // espuma/praia: máscara borrada clara por baixo da terra
  g.save();
  g.filter = 'blur(7px)';
  g.globalAlpha = 0.7;
  g.drawImage(tintMask(mask, '#e8f2f0'), 0, 0);
  g.restore();
  g.drawImage(land, 0, 0);
  // rios
  g.strokeStyle = 'rgba(70,130,170,0.85)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  river(g, [[CW * 0.2, CW * 2.3], [CW * 0.9, CW * 2.2], [CW * 1.5, CW * 2.1], [CW * 2.2, CW * 1.8], [CW * 2.5, CW * 1.55]]);
  g.lineWidth = 3;
  river(g, [[CW * 3.1, CW * 0.2], [CW * 3.3, CW * 0.7], [CW * 3.05, CW * 1.2], [CW * 2.6, CW * 1.45]]);
  // estradas
  g.strokeStyle = 'rgba(120,90,60,0.55)';
  g.lineWidth = 3;
  g.setLineDash([6, 5]);
  river(g, [center('valdrec'), center('crookedWood'), center('whisperWood'), center('ravenGlade')]);
  river(g, [center('ravenGlade'), center('rootVale'), center('dryCrossing'), center('redDunes'), center('selmara'), center('solarRuins')]);
  river(g, [center('valdrec'), center('ashenFields'), center('rustGorge'), center('frostPass'), center('ashPeak')]);
  g.setLineDash([]);
  // moldura envelhecida
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(30,18,6,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // rosa dos ventos
  compass(g, W - 70, H - 70);
}

function tintMask(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = mask.width;
  c.height = mask.height;
  const g = c.getContext('2d')!;
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  // um pouco maior que a terra (faixa de praia)
  const d = document.createElement('canvas');
  d.width = c.width;
  d.height = c.height;
  const dg = d.getContext('2d')!;
  for (const [ox, oy] of [[-8, 0], [8, 0], [0, -8], [0, 8], [0, 0]]) dg.drawImage(c, ox, oy);
  return d;
}

function river(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    g.quadraticCurveTo(px + (x - px) * 0.5 + (y - py) * 0.2, py + (y - py) * 0.5 - (x - px) * 0.2, x, y);
  }
  g.stroke();
}

function biomeDetail(l: CanvasRenderingContext2D, reg: Region, r: () => number): void {
  const x0 = reg.gx * CW;
  const y0 = reg.gy * CW;
  const pts = (n: number) => Array.from({ length: n }, () => [x0 + 14 + r() * (CW - 28), y0 + 34 + r() * (CW - 60)] as [number, number]);
  if (reg.biome === 'forest' || reg.biome === 'island') {
    for (const [x, y] of pts(70).sort((a, b) => a[1] - b[1])) {
      l.fillStyle = 'rgba(0,0,0,0.25)';
      l.beginPath();
      l.ellipse(x + 2, y + 6, 7, 3, 0, 0, Math.PI * 2);
      l.fill();
      l.fillStyle = r() < 0.5 ? '#244a22' : '#2e5a2a';
      l.beginPath();
      l.moveTo(x, y - 12);
      l.lineTo(x + 7, y + 4);
      l.lineTo(x - 7, y + 4);
      l.fill();
      l.fillStyle = 'rgba(160,200,120,0.25)';
      l.beginPath();
      l.moveTo(x, y - 12);
      l.lineTo(x - 3, y);
      l.lineTo(x - 7, y + 4);
      l.fill();
    }
  } else if (reg.biome === 'plains' || reg.biome === 'coast') {
    l.strokeStyle = 'rgba(60,70,30,0.35)';
    l.lineWidth = 1;
    for (const [x, y] of pts(90)) line(l, x, y, x + 2, y - 5);
    for (let i = 0; i < 3; i++) {
      l.fillStyle = 'rgba(200,190,110,0.35)';
      l.fillRect(x0 + 20 + r() * 120, y0 + 50 + r() * 100, 30 + r() * 20, 18 + r() * 14);
    }
  } else if (reg.biome === 'desert') {
    l.strokeStyle = 'rgba(150,100,50,0.45)';
    l.lineWidth = 2;
    for (const [x, y] of pts(26)) {
      l.beginPath();
      l.arc(x, y + 10, 14 + r() * 8, Math.PI * 1.15, Math.PI * 1.85);
      l.stroke();
    }
  } else if (reg.biome === 'mountain' || reg.biome === 'ash') {
    for (const [x, y] of pts(16).sort((a, b) => a[1] - b[1])) {
      const s = 18 + r() * 14;
      l.fillStyle = reg.biome === 'ash' ? '#2a1e1a' : '#5e6068';
      l.beginPath();
      l.moveTo(x, y - s);
      l.lineTo(x + s * 0.9, y + s * 0.4);
      l.lineTo(x - s * 0.9, y + s * 0.4);
      l.fill();
      l.fillStyle = reg.biome === 'ash' ? '#4a2e22' : '#8a8c94';
      l.beginPath();
      l.moveTo(x, y - s);
      l.lineTo(x + s * 0.9, y + s * 0.4);
      l.lineTo(x + s * 0.1, y + s * 0.4);
      l.fill();
      l.fillStyle = reg.biome === 'ash' ? '#ff6a2a' : '#f2f4f8';
      l.beginPath();
      l.moveTo(x, y - s);
      l.lineTo(x + s * 0.28, y - s * 0.55);
      l.lineTo(x - s * 0.28, y - s * 0.55);
      l.fill();
    }
    if (reg.biome === 'ash') {
      l.strokeStyle = 'rgba(255,110,40,0.6)';
      l.lineWidth = 2;
      for (let i = 0; i < 6; i++) river(l, [[x0 + r() * CW, y0 + r() * CW], [x0 + r() * CW, y0 + r() * CW]]);
    }
  }
}

function drawCity(g: CanvasRenderingContext2D, x: number, y: number, locked: boolean, camp: boolean): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(2, 14, 22, 6, 0, 0, Math.PI * 2);
  g.fill();
  if (camp) {
    for (const [ox, c] of [[-10, '#b08a58'], [8, '#c8a06a']] as [number, string][]) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(ox, -12);
      g.lineTo(ox + 11, 12);
      g.lineTo(ox - 11, 12);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.moveTo(ox, -12);
      g.lineTo(ox + 11, 12);
      g.lineTo(ox + 2, 12);
      g.fill();
    }
    g.fillStyle = '#ff9a3a';
    g.beginPath();
    g.arc(0, 10, 3, 0, Math.PI * 2);
    g.fill();
  } else {
    const wall = locked ? '#7a7270' : '#d8ccb0';
    const roof = locked ? '#5a4a48' : '#b0463a';
    g.fillStyle = wall;
    g.fillRect(-18, -4, 36, 16);
    g.fillRect(-20, -14, 10, 26);
    g.fillRect(10, -14, 10, 26);
    g.fillRect(-6, -20, 12, 32);
    g.fillStyle = roof;
    for (const [cx, w, top] of [[-15, 12, -24], [15, 12, -24], [0, 14, -32]] as [number, number, number][]) {
      g.beginPath();
      g.moveTo(cx - w / 2 - 1, top + 10);
      g.lineTo(cx, top);
      g.lineTo(cx + w / 2 + 1, top + 10);
      g.fill();
    }
    g.fillStyle = 'rgba(40,30,20,0.8)';
    g.beginPath();
    g.roundRect(-4, 2, 8, 10, [4, 4, 0, 0]);
    g.fill();
    g.strokeStyle = 'rgba(40,30,20,0.6)';
    g.lineWidth = 1;
    g.strokeRect(-18, -4, 36, 16);
  }
  if (locked) {
    g.fillStyle = 'rgba(20,20,26,0.9)';
    g.beginPath();
    g.roundRect(8, -6, 16, 13, 2);
    g.fill();
    g.strokeStyle = '#e8d8b0';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(16, -6, 5, Math.PI, 0);
    g.stroke();
    g.fillStyle = '#e8d8b0';
    g.fillRect(15, -2, 2, 5);
  }
  g.restore();
}

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

function compass(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.translate(x, y);
  g.globalAlpha = 0.75;
  g.fillStyle = '#e8dcc0';
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -34);
    g.lineTo(6, 0);
    g.lineTo(-6, 0);
    g.fill();
  }
  g.fillStyle = '#3a2a1a';
  g.font = '700 14px Cinzel, serif';
  g.textAlign = 'center';
  g.fillText('N', 0, -38);
  g.restore();
}
