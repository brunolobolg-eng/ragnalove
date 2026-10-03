import { GAME_CONFIG } from '../config/gameConfig';
import { CITY_ART } from '../config/visualConfig';
import { HERO_NAME } from '../config/heroes';
import { REFINE, RARITY_INFO, SLOTS, SLOT_GROUP, itemLines, itemName, type Item, type SlotGroup } from '../core/progression/equipment';
import { attrPointCost, buyPointWithZeni, expToNext, heroStats, respecCost, respecWithZeni, spentPoints, absorbSouls, PROGRESSION } from '../core/progression/profile';
import {
  ORE_NAME,
  awakenItem,
  buyItem,
  buyConsumable,
  buyPotion,
  consumablePrice,
  canAwaken,
  itemPrice,
  orePrice,
  potionPrice,
  potionsToLevel,
  refineFee,
  refineItem,
  rerollItem,
  rerollPrice,
  repairCity,
  repairCost,
  respecSkills,
  revive,
  reviveCost,
  sellItem,
  sellPrice,
  shopStock,
  skillRespecCost,
  type RunState,
} from '../core/run/run';
import { investedSkillPoints, type HeroKind } from '../core/progression/skills';
import { itemIconUrl } from './itemArt';
import { slotCount } from '../core/progression/skillSlots';
import { PORTRAITS } from './WorldMap';

/**
 * Cidade (versão simples): 5 barracas grandes; cada uma abre um painel só com cartas,
 * ícones e botões grandes com o preço. Detalhes ficam no "passar o mouse".
 */
export interface CityCallbacks {
  onChange(sound?: 'coin' | 'refineOk' | 'refineFail' | 'levelup' | 'ui'): void;
  onLeave(): void;
  onSkills(hero: HeroKind): void;
  onCharacter(): void;
}

type NpcId = 'merchant' | 'smith' | 'master' | 'oracle' | 'priestess';
const NPCS: { id: NpcId; name: string; tag: string; icon: string; color: string; accent: string }[] = [
  { id: 'merchant', name: 'Tobias', tag: 'Loja', icon: '🛒', color: '#8a5a2a', accent: '#e8c070' },
  { id: 'smith', name: 'Brunhild', tag: 'Forja', icon: '🔨', color: '#5a4a4a', accent: '#ff9a4a' },
  { id: 'master', name: 'Aldric', tag: 'Treino', icon: '⚔', color: '#3a4a6a', accent: '#9ab8ff' },
  { id: 'oracle', name: 'Ysolde', tag: 'Almas', icon: '✦', color: '#3a2a5a', accent: '#6affe0' },
  { id: 'priestess', name: 'Irmã Maela', tag: 'Templo e Muralha', icon: '✚', color: '#6a6a7a', accent: '#fff2c0' },
];
const HERO_PT: Record<HeroKind, string> = HERO_NAME;
/**
 * Arte das poções (SVG pintado: vidro, líquido com brilho, rolha). `shape`: 0 frasco pequeno,
 * 1 frasco redondo, 2 garrafa grande. Mesma arte nas poções de EXP e nas de atributo.
 */
