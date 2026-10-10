import type { Orientation } from '../core/grid/types';
import type { Item, Slot } from '../core/progression/equipment';
import { ITEM_KIND_LABEL, RARITY_INFO, SLOTS, SLOT_GROUP, SLOT_KINDS, SLOT_LABEL, canUse, itemKind, itemLines, itemName } from '../core/progression/equipment';
import { itemArtCanvas } from './itemArt';
import { ATTR_KEYS, ATTR_LABEL, attrHint, type AttrKey } from '../core/progression/attributes';
import { SKILL_ICONS } from './icons';
import { itemIconUrl } from './itemArt';
import { HERO_INFO, HERO_NAME, HERO_ORDER } from '../config/heroes';
import { type HeroKind } from '../core/progression/skills';

export type { HeroKind };
const ALL_HEROES: HeroKind[] = HERO_ORDER;

export type Tool = HeroKind | 'barrier' | 'barrier2' | 'barrier3' | 'wall';

export interface HudCallbacks {
  onTool(t: Tool): void;
  onOrientation(o: Orientation): void;
  onStart(): void;
  onRetreat(): void;
  onReset(): void;
  onSpeed(s: number): void;
  /** Distribui `amount` pontos (ou o que houver) no atributo. */
  onAttr(kind: string, key: AttrKey, amount: number): void;
  onSkills(): void;
  onEquip(kind: string, itemId: string): void;
  onUnequip(kind: string, slot: Slot): void;
  /** Seleciona o herói na batalha (mostra a zona de agressão dele). */
  onSelectMember(kind: HeroKind): void;
}

/** Dados da janela de personagem (atributos + equipamento), montados pelo main. */
export interface CharacterVM {
  editable: boolean;
  souls: number;
  zeni: number;
  respecCost: number;
  soulAbsorb: { souls: number; exp: number };
  inventory: Item[];
  heroes: {
    kind: HeroKind;
    level: number;
    points: number;
    /** Preço do próximo ponto comprado com Zen. */
    pointCost: number;
    /** Tem pontos distribuídos (pode redistribuir). */
    spent: boolean;
    attrs: Record<AttrKey, number>;
    base: Record<AttrKey, number>;
    gearAttrs: Record<AttrKey, number>;
    derived: [string, string][];
    equipment: Partial<Record<Slot, Item>>;
  }[];
}

export interface HudMember {
  kind: HeroKind;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Ataque básico (sempre usado, não ocupa slot): ícone, nome e recarga 0..1. */
  basic: { icon: string; name: string; cd: number };
  /**
   * Os 5 slots de habilidade (Mana): habilidade equipada com recarga 0..1, slot livre
   * (liberado mas vazio) ou bloqueado (falta Mana/Inteligência).
   */
  slots: HudSlot[];
  /** Almas roubadas por este herói. */
  souls: number;
  level: number;
  exp: number;
  expNext: number;
  /** Progressão pendente (mostra a estrela dourada no retrato até gastar). */
  points: number;
  skillPoints: number;
}

export interface HudSlot {
  id?: string;
  name?: string;
  icon?: string;
  cd: number;
  locked: boolean;
}

export interface HudState {
  phase: 'setup' | 'running' | 'victory' | 'defeat';
  killed: number;
  total: number;
  /** Chefe já nasceu (a caveira da travessia acende). */
  bossOut?: boolean;
  /** Almas totais da party (moeda de progressão). */
  souls: number;
  /** Zen da bolsa (banco + ganho nesta onda). */
  zeni: number;
  /** Sobrevivência em andamento: estágio e tempo. */
  survival?: { stage: number; seconds: number };
  members: HudMember[];
}

const NAME: Record<HeroKind, string> = HERO_NAME;
const PORTRAIT: Record<string, string> = {
  warrior: 'sprites/portrait_warrior.png', mage: 'sprites/portrait_mage.png', archer: 'sprites/portrait_archer.png',
  sorcerer: 'sprites/portrait_sorcerer.png', warlock: 'sprites/portrait_warlock.png', assassin: 'sprites/portrait_assassin.png',
};

/**
 * HUD no estilo das janelas clássicas de MMO isométrico: janelas azul-acinzentadas
 * translúcidas com barra de título, barras finas de HP, barra de atalhos com ícones
 * de habilidade e caixa de mensagens. Só a "pele" mudou: mesma informação e controles.
 */
export class Hud {
  private readonly el: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly victory: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly logEl: HTMLElement;
  private readonly waveEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly memberEls = new Map<
    string,
    { hp: HTMLElement; hpTxt: HTMLElement; souls: HTMLElement; win: HTMLElement; exp: HTMLElement; expTxt: HTMLElement; lv: HTMLElement; up: HTMLElement; level: number; slots: HTMLElement; basic: HTMLElement; slotKey: string }
  >();
  private readonly charWin: HTMLElement;
  private readonly charBadge: HTMLElement;
  private charKind: HeroKind = 'warrior';
  private bagFilter: 'all' | 'weapon' | 'armor' | 'accessory' = 'all';
  private readonly fullBody: Partial<Record<HeroKind, string>> = {};
  private party: HeroKind[] = ['warrior', 'mage'];
  private barEl!: HTMLElement;
  private charVM: CharacterVM | undefined;
  private readonly soulTotal: HTMLElement;
  private lastSouls = 0;
  private readonly zeniTotal: HTMLElement;
  private lastZeni = -1;
  private stageEl!: HTMLElement;
  private zoneEl!: HTMLElement;
  private cityHp = -1;
  private objHandlers: (() => void)[] = [];