function potionArt(color: string, shape: number, id: string): string {
  const g = `pg-${id}`;
  const body =
    shape === 0
      ? 'M40 34h20v12c10 5 16 14 16 25 0 15-12 23-26 23S24 86 24 71c0-11 6-20 16-25Z'
      : shape === 1
        ? 'M42 28h16v14c14 4 24 16 24 30 0 17-14 26-32 26S18 89 18 72c0-14 10-26 24-30Z'
        : 'M41 22h18v16c9 3 15 9 15 18v32c0 7-5 10-24 10s-24-3-24-10V56c0-9 6-15 15-18Z';
  const liquidTop = shape === 2 ? 52 : 58;
  return `<svg class="pot-art" viewBox="0 0 100 104" aria-hidden="true">
    <defs>
      <radialGradient id="${g}l" cx="40%" cy="45%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".25" stop-color="${color}"/><stop offset="1" stop-color="#05060f"/></radialGradient>
      <radialGradient id="${g}a" cx="50%" cy="60%" r="50%"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
      <clipPath id="${g}c"><path d="${body}"/></clipPath>
    </defs>
    <ellipse cx="50" cy="70" rx="48" ry="34" fill="url(#${g}a)"/>
    <path d="${body}" fill="rgba(190,215,255,.16)"/>
    <g clip-path="url(#${g}c)"><rect x="0" y="${liquidTop}" width="100" height="60" fill="url(#${g}l)"/>
      <ellipse cx="50" cy="${liquidTop}" rx="40" ry="4" fill="#fff" opacity=".35"/>
      <circle cx="40" cy="${liquidTop + 14}" r="2.4" fill="#fff" opacity=".7"/><circle cx="57" cy="${liquidTop + 22}" r="1.6" fill="#fff" opacity=".6"/><circle cx="48" cy="${liquidTop + 6}" r="1.2" fill="#fff" opacity=".7"/></g>
    <path d="${body}" fill="none" stroke="rgba(230,240,255,.75)" stroke-width="2.2"/>
    <path d="M33 ${liquidTop + 4}c-4 6-5 14-3 21" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <rect x="${shape === 1 ? 40 : 38}" y="${shape === 2 ? 12 : 20}" width="${shape === 1 ? 20 : 24}" height="${shape === 2 ? 13 : 11}" rx="3" fill="#8a5a2a" stroke="#3a2210" stroke-width="1.5"/>
    <rect x="${shape === 1 ? 37 : 35}" y="${shape === 2 ? 23 : 29}" width="${shape === 1 ? 26 : 30}" height="5" rx="2.5" fill="#c79d48" stroke="#5a3a10" stroke-width="1.2"/>
  </svg>`;
}

/** Cor do líquido de cada poção de EXP (pequena, média, grande). */
const EXP_POTION_COLOR = ['#ffb43a', '#ffcf3a', '#ff8a1a'];


export class CityScreen {
  readonly el: HTMLElement;
  private run?: RunState;
  private npc?: NpcId;
  private sel?: string; // item escolhido na forja
  private forgeTab: SlotGroup | 'all' = 'all';
  private hero: HeroKind = 'warrior';
  private msg = '';
  private msgKind: 'ok' | 'bad' = 'ok';
  private cityName = '';
  private readonly bg: HTMLCanvasElement;