  /** Barra de vida da cidade (HP atual, máximo e quantos invadiram nesta onda). */
  setCity(hp: number, max: number, invaded = 0): void {
    const bar = this.el.querySelector<HTMLElement>('.city-bar')!;
    const frac = max > 0 ? Math.max(0, hp / max) : 0;
    bar.querySelector<HTMLElement>('.cb-fill')!.style.width = `${frac * 100}%`;
    // a parte "perdida" some devagar atrás da barra (leitura do dano recebido)
    bar.querySelector<HTMLElement>('.cb-lag')!.style.width = `${frac * 100}%`;
    bar.querySelector('.cb-txt')!.textContent = `${Math.ceil(hp)} / ${max}`;
    bar.classList.toggle('warn', frac < 0.7 && frac >= 0.4);
    bar.classList.toggle('danger', frac < 0.4);
    bar.classList.toggle('critical', frac < 0.2);
    const inv = bar.querySelector<HTMLElement>('.cb-in')!;
    inv.hidden = invaded <= 0;
    inv.textContent = `${invaded} invadiram`;
    bar.title = `Vida da cidade: cada inimigo que alcança o portão invade e desconta a vida dela. Zero = fim da jornada. Ameaça atual: ${Math.round((1 - frac) * 100)}%.`;
    if (this.cityHp >= 0 && hp < this.cityHp) {
      bar.classList.remove('hit');
      void bar.offsetWidth;
      bar.classList.add('hit');
    }
    this.cityHp = hp;
  }

  /** Menu de um objeto do mapa (planejamento): título, o que faz e as ações possíveis. */
  showObjectMenu(x: number, y: number, title: string, desc: string, actions: { label: string; disabled?: boolean; onClick: () => void }[]): void {
    const m = this.el.querySelector<HTMLElement>('.obj-menu')!;
    this.planHint(undefined);
    m.querySelector('.om-title')!.textContent = title;
    m.querySelector('.om-desc')!.textContent = desc;
    this.objHandlers = actions.map((a) => a.onClick);
    m.querySelector('.om-acts')!.innerHTML = actions.length
      ? actions.map((a, i) => `<button data-om="${i}" class="${i === 0 ? 'primary' : ''}"${a.disabled ? ' disabled' : ''}>${a.label}</button>`).join('')
      : '<small class="om-none">Efeito passivo (acontece durante a onda).</small>';
    m.hidden = false;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    m.style.left = `${Math.min(window.innerWidth - w - 8, x + 14)}px`;
    m.style.top = `${Math.min(window.innerHeight - h - 8, y + 10)}px`;
  }

  hideObjectMenu(): void {
    this.el.querySelector<HTMLElement>('.obj-menu')!.hidden = true;
  }

  /** Linha da fase atual (região e tipo). */
  setStage(title: string, sub: string): void {
    this.el.querySelector('.wave')!.textContent = title;
    this.stageEl.textContent = sub;
    this.zoneEl.textContent = sub.split(' — ')[0];
  }

  /** Retrato de um herói (a Arqueira usa um retrato renderizado do modelo 3D). */
  /** Corpo inteiro do herói (renderizado do modelo 3D) para a ficha. */
  setFullBody(k: HeroKind, url: string): void {
    this.fullBody[k] = url;
  }

  setPortrait(k: HeroKind, url: string): void {
    PORTRAIT[k] = url;
    const img = this.el.querySelector<HTMLImageElement>(`[data-member="${k}"] .pc-port > img`);
    if (img) img.src = url;
  }