  constructor(private readonly cb: CityCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'city-screen';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas class="city-bg"></canvas>
      <div class="city-stage" style="--ar:${CITY_ART.width / CITY_ART.height}"><img class="city-art" src="${CITY_ART.file}" alt=""><div class="city-spots"></div></div>
      <div class="city-ui"></div>`;
    document.body.appendChild(this.el);
    this.bg = this.el.querySelector('.city-bg')!;
    this.el.addEventListener('click', (e) => this.onClick(e));
    // Espaço: seguir viagem (fecha o serviço aberto antes, se houver)
    window.addEventListener('keydown', (e) => {
      if (!this.visible || e.code !== 'Space' || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      if (e.repeat) return;
      if (this.npc) {
        this.npc = undefined;
        this.render();
        return;
      }
      this.cb.onLeave();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(run: RunState, cityName: string, biome: string): void {
    this.run = run;
    this.cityName = cityName;
    this.npc = undefined;
    this.sel = undefined;
    this.msg = '';
    this.hero = run.party.find((h) => !run.dead.includes(h)) ?? run.party[0];
    this.el.hidden = false;
    paintCity(this.bg, biome, cityName);
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  refresh(): void {
    if (this.visible) this.render();
  }

  private say(m: string | undefined, ok = true): void {
    this.msg = m ?? '';
    this.msgKind = ok ? 'ok' : 'bad';
  }

  private onClick(e: MouseEvent): void {
    // clique fora da janela do serviço (no véu escuro): fecha
    if ((e.target as HTMLElement).classList.contains('svc-veil')) {
      this.npc = undefined;
      this.cb.onChange('ui');
      this.render();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
    if (!b || b.hasAttribute('disabled') || !this.run) return;
    const r = this.run;
    const c = b.dataset.c!;
    const h = this.hero;
    let sound: Parameters<CityCallbacks['onChange']>[0] = 'ui';
    switch (c) {
      case 'npc':
        this.npc = b.dataset.id as NpcId;
        this.sel = undefined;
        this.msg = '';
        break;
      case 'closeNpc':
        this.npc = undefined;
        break;
      case 'hero':
        this.hero = b.dataset.h as HeroKind;
        break;
      case 'leave':
        this.cb.onLeave();
        return;
      case 'char':
        this.cb.onCharacter();
        return;
      case 'skills':
        this.cb.onSkills(h);
        return;
      case 'potion': {
        const lv = buyPotion(r, Number(b.dataset.i), h);
        if (lv === undefined) this.say('Sem Zeni suficiente', false);
        else {
          this.say(lv ? `${HERO_PT[h]} subiu para o nível ${r.profile.heroes[h].level}!` : `+${GAME_CONFIG.city.potions[Number(b.dataset.i)].exp} EXP`);
          sound = lv ? 'levelup' : 'coin';
        }
        break;
      }
      case 'cons': {
        const cn = GAME_CONFIG.city.consumables.find((x) => x.id === b.dataset.id);
        if (!cn || !buyConsumable(r, cn.id, h)) this.say('Sem Zeni suficiente', false);
        else {
          this.say(`${HERO_PT[h]}: ${cn.hp ? `+${cn.hp} de vida máxima` : `+${cn.mana} de Mana (slots de habilidade)`}!`);
          sound = 'coin';
        }
        break;
      }
      case 'buy': {
        const m = buyItem(r, b.dataset.id!);
        this.say(m === 'Comprado!' ? 'Comprado!' : m, m === 'Comprado!');
        sound = 'coin';
        break;
      }
      case 'sell':
        this.say(sellItem(r, b.dataset.id!) ? 'Vendido!' : '');
        sound = 'coin';
        break;
      case 'ftab':
        this.forgeTab = b.dataset.t as SlotGroup | 'all';
        break;
      case 'pick':
        this.sel = b.dataset.id;
        this.msg = '';
        break;
      case 'refine': {
        const it = this.findItem(this.sel);
        if (!it) break;
        const res = refineItem(r, it);
        this.say(res.text, res.ok);
        sound = res.ok ? 'refineOk' : res.text.includes('insuficiente') ? 'ui' : 'refineFail';
        break;
      }
      case 'reroll': {
        const it = this.findItem(this.sel);
        if (it) {
          const m = rerollItem(r, it);
          this.say(m?.includes('insuficiente') ? 'Sem Zeni suficiente' : 'Atributos novos!', !m?.includes('insuficiente'));
        }
        sound = 'coin';
        break;
      }
      case 'attrBuy':
        this.say(buyPointWithZeni(r.profile, h) ? '+1 ponto — distribua em Personagem (C)' : 'Sem Zeni suficiente', true);
        sound = 'coin';
        break;
      case 'attrRespec':
        this.say(respecWithZeni(r.profile, h) ? 'Pontos devolvidos — redistribua em Personagem (C)' : 'Sem Zeni suficiente');
        sound = 'coin';
        break;
      case 'skillRespec':
        this.say(respecSkills(r, h) ? 'Pontos de habilidade devolvidos' : 'Sem Zeni suficiente');
        sound = 'coin';
        break;
      case 'awaken': {
        const it = this.findItem(b.dataset.id);
        if (it) {
          const m = awakenItem(r, it);
          this.say(m, m === 'O item despertou!');
        }
        sound = 'refineOk';
        break;
      }
      case 'absorb': {
        const lv = absorbSouls(r.profile, h);
        if (lv === undefined) this.say('Almas insuficientes', false);
        else {
          this.say(lv ? `${HERO_PT[h]} subiu para o nível ${r.profile.heroes[h].level}!` : `+${PROGRESSION.soulAbsorb.exp} EXP`);
          sound = lv ? 'levelup' : 'ui';
        }
        break;
      }
      case 'repair':
      case 'repairAll': {
        const m = repairCity(r, c === 'repairAll');
        this.say(m, !!m?.startsWith('Muralha'));
        sound = m?.startsWith('Muralha') ? 'coin' : 'ui';
        break;
      }
      case 'revive':
        this.say(revive(r, b.dataset.h as HeroKind) ? `${HERO_PT[b.dataset.h as HeroKind]} voltou!` : 'Sem Zeni suficiente');
        sound = 'levelup';
        break;
    }
    this.cb.onChange(sound);
    this.render();
  }

  private allItems(): { it: Item; who?: HeroKind }[] {
    const p = this.run!.profile;
    const out: { it: Item; who?: HeroKind }[] = [];
    for (const h of this.run!.party) for (const s of SLOTS) if (p.heroes[h].equipment[s]) out.push({ it: p.heroes[h].equipment[s]!, who: h });
    for (const it of p.inventory) out.push({ it });
    return out;
  }

  private findItem(id?: string): Item | undefined {
    return this.allItems().find((x) => x.it.id === id)?.it;
  }

  private icon(it: Item): string {
    return itemIconUrl(it);
  }

  /** Carta de item: ícone grande, raridade na cor, "+N" do refino e o botão/etiqueta embaixo. */
  private itemCard(it: Item, action: string, o: { who?: HeroKind; on?: boolean } = {}): string {
    const info = RARITY_INFO[it.rarity];
    const tip = [itemName(it), ...itemLines(it)].join('\n');
    return `<div class="icard ${o.on ? 'on' : ''}" style="--rc:${info.color}" title="${tip}">
      ${o.who ? `<img class="who" src="${PORTRAITS[o.who]}" alt="">` : ''}${it.refine ? `<b class="rf">+${it.refine}</b>` : ''}${it.awakened ? '<b class="aw">✦</b>' : ''}
      <img class="ic" src="${this.icon(it)}" alt=""><span>${info.label}</span>${action}</div>`;
  }

  private heroPicker(filterDead = true): string {
    const r = this.run!;
    return `<div class="hero-pick">${r.party
      .filter((h) => !filterDead || !r.dead.includes(h))
      .map((h) => `<button class="hp ${h === this.hero ? 'on' : ''}" data-c="hero" data-h="${h}"><img src="${PORTRAITS[h]}" alt=""><span>${HERO_PT[h]}<small>Nv.${r.profile.heroes[h].level}</small></span></button>`)
      .join('')}</div>`;
  }

  private render(): void {
    const r = this.run!;
    const p = r.profile;
    // serviços: áreas clicáveis sobre as placas da arte da cidade
    const pct = (v: number, of: number) => `${(v / of) * 100}%`;
    this.el.querySelector('.city-spots')!.innerHTML = NPCS.map((n) => {
      const s = CITY_ART.spots[n.id];
      if (!s) return '';
      const st = `left:${pct(s.x - s.w / 2, CITY_ART.width)};top:${pct(s.y - s.h / 2, CITY_ART.height)};width:${pct(s.w, CITY_ART.width)};height:${pct(s.h, CITY_ART.height)};--acc:${n.accent}`;
      return `<button class="city-spot ${this.npc === n.id ? 'on' : ''}" data-c="npc" data-id="${n.id}" style="${st}"><span>${n.name}</span></button>`;
    }).join('');
    const party = r.party
      .map((h) => `<span class="pchip ${r.dead.includes(h) ? 'dead' : ''}"><img src="${PORTRAITS[h]}" alt="">Nv.${p.heroes[h].level}${r.dead.includes(h) ? ' ✝' : ''}</span>`)
      .join('');
    let panel = '';
    if (this.npc) {
      const n = NPCS.find((x) => x.id === this.npc)!;
      panel = `<div class="svc-veil"><section class="win svc svc-${n.id}" style="--acc:${n.accent}">
        <div class="win-title"><i class="au-ico">${n.icon}</i><span>${n.tag} — ${n.name}</span><button class="au-x" data-c="closeNpc" title="Fechar (Espaço)">×</button></div>
        <div class="win-body">${this.service()}<div class="toast ${this.msgKind}">${this.msg}</div></div></section></div>`;
    }
    this.el.querySelector('.city-ui')!.innerHTML = `
      <header class="city-head">
        <h1>${this.cityName}</h1>
        <div class="city-bank"><span><i class="zeni-ico"></i>${p.zeni.toLocaleString('pt-BR')}</span><span><i class="soul-ico"></i>${p.souls}</span><span class="city-hp ${r.cityHp / r.cityMaxHp < 0.4 ? 'low' : ''}" title="Vida da muralha (repare no Templo)">🏰 ${r.cityHp}/${r.cityMaxHp}</span>${party}</div>
        <div class="city-actions"><button data-c="char">Personagem (C)</button></div>
      </header>
      <button class="city-go" data-c="leave"><span>Seguir viagem</span><b>➜</b><kbd>Espaço</kbd></button>
      ${panel}`;
  }

  private service(): string {
    const r = this.run!;
    const p = r.profile;
    const z = p.zeni;
    const dis = (ok: boolean) => (ok ? '' : ' disabled');
    switch (this.npc!) {
      case 'merchant': {
        const hp = p.heroes[this.hero];
        const st = heroStats(p, this.hero);
        const need = expToNext(hp.level);
        const counts = GAME_CONFIG.city.potions.map((_, i) => potionsToLevel(r, i, this.hero));
        const pots = GAME_CONFIG.city.potions
          .map((pt, i) => {
            const c = potionPrice(r, i);
            const n = counts[i];
            return `<div class="pcard exp" style="--pc:${EXP_POTION_COLOR[i]}" title="${pt.name}">
              ${potionArt(EXP_POTION_COLOR[i], i, `x${i}`)}<b class="pname">${pt.name}</b><strong>+${pt.exp} EXP</strong>
              <span class="need ${n === 1 ? 'one' : ''}">${n === 1 ? 'Sobe de nível com <b>1</b> poção' : `Nível ${hp.level + 1} com <b>${n}</b> poções`}</span>
              <button class="price" data-c="potion" data-i="${i}"${dis(z >= c)}><i class="zeni-ico"></i>${c}</button></div>`;
          })
          .join('');
        const cons = GAME_CONFIG.city.consumables
          .map((cn, i) => {
            const c = consumablePrice(r, cn.id);
            const eff = cn.hp ? `+${cn.hp} vida máx. <small>(${st.maxHp} → ${st.maxHp + cn.hp})</small>` : cn.mana ? `+${cn.mana} Mana <small>(${st.mana} → ${st.mana + cn.mana} · slots ${slotCount(this.hero, st.mana)} → ${slotCount(this.hero, st.mana + cn.mana)})</small>` : '';
            const btn = cn.soon
              ? '<span class="soon">Em breve</span>'
              : `<button class="price" data-c="cons" data-id="${cn.id}"${dis(z >= c)}><i class="zeni-ico"></i>${c}</button>`;
            return `<div class="pcard cons ${cn.soon ? 'locked' : ''}" style="--pc:${cn.color}" title="${cn.soon ? 'Em breve, nas próximas atualizações' : cn.name}">
              ${potionArt(cn.color, i % 3, `c${i}`)}<div class="ptext"><b class="pname">${cn.name}</b><p>${cn.text}</p>${eff ? `<span class="eff">${eff}</span>` : ''}</div>${btn}</div>`;
          })
          .join('');
        const stock = shopStock(r);
        const buy = stock.length
          ? stock.map((it) => this.itemCard(it, `<button class="price" data-c="buy" data-id="${it.id}"${dis(z >= itemPrice(r, it))}><i class="zeni-ico"></i>${itemPrice(r, it)}</button>`)).join('')
          : '<div class="empty">Esgotado</div>';
        const sell = p.inventory.length
          ? p.inventory.map((it) => this.itemCard(it, `<button class="price sell" data-c="sell" data-id="${it.id}">+<i class="zeni-ico"></i>${sellPrice(it)}</button>`)).join('')
          : '<div class="empty">Inventário vazio</div>';
        const best = GAME_CONFIG.city.potions
          .map((pt, i) => `<b>${counts[i]}×</b> ${pt.name.replace('Poção de EXP ', '')}`)
          .join(' · ');
        return `<p class="shop-sub">Itens, equipamentos e tudo o que você precisa para sua jornada.</p>
          <section class="au-sec shop-exp">
            <div class="svc-row"><h4>Poções de EXP para</h4>${this.heroPicker()}</div>
            <div class="shop-hero">
              <img src="${PORTRAITS[this.hero]}" alt="">
              <div class="sh-info">
                <div class="sh-name"><b>${HERO_PT[this.hero]}</b><span>Nv. ${hp.level}</span></div>
                <div class="sh-bar"><i style="width:${Math.min(100, (hp.exp / need) * 100)}%"></i><span>${hp.exp} / ${need} EXP</span></div>
                <div class="sh-need">Faltam <b>${need - hp.exp} EXP</b> para o nível ${hp.level + 1}: ${best}</div>
              </div>
              <div class="sh-mp" title="Vida e mana máximas">
                <span class="hp">♥ ${st.maxHp}</span><span class="mp" title="Mana = slots de habilidade">◆ Mana ${st.mana} <small>${slotCount(this.hero, st.mana)} slots</small></span>
              </div>
            </div>
            <div class="pots">${pots}</div>
          </section>
          <section class="au-sec"><h4>Comprar</h4><div class="cons-row">${cons}</div>
            <h4 class="sub">Equipamentos</h4><div class="igrid">${buy}</div></section>
          <section class="au-sec"><h4>Vender</h4><div class="igrid">${sell}</div></section>`;
      }
      case 'smith': {
        const T = this.forgeTab;
        const list = this.allItems().filter(({ it }) => T === 'all' || SLOT_GROUP[it.slot] === T);
        const tab = (t: SlotGroup | 'all', label: string) => `<button class="au-tab ${T === t ? 'on' : ''}" data-c="ftab" data-t="${t}">${label}</button>`;
        const grid = list.length
          ? list.map(({ it, who }) => `<div data-c="pick" data-id="${it.id}">${this.itemCard(it, '', { who, on: this.sel === it.id })}</div>`).join('')
          : '<div class="empty">Nenhum equipamento aqui</div>';
        const it = this.findItem(this.sel);
        let right = '<div class="forge"><h4>Melhorar equipamento</h4><div class="empty big">← Escolha um item</div></div>';
        let desc = '';
        if (it) {
          const cur = it.refine ?? 0;
          const next = Math.min(REFINE.max, cur + 1);
          const chance = REFINE.chance[next];
          const cost = orePrice(r) + refineFee(it);
          const info = RARITY_INFO[it.rarity];
          desc = `<div class="forge-desc" style="--rc:${info.color}"><img class="ic" src="${this.icon(it)}" alt="" width="44" height="44">
            <div><b>${itemName(it).split(' · ')[0]}</b><em>${info.label}</em><ul>${itemLines(it).map((l) => `<li>${l}</li>`).join('')}</ul></div></div>`;
          right = `<div class="forge"><h4>Melhorar equipamento</h4>
            <div class="forge-item" style="--rc:${info.color}"><img src="${this.icon(it)}" alt=""><b>${cur ? `+${cur}` : '+0'}</b></div>
            ${cur >= REFINE.max ? '<div class="empty">Refino máximo</div>' : `<button class="big-act primary" data-c="refine"${dis(z >= cost)} title="Gasta 1 ${ORE_NAME(it.slot)} + taxa. A partir de +5 a falha volta 1 nível.">
              <b>Refinar +${cur} → +${next}</b><span class="chance ${chance < 1 ? 'risk' : ''}">${Math.round(chance * 100)}%</span><span class="tag"><i class="zeni-ico"></i>${cost}</span></button>`}
            <button class="big-act" data-c="reroll"${dis(z >= rerollPrice(r, it))} title="Sorteia os atributos do item de novo">🎲 <b>Roletar atributos</b><span class="tag"><i class="zeni-ico"></i>${rerollPrice(r, it)}</span></button>
            ${next === REFINE.auraFrom && cur < REFINE.auraFrom ? '<div class="hint">+5 acende a aura do herói ✨</div>' : ''}
          </div>`;
        }
        return `<div class="au-tabs">${tab('all', 'Todos')}${tab('weapon', '⚔ Armas')}${tab('armor', '🛡 Armaduras')}${tab('accessory', '💍 Acessórios')}</div>
          <div class="forge-wrap"><div><div class="igrid small">${grid}</div>${desc}</div>${right}</div>`;
      }
      case 'master': {
        const h = this.hero;
        const hp = p.heroes[h];
        const pc = attrPointCost(p, h);
        const rc = respecCost(p);
        const inv = investedSkillPoints(h, hp.skills);
        const src = skillRespecCost(r);
        return `${this.heroPicker(false)}
          <div class="acts">
            <button class="big-act" data-c="attrBuy"${dis(z >= pc)}>➕ <b>1 ponto de atributo</b><span class="tag"><i class="zeni-ico"></i>${pc}</span></button>
            <button class="big-act primary" data-c="skills">📖 <b>Árvore de habilidades</b><span class="tag">${hp.skillPoints} pts</span></button>
            <button class="big-act alt" data-c="attrRespec"${dis(z >= rc && spentPoints(hp, h) > 0)}>↺ <b>Refazer atributos</b><span class="tag"><i class="zeni-ico"></i>${rc}</span></button>
            <button class="big-act alt" data-c="skillRespec"${dis(z >= src && inv > 0)}>↺ <b>Refazer habilidades</b><span class="tag"><i class="zeni-ico"></i>${src}</span></button>
          </div>
          <div class="hint">Pontos livres: <b>${hp.points}</b> de atributo · <b>${hp.skillPoints}</b> de habilidade</div>`;
      }
      case 'oracle': {
        const aw = this.allItems().filter(({ it }) => canAwaken(it));
        const a = PROGRESSION.soulAbsorb;
        const cards = aw.length
          ? aw.map(({ it, who }) => this.itemCard(it, `<button class="price soul" data-c="awaken" data-id="${it.id}"${dis(p.souls >= GAME_CONFIG.city.awakenSouls[it.rarity])}>✦ ${GAME_CONFIG.city.awakenSouls[it.rarity]}<i class="soul-ico"></i></button>`, { who })).join('')
          : '<div class="empty">Traga um item Lendário ou Mítico</div>';
        return `<h4>Despertar item (atributos ×1,5)</h4><div class="igrid">${cards}</div>
          <h4>Almas → EXP</h4>${this.heroPicker()}
          <div class="acts"><button class="big-act" data-c="absorb"${dis(p.souls >= a.souls)}>✦ <b>${a.souls} almas → +${a.exp} EXP</b></button></div>`;
      }
      case 'priestess': {
        // Muralha da cidade: a vida dela não volta sozinha — reparo com Zeni
        const missing = r.cityMaxHp - r.cityHp;
        const step = Math.min(missing, GAME_CONFIG.cityDefense.repairStep);
        const frac = r.cityHp / r.cityMaxHp;
        const wall = `<h4>Muralha da cidade</h4>
          <div class="wall-bar ${frac < 0.4 ? 'low' : frac < 0.7 ? 'mid' : ''}"><i style="width:${frac * 100}%"></i><span>${r.cityHp} / ${r.cityMaxHp}</span></div>
          <div class="acts">
            <button class="big-act" data-c="repair"${dis(missing > 0 && z >= repairCost(r, step))}>🧱 <b>Reparar +${step || GAME_CONFIG.cityDefense.repairStep}</b><span class="tag"><i class="zeni-ico"></i>${repairCost(r, step || GAME_CONFIG.cityDefense.repairStep)}</span></button>
            <button class="big-act alt" data-c="repairAll"${dis(missing > 0 && z >= repairCost(r, 1))}>🏰 <b>Reparar o que der</b><span class="tag"><i class="zeni-ico"></i>até ${repairCost(r, missing)}</span></button>
          </div>`;
        if (!r.dead.length) return `${wall}<h4>Heróis</h4><div class="empty">✔ Todos de pé</div>`;
        const c = reviveCost(r);
        return `${wall}<h4>Reviver</h4><div class="revives">${r.dead
          .map((h) => `<div class="rv"><img src="${PORTRAITS[h]}" alt=""><b>${HERO_PT[h]}</b><button class="big-act primary" data-c="revive" data-h="${h}"${dis(p.zeni > 0)}>✚ Reviver <span class="tag"><i class="zeni-ico"></i>${c}</span></button></div>`)
          .join('')}</div><div class="hint">Custa metade do seu Zeni.</div>`;
      }
    }
  }
}
/** Fundo da cidade: céu, silhuetas de telhados e janelas acesas (original, por bioma). */
function paintCity(c: HTMLCanvasElement, biome: string, name: string): void {
  c.width = 1600;
  c.height = 900;
  const g = c.getContext('2d')!;
  const sky: Record<string, [string, string]> = {
    forest: ['#1a2a3a', '#4a5a3a'],
    desert: ['#3a2a4a', '#d8905a'],
    mountain: ['#1a2238', '#8a9ab8'],
    plains: ['#1c2438', '#6a6a7a'],
    ash: ['#1a0a0a', '#6a2a1a'],
  };
  const [a, b] = sky[biome] ?? sky.plains;
  const gr = g.createLinearGradient(0, 0, 0, 900);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1600, 900);
  let s = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = 'rgba(255,255,240,0.7)';
  for (let i = 0; i < 90; i++) g.fillRect(r() * 1600, r() * 380, 1.5, 1.5);
  for (const [depth, col, base] of [[0.5, 'rgba(20,22,34,0.7)', 560], [1, 'rgba(12,12,20,0.95)', 700]] as [number, string, number][]) {
    let x = -40;
    while (x < 1640) {
      const w = (80 + r() * 120) * depth;
      const h = (90 + r() * 140) * depth;
      g.fillStyle = col;
      g.fillRect(x, base - h, w, 900);
      g.beginPath();
      g.moveTo(x - 8, base - h);
      g.lineTo(x + w / 2, base - h - (40 + r() * 50) * depth);
      g.lineTo(x + w + 8, base - h);
      g.fill();
      if (depth === 1)
        for (let k = 0; k < 3; k++) {
          if (r() < 0.55) continue;
          const wx = x + 12 + r() * (w - 30);
          const wy = base - h + 20 + r() * (h - 40);
          const glow = g.createRadialGradient(wx + 6, wy + 8, 1, wx + 6, wy + 8, 26);
          glow.addColorStop(0, 'rgba(255,190,90,0.55)');
          glow.addColorStop(1, 'rgba(255,190,90,0)');
          g.fillStyle = glow;
          g.fillRect(wx - 20, wy - 18, 52, 52);
          g.fillStyle = '#ffcf7a';
          g.fillRect(wx, wy, 12, 16);
        }
      x += w + 6 + r() * 20;
    }
  }
  const v = g.createLinearGradient(0, 600, 0, 900);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = v;
  g.fillRect(0, 600, 1600, 300);
}