  /** Heróis da party: cartões na barra de baixo e ferramentas de posicionamento. */
  setParty(party: HeroKind[], dead: HeroKind[] = []): void {
    this.party = party;
    if (!party.includes(this.charKind)) this.charKind = party[0];
    this.memberEls.clear();
    this.barEl.className = `party-bar n${party.length}`;
    this.barEl.innerHTML = party
      .map((k) => {
        const info = HERO_INFO[k];
        const emblem = SKILL_ICONS[info.area]?.() ?? '';
        return `<div class="pc" data-member="${k}" style="--hc:#${info.color.toString(16).padStart(6, '0')}">
          <div class="pc-port"><img src="${PORTRAIT[k] || 'data:,'}" alt=""><i class="pc-lv" title="Nível">1</i><i class="pc-up" title="Progressão disponível: distribua pontos ou gaste pontos de habilidade">✦</i><span class="pc-basic"></span></div>
          <div class="pc-main">
            <div class="pc-head"><img class="pc-emb" src="${emblem}" alt=""><b>${NAME[k]}</b><span class="pc-souls" title="Almas roubadas"><i class="soul-ico"></i><b>0</b></span></div>
            <div class="pc-bars"><div class="pc-hp"><i></i><span></span></div><div class="pc-exp" title="Experiência"><i></i><span></span></div></div>
            <div class="pc-slots"></div>
          </div>
        </div>`;
      })
      .join('');
    this.barEl.querySelectorAll<HTMLElement>('[data-member]').forEach((w) => {
      this.memberEls.set(w.dataset.member!, {
        win: w,
        hp: w.querySelector('.pc-hp i')!,
        hpTxt: w.querySelector('.pc-hp span')!,
        exp: w.querySelector('.pc-exp i')!,
        expTxt: w.querySelector('.pc-exp span')!,
        lv: w.querySelector('.pc-lv')!,
        level: 1,
        up: w.querySelector('.pc-up')!,
        souls: w.querySelector('.pc-souls b')!,
        slots: w.querySelector('.pc-slots')!,
        basic: w.querySelector('.pc-basic')!,
        slotKey: '',
      });
    });
    this.el.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => {
      const t = b.dataset.tool!;
      const owner = t.startsWith('barrier') ? 'mage' : t === 'wall' ? 'warrior' : (t as HeroKind);
      b.hidden = !party.includes(owner) || dead.includes(owner);
    });
  }

  /** Redesenha os 5 slots de um herói quando o que está equipado muda. */
  private renderSlots(el: { slots: HTMLElement; basic: HTMLElement; slotKey: string }, m: HudMember): void {
    const key = m.basic.icon + '|' + m.slots.map((x) => (x.locked ? '#' : x.id ?? '_')).join(',');
    if (key === el.slotKey) return;
    el.slotKey = key;
    el.basic.innerHTML = `<img src="${m.basic.icon}" alt="" title="Ataque básico: ${m.basic.name} (sempre usado, não ocupa slot)"><div class="cd"></div>`;
    el.slots.innerHTML = m.slots
      .map((x, i) =>
        x.locked
          ? `<div class="pc-slot locked" title="Slot bloqueado: falta Mana (suba Inteligência)"><span>🔒</span><em>${i + 1}</em></div>`
          : x.id
            ? `<div class="pc-slot" title="${x.name}"><img src="${x.icon}" alt=""><div class="cd"></div><em>${i + 1}</em></div>`
            : `<div class="pc-slot empty" title="Slot livre: equipe uma habilidade na árvore (K)"><em>${i + 1}</em></div>`,
      )
      .join('');
  }

  /**
   * Prontidão da habilidade (padrão AAA): o ícone sai escuro logo depois de conjurar e clareia conforme a
   * recarga termina; quando fica pronta, um brilho passa uma vez e o contorno acende. `--light` vai de 0
   * (escuro, recém-conjurada) a 1 (claro, pronta). Fora da luta (planejamento), tudo aparece claro.
   */
  private setReadiness(slot: HTMLElement, cd: number, alive: boolean, running: boolean): void {
    const ready = running && alive && cd <= 0;
    const light = !alive ? 0.2 : running && cd > 0 ? Math.round((0.3 + 0.7 * (1 - cd)) * 100) / 100 : 1;
    if (slot.dataset.light !== String(light)) {
      slot.dataset.light = String(light);
      slot.style.setProperty('--light', String(light));
    }
    if (ready !== (slot.dataset.ready === '1')) {
      slot.dataset.ready = ready ? '1' : '0';
      slot.classList.toggle('ready', ready);
      if (ready) {
        slot.classList.remove('pop');
        void slot.offsetWidth; // reinicia a animação do brilho
        slot.classList.add('pop');
        slot.addEventListener('animationend', () => slot.classList.remove('pop'), { once: true });
      }
    }
  }

  /** Cache dos `.cd` por contêiner (o DOM dos slots só muda em renderSlots; evita querySelector por frame). */
  private cdCache = new WeakMap<HTMLElement, (HTMLElement | null)[]>();
  private cdOf(parent: HTMLElement, i: number): HTMLElement | null {
    const n = parent.children.length;
    let arr = this.cdCache.get(parent);
    if (!arr || arr.length !== n) {
      arr = Array.from(parent.children, (c) => c.querySelector<HTMLElement>('.cd'));
      this.cdCache.set(parent, arr);
    }
    return arr[i] ?? null;
  }

  /** Marca o herói selecionado na batalha (anel; independente da estrela de progressão). */
  setSelected(kind?: HeroKind): void {
    this.barEl.querySelectorAll<HTMLElement>('[data-member]').forEach((w) => w.classList.toggle('sel', !!kind && w.dataset.member === kind));
  }

  /** Marca a orientação ativa (quando troca a barreira selecionada). */
  showOrientation(o: Orientation): void {
    this.el.querySelectorAll<HTMLElement>('[data-orient]').forEach((b) => b.classList.toggle('on', b.dataset.orient === o));
  }

  constructor(root: HTMLElement, cb: HudCallbacks) {
    root.innerHTML = `
      <div class="region-title"><img class="rt-emb" src="emblem.png" alt=""><div><b>Aurenthal</b><span class="rt-zone"></span></div></div>
      <div class="party-bar"></div>
      <div class="win charwin rog" hidden>
        <div class="win-title"><span>Ficha do Herói</span><button class="x" data-act="char-close">×</button></div>
        <div class="win-body char-body"></div>
        <div class="cw-tip" hidden></div>
      </div>

      <div class="win tactics">
        <div class="win-title"><span>Objetivo</span><i class="dots"></i></div>
        <div class="obj-line">◆ Defenda a cidade: derrote a horda antes que ela alcance o portão.</div>
        <div class="win-body">
          <div class="wave-line"><span class="wave">Fase 1</span><span class="kills"></span></div>
          <div class="stage-line"></div>
          <div class="soul-line" title="Almas roubadas: moeda de evolução da party"><i class="soul-ico big"></i><span>Almas</span><b class="soul-total">0</b></div>
          <div class="zeni-line" title="Zen: moeda para atributos, redistribuição, lojas e refino"><i class="zeni-ico"></i><span>Zen</span><b class="zeni-total">0</b></div>
          <div class="phase"></div>
          <div class="plan-only tool-chips" data-group="tool" title="Selecione e clique no chão — ou arraste direto no campo">
            ${ALL_HEROES.map((k, i) => `<button data-tool="${k}" class="${i === 0 ? 'on' : ''}" title="Posicionar ${NAME[k]}">${NAME[k]}</button>`).join('')}
            <button data-tool="wall" title="Muralha do Guerreiro">🧱 Muralha</button>
            <button data-tool="barrier" title="Barreira de Fogo 1">🔥1</button>
            <button data-tool="barrier2" title="Barreira de Fogo 2">🔥2</button>
            <button data-tool="barrier3" title="Barreira de Fogo 3">🔥3</button>
          </div>
          <div class="row">
            <button data-act="char">Personagem (C)<span class="badge" hidden></span></button>
            <button data-act="skills">Habilidades (K)</button>
          </div>
          <div class="row"><button class="retreat" data-act="retreat" hidden>🏳 Recuar e coletar prêmios</button></div>
          <div class="row plan-only">
            <button data-act="reset" title="Volta a party para a posição inicial da zona">↺ Reposicionar</button>
            <button class="primary" data-act="start" hidden>Iniciar horda</button>
          </div>
          <div class="row speed" data-group="speed">
            <span class="lbl">Vel.</span>
            <button data-speed="1" class="on" title="Tecla 1">1×</button>
            <button data-speed="2" title="Tecla 2">2×</button>
            <button data-speed="3" title="Tecla 3">3×</button>
            <button data-speed="4" title="Tecla 4">4×</button>
          </div>
        </div>
      </div>

      <div class="start-bar">
        <div class="start-help" hidden>
          <b>Planejamento</b>
          <span>🖱 <b>Arraste</b> heróis, barreiras e a muralha no campo</span>
          <span>🔥 <b>Arraste a ponta</b> da barreira para girar (ou clique nela / <kbd>R</kbd>)</span>
          <span>✦ <b>Clique</b> nos objetos brilhando para usá-los</span>
          <b>Câmera</b>
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou botão direito arrastando · roda = zoom · <kbd>F</kbd> centraliza</span>
          <span>Velocidade <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></span>
        </div>
        <div class="start-row">
          <button class="help-btn" data-act="help" title="Como jogar">?</button>
          <button class="start-big" data-act="start-big"><span class="tri">▶</span> Iniciar horda <kbd>Espaço</kbd></button>
        </div>
      </div>
      <div class="city-bar" title="Vida da cidade: cada inimigo que alcança o portão invade e desconta a vida dela. Zero = fim da jornada.">
        <span class="cb-name">🏰 Cidade</span>
        <div class="cb-track"><div class="cb-lag"></div><div class="cb-fill"></div></div>
        <b class="cb-txt">1000 / 1000</b>
        <span class="cb-in" hidden></span>
      </div>
      <div class="night-bar" title="">
        <span class="nb-moon" title="Anoitecer">🌙</span>
        <div class="nb-track"><div class="nb-stars"></div><div class="nb-party">🛡️</div><div class="nb-boss" title="Chefe da horda">💀</div></div>
        <span class="nb-sun" title="Amanhecer">☀️</span>
      </div>
      <div class="obj-menu win" hidden>
        <div class="win-title"><span class="om-title"></span><button class="x" data-om="close">×</button></div>
        <div class="win-body"><p class="om-desc"></p><div class="om-acts"></div></div>
      </div>
      <div class="plan-hint" hidden></div>
      <div class="speed-toast" hidden></div>



      <div class="chat">
        <div class="tabs"><span class="tab on">Batalha</span><span class="tab">Geral</span></div>
        <div class="log"></div>
      </div>

      <div class="banner"></div>
      <div class="victory-card" hidden>
        <span class="vc-rays"></span><span class="vc-glow"></span>
        <svg class="vc-emblem" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3 L37 36 L32 41 L27 36 Z" fill="#ffe39a" stroke="#6a4a10" stroke-width="1.5"/><rect x="19" y="36" width="26" height="5" rx="2.5" fill="#c9a24a" stroke="#6a4a10" stroke-width="1.5"/><rect x="29" y="41" width="6" height="12" fill="#5a3a22"/><circle cx="32" cy="57" r="3.5" fill="#c9a24a" stroke="#6a4a10"/></svg>
        <div class="vc-plate"><h2 class="vc-title"></h2></div>
        <p class="vc-sub">Fase concluída</p>
        <span class="vc-tag"></span>
      </div>
      <div class="horde-count" hidden><span>A horda se aproxima em</span><b></b></div>
    `;
    this.el = root;
    this.banner = root.querySelector('.banner')!;
    this.victory = root.querySelector('.victory-card')!;
    this.startBtn = root.querySelector('[data-act="start"]')!;
    this.logEl = root.querySelector('.log')!;
    this.waveEl = root.querySelector('.kills')!;
    this.phaseEl = root.querySelector('.phase')!;
    this.soulTotal = root.querySelector('.soul-total')!;
    this.zeniTotal = root.querySelector('.zeni-total')!;
    this.charWin = root.querySelector('.charwin')!;
    this.charBadge = root.querySelector('[data-act="char"] .badge')!;
    root.querySelector('[data-act="char"]')!.addEventListener('click', () => this.toggleCharacter());
    root.querySelector('[data-act="skills"]')!.addEventListener('click', () => cb.onSkills());
    this.stageEl = root.querySelector('.stage-line')!;
    this.barEl = root.querySelector('.party-bar')!;
    this.barEl.addEventListener('click', (ev) => {
      const w = (ev.target as HTMLElement).closest<HTMLElement>('[data-member]');
      if (w) cb.onSelectMember(w.dataset.member as HeroKind);
    });
    this.zoneEl = root.querySelector('.rt-zone')!;
    root.querySelector('[data-act="char-close"]')!.addEventListener('click', () => this.toggleCharacter(false));
    // Cliques da janela de personagem (delegados; o conteúdo é redesenhado a cada mudança).
    this.charWin.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!t || t.hasAttribute('disabled')) return;
      const k = this.charKind;
      const c = t.dataset.c!;
      if (c === 'tab') {
        this.charKind = t.dataset.kind as HeroKind;
        this.renderCharacter();
      } else if (c === 'filter') {
        this.bagFilter = t.dataset.f as typeof this.bagFilter;
        this.renderCharacter();
      } else if (c === 'plus') cb.onAttr(k, t.dataset.key as AttrKey, Number(t.dataset.n ?? 1));
      else if (c === 'equip') cb.onEquip(k, t.dataset.id!);
      else if (c === 'unequip') cb.onUnequip(k, t.dataset.slot as Slot);
    });
    // dica flutuante dos itens (estilo MMO): segue o mouse
    const tip = this.charWin.querySelector<HTMLElement>('.cw-tip')!;
    this.charWin.addEventListener('mousemove', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (!t) {
        tip.hidden = true;
        return;
      }
      const html = this.tipHtml(t.dataset.tip!);
      if (!html) {
        tip.hidden = true;
        return;
      }
      if (tip.dataset.key !== t.dataset.tip) {
        tip.innerHTML = html;
        tip.dataset.key = t.dataset.tip;
      }
      tip.hidden = false;
      const r = this.charWin.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let x = ev.clientX - r.left + 16;
      let y = ev.clientY - r.top + 14;
      if (ev.clientX + 16 + w > window.innerWidth - 8) x = ev.clientX - r.left - w - 12;
      if (ev.clientY + 14 + h > window.innerHeight - 8) y = ev.clientY - r.top - h - 10;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    });
    this.charWin.addEventListener('mouseleave', () => (tip.hidden = true));
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        this.select('tool', b);
        cb.onTool(b.dataset.tool as Tool);
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-orient]').forEach((b) =>
      b.addEventListener('click', () => {
        this.select('orient', b);
        cb.onOrientation(b.dataset.orient as Orientation);
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        this.select('speed', b);
        cb.onSpeed(Number(b.dataset.speed));
      }),
    );
    this.startBtn.addEventListener('click', () => cb.onStart());
    root.querySelector('[data-act="start-big"]')!.addEventListener('click', () => cb.onStart());
    root.querySelector('[data-act="help"]')!.addEventListener('click', () => {
      const h = root.querySelector<HTMLElement>('.start-help')!;
      h.hidden = !h.hidden;
    });
    root.querySelector('[data-act="reset"]')!.addEventListener('click', () => cb.onReset());
    root.querySelector('[data-act="retreat"]')!.addEventListener('click', () => cb.onRetreat());
    root.querySelector('.obj-menu')!.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-om]');
      if (!b || b.hasAttribute('disabled')) return;
      const k = b.dataset.om!;
      if (k !== 'close') this.objHandlers[Number(k)]?.();
      this.hideObjectMenu();
    });
  }

  private select(group: string, btn: HTMLButtonElement): void {
    this.el.querySelectorAll(`[data-group="${group}"] button`).forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
  }

  /** Marca a ferramenta ativa (quando o jogador pega algo arrastando no campo). */
  setTool(t: Tool): void {
    const b = this.el.querySelector<HTMLButtonElement>(`[data-tool="${t}"]`);
    if (b) this.select('tool', b);
  }

  /** Velocidade escolhida pelas teclas 1–4 (marca o botão e mostra um aviso curto). */
  private toastT = 0;
  setSpeed(sp: number): void {
    const b = this.el.querySelector<HTMLButtonElement>(`[data-speed="${sp}"]`);
    if (b) this.select('speed', b);
    const t = this.el.querySelector<HTMLElement>('.speed-toast')!;
    t.textContent = `⏩ Velocidade ${sp}×`;
    t.hidden = false;
    t.classList.remove('pop');
    void t.offsetWidth;
    t.classList.add('pop');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => (t.hidden = true), 1100);
  }

  /** Dica ao lado do cursor durante o planejamento ("Arraste para mover"). */
  planHint(text: string | undefined, x = 0, y = 0): void {
    const h = this.el.querySelector<HTMLElement>('.plan-hint')!;
    if (!text) {
      h.hidden = true;
      return;
    }
    if (h.textContent !== text) h.textContent = text;
    h.hidden = false;
    h.style.left = `${x + 18}px`;
    h.style.top = `${y + 14}px`;
  }

  setOrientation(o: Orientation): void {
    const b = this.el.querySelector<HTMLButtonElement>(`[data-orient="${o}"]`);
    if (b) this.select('orient', b);
  }

  /** Travessia da noite: o emblema da party anda da lua ao sol conforme a horda cai (sem números). */
  setNight(s: HudState): void {
    const bar = this.el.querySelector<HTMLElement>('.night-bar')!;
    const party = bar.querySelector<HTMLElement>('.nb-party')!;
    const boss = bar.querySelector<HTMLElement>('.nb-boss')!;
    const stars = bar.querySelector<HTMLElement>('.nb-stars')!;
    if (s.survival) {
      bar.classList.add('endless');
      bar.title = `Sobrevivência — estágio ${s.survival.stage}, sem amanhecer à vista`;
      return;
    }
    bar.classList.remove('endless');
    const frac = s.total > 0 ? Math.max(0, Math.min(1, s.killed / s.total)) : 0;
    party.style.left = `${frac * 100}%`;
    stars.style.opacity = String(1 - frac * 0.85);
    boss.classList.toggle('out', !!s.bossOut);
    bar.title = `Travessia da noite: ${s.killed}/${s.total} da horda${s.bossOut ? ' — o chefe saiu da escuridão!' : ''}`;
  }

  setPlanning(planning: boolean): void {
    this.el.classList.toggle('running', !planning);
    this.startBtn.disabled = !planning;
  }

  setSurvival(on: boolean): void {
    this.el.querySelector<HTMLElement>('[data-act="retreat"]')!.hidden = !on;
    this.el.classList.toggle('survival', on);
  }

  update(s: HudState): void {
    this.waveEl.textContent = s.survival
      ? `Estágio ${s.survival.stage} · ${Math.floor(s.survival.seconds / 60)}:${String(s.survival.seconds % 60).padStart(2, '0')} · ${s.killed} abates`
      : `${s.killed}/${s.total} abatidos`;
    this.setNight(s);
    if (s.souls !== this.lastSouls) {
      this.soulTotal.textContent = String(s.souls);
      // pulso curto a cada alma nova (sem popup grande)
      if (s.souls > this.lastSouls) {
        this.soulTotal.parentElement!.classList.remove('gain');
        void this.soulTotal.parentElement!.offsetWidth;
        this.soulTotal.parentElement!.classList.add('gain');
      }
      this.lastSouls = s.souls;
    }
    if (s.zeni !== this.lastZeni) {
      this.zeniTotal.textContent = s.zeni.toLocaleString('pt-BR');
      if (s.zeni > this.lastZeni && this.lastZeni >= 0) {
        this.zeniTotal.parentElement!.classList.remove('gain');
        void this.zeniTotal.parentElement!.offsetWidth;
        this.zeniTotal.parentElement!.classList.add('gain');
      }
      this.lastZeni = s.zeni;
    }
    this.phaseEl.textContent =
      s.phase === 'setup'
        ? 'Planejamento — posicione e inicie (Espaço)'
        : s.phase === 'running'
          ? 'Combate automático'
          : 'Fim da fase';
    for (const m of s.members) {
      const el = this.memberEls.get(m.kind);
      if (el) {
        const frac = m.maxHp ? m.hp / m.maxHp : 0;
        el.hp.style.width = `${Math.max(0, frac) * 100}%`;
        el.hp.classList.toggle('low', frac < 0.25);
        el.hpTxt.textContent = `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`;
        el.win.classList.toggle('dead', !m.alive);
        el.souls.textContent = String(m.souls);
        // Barra de EXP: preenchimento animado (transição CSS) + estouro ao subir de nível.
        const ef = m.expNext ? Math.min(1, m.exp / m.expNext) : 0;
        if (m.level > el.level) {
          el.win.classList.remove('lvup');
          void el.win.offsetWidth;
          el.win.classList.add('lvup');
          el.exp.style.transition = 'none';
          el.exp.style.width = '100%';
          void el.exp.offsetWidth;
          el.exp.style.transition = '';
        }
        el.level = m.level;
        el.exp.style.width = `${ef * 100}%`;
        el.lv.textContent = String(m.level);
        el.expTxt.textContent = `${Math.floor(ef * 100)}%`;
        // estrela dourada: progressão pendente (some ao gastar os pontos)
        el.up.hidden = !(m.points > 0 || m.skillPoints > 0);
        // slots de habilidade (recarga em leque escuro, brilho quando pronta)
        this.renderSlots(el, m);
        const cells = [{ cd: m.basic.cd, parent: el.basic as HTMLElement, i: 0 }, ...m.slots.map((x, i) => ({ cd: x.cd, parent: el.slots as HTMLElement, i, skip: x.locked || !x.id }))];
        for (const c of cells) {
          if ('skip' in c && c.skip) continue;
          const cdEl = this.cdOf(c.parent, c.i);
          const deg = Math.round(c.cd * 360);
          if (cdEl) cdEl.style.background = deg > 0 ? `conic-gradient(rgba(6,9,22,0.75) ${deg}deg, transparent ${deg}deg)` : 'none';
          const slot = c.parent === el.basic ? el.basic : (el.slots.children[c.i] as HTMLElement | undefined);
          if (slot) this.setReadiness(slot, c.cd, m.alive, s.phase === 'running');
        }
      }
    }
  }

  log(text: string, kind: 'info' | 'skill' | 'warn' | 'good' = 'info'): void {
    const line = document.createElement('div');
    line.className = `msg ${kind}`;
    line.textContent = text;
    this.logEl.appendChild(line);
    while (this.logEl.childElementCount > 40) this.logEl.firstElementChild!.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  clearLog(): void {
    this.logEl.innerHTML = '';
  }

  /** Contagem regressiva do planejamento (0 esconde). */
  setCountdown(seconds: number): void {
    const el = this.el.querySelector<HTMLElement>('.horde-count')!;
    el.hidden = seconds <= 0;
    if (seconds <= 0) return;
    const b = el.querySelector('b')!;
    b.textContent = String(seconds);
    el.classList.toggle('urgent', seconds <= 3);
    // reinicia a animação de "batida" a cada segundo
    b.classList.remove('tick');
    void b.offsetWidth;
    b.classList.add('tick');
  }

  /** Vitória da horda: cartão dourado com o título do mapa e o nome da região. */
  showVictory(title: string, region: string): void {
    this.victory.querySelector('.vc-title')!.textContent = title;
    this.victory.querySelector('.vc-tag')!.textContent = region.toUpperCase();
    this.victory.hidden = false;
    requestAnimationFrame(() => this.victory.classList.add('show'));
  }

  hideVictory(): void {
    this.victory.classList.remove('show');
    this.victory.hidden = true;
  }

  showBanner(text: string, kind: 'victory' | 'defeat' | ''): void {
    this.banner.textContent = text;
    this.banner.className = `banner ${kind} ${text ? 'show' : ''}`;
  }

  // ---------- Janela de personagem ----------

  /** Escolhe a aba do herói na janela de personagem. */
  selectCharacter(kind: HeroKind): void {
    if (!this.party.includes(kind)) return;
    this.charKind = kind;
    if (!this.charWin.hidden) this.renderCharacter();
  }

  toggleCharacter(force?: boolean): void {
    const open = force ?? this.charWin.hidden;
    this.charWin.hidden = !open;
    if (open) this.renderCharacter();
  }

  setCharacter(vm: CharacterVM): void {
    this.charVM = vm;
    const pts = vm.heroes.reduce((s, h) => s + h.points, 0);
    this.charBadge.hidden = pts <= 0;
    this.charBadge.textContent = String(pts);
    if (!this.charWin.hidden) this.renderCharacter();
  }

  private renderCharacter(): void {
    const vm = this.charVM;
    if (!vm) return;
    const h = vm.heroes.find((x) => x.kind === this.charKind) ?? vm.heroes[0];
    const dis = (on: boolean) => (on ? '' : ' disabled');
    const ROLE = Object.fromEntries(HERO_ORDER.map((k) => [k, HERO_INFO[k].role])) as Record<HeroKind, string>;
    const tabs = vm.heroes
      .map(
        (x) => `<button data-c="tab" data-kind="${x.kind}" class="cw-tab ${x.kind === h.kind ? 'on' : ''}">
          <img src="${PORTRAIT[x.kind] ?? ''}" alt=""><span>${NAME[x.kind]}<small>Nv. ${x.level}</small></span>${x.points ? `<i class="badge">${x.points}</i>` : ''}</button>`,
      )
      .join('');
    const slotCell = (s: Slot) => {
      const it = h.equipment[s];
      if (!it) {
        const ghost = ghostIcon(s);
        return `<div class="cw-slot empty" data-tip="slot:${s}"><img src="${ghost}" alt=""><small>${SLOT_LABEL[s]}</small></div>`;
      }
      const info = RARITY_INFO[it.rarity];
      return `<button class="cw-slot r-${it.rarity}" data-c="unequip" data-slot="${s}" data-tip="eq:${s}" style="--rc:${info.color}"${dis(vm.editable)}>
        <img src="${itemIconUrl(it)}" alt="">${it.refine ? `<em>+${it.refine}</em>` : ''}</button>`;
    };
    const L: Slot[] = ['head', 'earring', 'amulet', 'armor', 'cloak'];
    const R: Slot[] = ['weapon', 'offhand', 'ring', 'belt', 'boots'];
    const bestRefine = Math.max(0, ...Object.values(h.equipment).map((it) => it?.refine ?? 0));
    const attrs = ATTR_KEYS.map((k) => {
      const gear = h.gearAttrs[k] ? `<em>+${h.gearAttrs[k]}</em>` : '<em></em>';
      return `<div class="cw-attr" data-tip="attr:${k}"><span>${ATTR_LABEL[k]}</span><b>${h.attrs[k]}</b>${gear}
        <button data-c="plus" data-key="${k}" data-n="1" title="+1 ponto"${dis(vm.editable && h.points > 0)}>+</button><button class="p5" data-c="plus" data-key="${k}" data-n="5" title="+5 pontos (ou o que sobrar)"${dis(vm.editable && h.points > 0)}>+5</button></div>`;
    }).join('');
    const derived = h.derived.map(([a, b]) => `<div class="cw-drv"><span>${a}</span><b>${b}</b></div>`).join('');
    // de onde vem cada bônus: por item equipado (base + rolagens + refino)
    const bonus = SLOTS.map((s) => h.equipment[s])
      .filter((it) => !!it)
      .map((it) => {
        const info = RARITY_INFO[it!.rarity];
        const lines = itemLines(it!).join(' · ');
        return `<div class="cw-bonus"><i style="--rc:${info.color}"></i><span>${itemName(it!)}${it!.refine ? ` +${it!.refine}` : ''}</span><small>${lines || '—'}</small></div>`;
      })
      .join('');
    const F = this.bagFilter;
    const bagItems = vm.inventory.filter((it) => F === 'all' || SLOT_GROUP[it.slot] === F);
    const cells = bagItems.map((it) => {
      const info = RARITY_INFO[it.rarity];
      const usable = canUse(h.kind, it);
      return `<button class="cw-cell r-${it.rarity}${usable ? '' : ' nouse'}" data-c="equip" data-id="${it.id}" data-tip="inv:${it.id}" style="--rc:${info.color}"${dis(vm.editable && usable)}>
        <img src="${itemIconUrl(it)}" alt="">${it.refine ? `<em>+${it.refine}</em>` : ''}</button>`;
    });
    const minCells = 36;
    while (cells.length < minCells || cells.length % 6) cells.push('<div class="cw-cell void"></div>');
    const flt = (id: typeof F, label: string) => `<button data-c="filter" data-f="${id}" class="${F === id ? 'on' : ''}">${label}</button>`;
    this.charWin.querySelector('.char-body')!.innerHTML = `
      <div class="cw">
        <section class="cw-panel cw-char">
          <div class="cw-tabs">${tabs}</div>
          <div class="cw-doll">
            <div class="cw-col">${L.map(slotCell).join('')}</div>
            <div class="cw-model ${bestRefine >= 5 ? 'aura' : ''}">
              <div class="cw-name"><b>${NAME[h.kind]}</b><span>Nv. ${h.level} · ${ROLE[h.kind]}</span></div>
              ${this.fullBody[h.kind] ? `<img src="${this.fullBody[h.kind]}" alt="">` : `<img class="flat" src="${PORTRAIT[h.kind] ?? ''}" alt="">`}
              <i class="cw-plat"></i>
            </div>
            <div class="cw-col">${R.map(slotCell).join('')}</div>
          </div>
          <div class="cw-stats">
            <div class="cw-box"><div class="cw-sub">Atributos <span>Pontos: <b>${h.points}</b></span></div>${attrs}
              <div class="cw-hint">${vm.editable ? 'Refazer pontos: Mestre de Armas (cidade).' : 'Distribua pontos entre as fases.'}</div></div>
            <div class="cw-box"><div class="cw-sub">Status</div><div class="cw-drvs">${derived}</div></div>
            <div class="cw-box"><div class="cw-sub">Bônus dos equipamentos <small>cada item soma nos atributos acima</small></div>${bonus || '<div class="cw-dim">Nenhum item equipado.</div>'}</div>

          </div>
        </section>
        <section class="cw-panel cw-bag">
          <div class="cw-sub big">Bolsa <span>${vm.inventory.length} itens</span></div>
          <div class="cw-filter">${flt('all', 'Todos')}${flt('weapon', 'Armas')}${flt('armor', 'Armaduras')}${flt('accessory', 'Acessórios')}</div>
          <div class="cw-grid">${cells.join('')}</div>
          <div class="cw-money"><span><i class="zeni-ico"></i>${vm.zeni.toLocaleString('pt-BR')} Zen</span><span><i class="soul-ico"></i>${vm.souls} almas</span></div>
          <div class="cw-hint">Clique num item da bolsa para equipar · no equipado para guardar. Itens melhores são equipados sozinhos.</div>
        </section>
      </div>`;
  }

  /** Conteúdo da dica de um item (bolsa, equipado ou slot vazio). */
  private tipHtml(key: string): string | undefined {
    const vm = this.charVM;
    if (!vm) return undefined;
    const h = vm.heroes.find((x) => x.kind === this.charKind) ?? vm.heroes[0];
    const [src, id] = key.split(':');
    if (src === 'attr') {
      const k = id as AttrKey;
      const fam = HERO_INFO[h.kind].family;
      const main = (fam === 'mage' ? 'int' : fam === 'archer' ? 'dex' : 'str') === k;
      return `<b class="t-name">${ATTR_LABEL[k]}</b><small class="t-type">Cada ponto dá:</small>
        <ul>${attrHint(k).map((l) => `<li>${l}</li>`).join('')}</ul>${main ? `<div class="t-foot">★ Atributo principal do ${NAME[h.kind]}</div>` : ''}`;
    }
    if (src === 'slot') return `<b class="t-name">${SLOT_LABEL[id as Slot]}</b><small class="t-type">Vazio</small>`;
    const it = src === 'eq' ? h.equipment[id as Slot] : vm.inventory.find((x) => x.id === id);
    if (!it) return undefined;
    const info = RARITY_INFO[it.rarity];
    const kind = itemKind(it);
    const usable = canUse(h.kind, it);
    const lines = itemLines(it).map((l) => `<li>${l}</li>`).join('');
    let foot = '';
    if (src === 'eq') foot = '<div class="t-foot">Clique para guardar na bolsa</div>';
    else if (!usable) foot = `<div class="t-foot bad">${NAME[h.kind]} não usa ${ITEM_KIND_LABEL[kind]?.toLowerCase() ?? 'isto'}</div>`;
    else {
      const cur = h.equipment[it.slot];
      foot = `<div class="t-foot">Clique para equipar${cur ? ` <span>(troca: ${itemName(cur)})</span>` : ''}</div>`;
    }
    return `<b class="t-name" style="color:${info.color}">${itemName(it)}</b>
      <small class="t-type">${ITEM_KIND_LABEL[kind] ?? ''} · ${SLOT_LABEL[it.slot]} · ${info.label}</small>
      <ul>${lines || '<li class="dim">Sem atributos extras</li>'}</ul>${foot}`;
  }
}

/** Ícone "fantasma" do slot vazio (silhueta do tipo mais comum). */
const ghostCache = new Map<string, string>();
function ghostIcon(s: Slot): string {
  let url = ghostCache.get(s);
  if (!url) {
    url = itemArtCanvas(SLOT_KINDS[s][0], 'common', 64).toDataURL();
    ghostCache.set(s, url);
  }
  return url;
}
