import { GAME_CONFIG, type WaveOptions } from '../../config/gameConfig';
import { ZONES, type ZoneDef } from '../../config/zones';
import { ACTS, EVENTS, REGION_BY_ID, type EventDef, type EventEffect, type NodeType, type Region } from '../../config/world';
import { REFINE, RARITIES, RARITY_INFO, rollItem, type Item, type Rarity, type Slot } from '../progression/equipment';
import { addExperience, addZeni, createProfile, migrateProfile, resetAttributes, type Profile } from '../progression/profile';
import { SKILL_BY_ID, SKILL_ZENI, heroSkills, investedSkillPoints, lvOf, missingRequirements, skillZeniCost, type HeroKind, type SkillId } from '../progression/skills';
import { Rng } from '../sim/rng';
import { OBJECT_RULES } from '../sim/objects';
import type { WaveReport } from '../sim/types';

/**
 * Estado de uma run (jornada de 3 atos × 5 fases). Toda a progressão dos heróis vive aqui:
 * derrota completa encerra a run e a próxima começa do zero.
 */
export interface RunState {
  version: 1;
  seed: number;
  act: number;
  node: number;
  /** Opção escolhida no nó atual (antes de concluir). */
  choice?: NodeType;
  /** Evento sorteado para o nó atual (se a escolha foi "evento"). */
  eventId?: string;
  profile: Profile;
  /** Heróis caídos que ainda não foram revividos. */
  dead: HeroKind[];
  history: { act: number; node: number; region: string; type: NodeType; outcome: string }[];
  /** Estoque da loja da cidade atual. */
  shop?: Item[];
  ended?: 'defeat' | 'victory';
  kills: number;
  /** Heróis liberados (começa com 1; cada chefe de ato libera mais um). */
  party: HeroKind[];
  /** Vida da cidade (segundo objetivo). Zero = fim da jornada. Não regenera sozinha. */
  cityHp: number;
  cityMaxHp: number;
  /** Noites de combate já lutadas (numera o Relatório da Noite). */
  nights: number;
  /** Últimos relatórios (GAME_CONFIG.waveReport.historySize) para uma tela de estatísticas. */
  reports: WaveReport[];
  /** Objetos do mapa já acionados na fase atual (ids = índice + 1 no MAP_CONFIG). */
  usedObjects: number[];
}

/** Todos os heróis do jogo, na ordem da HUD. */
export const HEROES: HeroKind[] = ['warrior', 'mage', 'archer'];
export const HERO_NAME: Record<HeroKind, string> = { warrior: 'Guerreiro', mage: 'Mago', archer: 'Arqueira' };

export function newRun(starter: HeroKind = 'warrior', seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0): RunState {
  const C = GAME_CONFIG.cityDefense;
  return { version: 1, seed, act: 0, node: 0, profile: createProfile(), dead: [], history: [], kills: 0, party: [starter], cityHp: C.maxHp, cityMaxHp: C.maxHp, nights: 0, reports: [], usedObjects: [] };
}

/** Próximo herói liberado ao vencer o chefe do ato (ou undefined). */
export function nextUnlock(r: RunState): HeroKind | undefined {
  if (r.party.length >= 3) return undefined;
  if (r.party.length === 1) return r.party[0] === 'warrior' ? 'mage' : r.party[0] === 'mage' ? 'warrior' : 'warrior';
  return HEROES.find((h) => !r.party.includes(h));
}

/** Libera um herói novo no nível médio da party (com os pontos desses níveis). */
export function unlockHero(r: RunState, h: HeroKind): void {
  if (r.party.includes(h)) return;
  const lvl = Math.max(...r.party.map((k) => r.profile.heroes[k].level));
  r.party.push(h);
  const hp = r.profile.heroes[h];
  const gained = Math.max(0, lvl - hp.level);
  hp.level = lvl;
  hp.exp = 0;
  hp.points += gained * GAME_CONFIG.progression.pointsPerLevel;
  hp.skillPoints += gained * GAME_CONFIG.progression.skillPointsPerLevel;
}

export function migrateRun(r: RunState): RunState {
  r.party ??= ['warrior', 'mage'];
  migrateProfile(r.profile);
  r.dead ??= [];
  r.history ??= [];
  r.kills ??= 0;
  r.cityMaxHp ??= GAME_CONFIG.cityDefense.maxHp;
  r.cityHp ??= r.cityMaxHp;
  r.nights ??= 0;
  r.reports ??= [];
  r.usedObjects ??= [];
  return r;
}

// ---------------- Vida da cidade ----------------
/** Guarda o relatório da noite (histórico limitado) e aplica o dano na cidade. */
export function recordNight(r: RunState, rep: WaveReport): void {
  r.nights = Math.max(r.nights, rep.night);
  r.cityHp = Math.max(0, Math.min(r.cityMaxHp, rep.cityHpRemaining));
  r.reports.push(rep);
  const n = GAME_CONFIG.waveReport.historySize;
  if (r.reports.length > n) r.reports.splice(0, r.reports.length - n);
}

/** Zeni para reparar `hp` da muralha (preço sobe por ato). */
export function repairCost(r: RunState, hp: number): number {
  return Math.ceil(hp * GAME_CONFIG.cityDefense.repairZeniPerHp * priceMult(r));
}

/** Repara a muralha: `all` conserta tudo o que der com o Zeni atual; senão um passo. */
export function repairCity(r: RunState, all = false): string | undefined {
  const missing = r.cityMaxHp - r.cityHp;
  if (missing <= 0) return 'A muralha já está inteira.';
  let hp = Math.min(missing, GAME_CONFIG.cityDefense.repairStep);
  if (all) {
    hp = missing;
    while (hp > 0 && repairCost(r, hp) > r.profile.zeni) hp--;
  }
  if (hp <= 0 || !spend(r, repairCost(r, hp))) return 'Zeni insuficiente.';
  r.cityHp += hp;
  return `Muralha reparada (+${hp}).`;
}

// ---------------- Objetos do mapa (ação entre as ondas) ----------------
/** Uma opção de pagamento/ação para um objeto do mapa. */
export interface ObjectAction {
  id: 'use' | 'zeni' | 'souls';
  label: string;
  disabled?: boolean;
}

/** O que dá para fazer com o objeto `id` agora (vazio = passivo ou já usado nesta fase). */
export function objectActions(r: RunState, type: keyof typeof OBJECT_RULES, id: number): ObjectAction[] {
  const rule = OBJECT_RULES[type];
  if (!rule.action || r.usedObjects.includes(id)) return [];
  if (type === 'altar') {
    const A = GAME_CONFIG.objects.altar;
    const z = Math.round(A.zeniCost * priceMult(r));
    return [
      { id: 'zeni', label: `${rule.action} (${z} Zeni)`, disabled: r.profile.zeni < z },
      { id: 'souls', label: `${rule.action} (${A.soulCost} almas)`, disabled: r.profile.souls < A.soulCost },
    ];
  }
  return [{ id: 'use', label: rule.action }];
}

/**
 * Aciona um objeto do mapa no planejamento: cobra/recompensa no perfil (camada da run) e marca
 * como usado. A simulação é recriada com `usedObjects` e aplica o efeito de combate.
 */
export function useMapObject(r: RunState, type: keyof typeof OBJECT_RULES, id: number, how: ObjectAction['id']): string | undefined {
  const acts = objectActions(r, type, id);
  const a = acts.find((x) => x.id === how);
  if (!a || a.disabled) return undefined;
  const p = r.profile;
  let msg = '';
  if (type === 'cart') {
    const C = GAME_CONFIG.objects.cart;
    const k = priceMult(r);
    if (uiRng.next() < C.soulChance) {
      const v = Math.round((C.souls[0] + uiRng.int(C.souls[1] - C.souls[0] + 1)) * k);
      p.souls += v;
      msg = `Entre os escombros, almas presas: +${v} almas.`;
    } else {
      const v = Math.round((C.zeni[0] + uiRng.int(C.zeni[1] - C.zeni[0] + 1)) * k);
      addZeni(p, v);
      msg = `Uma bolsa esquecida na carga: +${v} Zeni.`;
    }
  } else if (type === 'altar') {
    const A = GAME_CONFIG.objects.altar;
    if (how === 'zeni' && !spend(r, Math.round(A.zeniCost * priceMult(r)))) return 'Zeni insuficiente.';
    if (how === 'souls') {
      if (p.souls < A.soulCost) return 'Almas insuficientes.';
      p.souls -= A.soulCost;
    }
    msg = `O altar abençoa a party: +${A.regenPerSec} HP/s nesta fase.`;
  } else if (type === 'oilBarrel') msg = 'O óleo escorre pelo chão. Ponha uma Barreira de Fogo em cima para incendiar!';
  else if (type === 'torch') msg = 'A tocha clareia a neblina em volta.';
  else if (type === 'campfire') {
    const F = GAME_CONFIG.objects.campfire;
    msg = `A party descansa: +${F.regenPerSec} HP/s e recargas ${Math.round(F.cooldownCut * 100)}% menores nesta fase.`;
  }
  r.usedObjects.push(id);
  return msg;
}

export const currentAct = (r: RunState) => ACTS[Math.min(r.act, ACTS.length - 1)];
export const currentNode = (r: RunState) => currentAct(r).nodes[Math.min(r.node, currentAct(r).nodes.length - 1)];
export const currentRegion = (r: RunState): Region => REGION_BY_ID[currentNode(r).region];
export const isCombat = (t: NodeType) => t === 'horde' || t === 'elite' || t === 'boss' || t === 'survival';

/** Sobrevivência: pontuação (abates + tempo) → raridades dos prêmios da roleta. */
export function survivalRewards(kills: number, seconds: number): { score: number; rarities: Rarity[] } {
  const score = Math.round(kills + seconds / 2);
  const tiers: [number, Rarity, Rarity][] = [
    [0, 'common', 'uncommon'],
    [25, 'uncommon', 'rare'],
    [50, 'rare', 'epic'],
    [85, 'epic', 'legendary'],
    [130, 'legendary', 'mythic'],
  ];
  const t = [...tiers].reverse().find(([min]) => score >= min)!;
  const n = Math.min(3, 1 + Math.floor(score / 60));
  const rarities = Array.from({ length: n }, (_, i) => (i === 0 ? t[2] : Math.random() < 0.5 ? t[2] : t[1]));
  // o melhor prêmio sai por último (clímax da roleta)
  return { score, rarities: rarities.sort((a, b) => RARITIES.indexOf(a) - RARITIES.indexOf(b)) };
}

export function makeItem(rarity: Rarity, slot?: Slot, users: string[] = []): Item {
  return rollItem(uiRng, 0, itemId(), { rarity, slot }, users);
}
/** Número da fase (1..15). */
export const phaseNumber = (r: RunState) => ACTS.slice(0, r.act).reduce((s, a) => s + a.nodes.length, 0) + r.node + 1;
export const totalPhases = () => ACTS.reduce((s, a) => s + a.nodes.length, 0);

/** Zona + opções de onda do nó escolhido (escala por ato e posição na rota). */
export function battleFor(r: RunState, type: NodeType): { zone: ZoneDef; wave: WaveOptions } {
  const act = currentAct(r);
  const region = currentRegion(r);
  const zone = ZONES[region.zone ?? 'bridge'];
  const step = 1 + 0.1 * r.node;
  // party menor = horda menor e mais fraca; a 1ª fase do jogo é mais fácil
  const size = Math.max(1, r.party.filter((h) => !r.dead.includes(h)).length);
  const sizeCount = [0.6, 0.85, 1][size - 1];
  const sizeHp = [0.8, 0.92, 1][size - 1];
  const first = r.act === 0 && r.node === 0;
  const base = Math.round(zone.wave.count * sizeCount * (first ? 0.75 : 1));
  const wave: WaveOptions = {
    seed: (r.seed + r.act * 101 + r.node * 17) >>> 0,
    hpMult: act.hpMult * step * sizeHp * (first ? 0.8 : 1),
    dmgMult: act.dmgMult * (1 + 0.06 * r.node) * (first ? 0.8 : 1),
    threatMult: GAME_CONFIG.cityDefense.threatActMult[Math.min(r.act, 2)],
  };
  if (type === 'survival') {
    wave.count = 99999;
    wave.boss = null;
    wave.endless = true;
    wave.hpMult = (wave.hpMult ?? 1) * 0.85;
  } else if (type === 'horde') {
    wave.count = base;
    wave.boss = null;
  } else if (type === 'elite') {
    wave.count = Math.round(base * 0.65);
    wave.boss = 'elite';
  } else {
    wave.count = Math.round(base * 0.7);
    wave.boss = act.boss;
  }
  return { zone, wave };
}

/** Avança para o próximo nó (ou ato). Devolve true se começou um ato novo. */
export function advance(r: RunState, outcome: string): boolean {
  const n = currentNode(r);
  r.history.push({ act: r.act, node: r.node, region: n.region, type: r.choice ?? n.options[0], outcome });
  r.choice = undefined;
  r.eventId = undefined;
  r.shop = undefined;
  r.usedObjects = [];
  r.node++;
  if (r.node >= currentAct(r).nodes.length) {
    r.node = 0;
    r.act++;
    if (r.act >= ACTS.length) {
      r.act = ACTS.length - 1;
      r.node = currentAct(r).nodes.length - 1;
      r.ended = 'victory';
    }
    return true;
  }
  return false;
}

export const priceMult = (r: RunState) => GAME_CONFIG.city.actPriceMult[Math.min(r.act, 2)];
const actScale = (r: RunState) => GAME_CONFIG.city.actPriceMult[Math.min(r.act, 2)];

// ---------------- Eventos ----------------
export function pickEvent(r: RunState): EventDef {
  const rng = new Rng((r.seed + r.act * 7919 + r.node * 131) >>> 0);
  const seen = new Set(r.history.map((h) => h.outcome));
  const pool = EVENTS.filter((e) => !seen.has(`evento:${e.id}`));
  const list = pool.length ? pool : EVENTS;
  return list[rng.int(list.length)];
}

let uiRng = new Rng((Date.now() >>> 0) || 1);
const itemId = () => `it-${Date.now().toString(36)}-${uiRng.int(1e9)}`;

/** Aplica os efeitos de uma opção de evento. Devolve o texto do resultado. */
export function applyEventEffects(r: RunState, effects: EventEffect[]): string[] {
  const p = r.profile;
  const out: string[] = [];
  const k = actScale(r);
  for (const e of effects) {
    if ('zeni' in e) {
      const v = Math.round(e.zeni * k);
      addZeni(p, v);
      out.push(`${v >= 0 ? '+' : ''}${v} Zeni`);
    } else if ('souls' in e) {
      const v = Math.round(e.souls * k);
      p.souls = Math.max(0, p.souls + v);
      out.push(`${v >= 0 ? '+' : ''}${v} almas`);
    } else if ('exp' in e) {
      const v = Math.round(e.exp * k);
      for (const h of r.party) if (!r.dead.includes(h)) addExperience(p, h, v);
      out.push(`+${v} EXP para a party`);
    } else if ('item' in e) {
      const it = rollItem(uiRng, 0, itemId(), { rarity: e.item }, r.party);
      p.inventory.push(it);
      out.push(`Item ${RARITY_INFO[e.item].label} no inventário`);
    } else if ('attrPoints' in e) {
      for (const h of r.party) p.heroes[h].points += e.attrPoints;
      out.push(`+${e.attrPoints} ponto de atributo para cada herói`);
    } else if ('skillPoints' in e) {
      for (const h of r.party) p.heroes[h].skillPoints += e.skillPoints;
      out.push(`+${e.skillPoints} ponto de habilidade para cada herói`);
    } else if ('cityHp' in e) {
      const before = r.cityHp;
      r.cityHp = Math.min(r.cityMaxHp, r.cityHp + e.cityHp);
      out.push(`Muralha da cidade +${r.cityHp - before} HP`);
    } else if ('reviveFree' in e) {
      if (r.dead.length) out.push(`${r.dead.map((h) => HERO_NAME[h]).join(' e ')} revivido(s)`);
      r.dead = [];
    } else if ('gamble' in e) {
      const win = uiRng.next() < e.gamble.chance;
      out.push(win ? e.gamble.winText : e.gamble.loseText);
      out.push(...applyEventEffects(r, win ? e.gamble.win : e.gamble.lose));
    }
  }
  return out;
}

// ---------------- Cidade ----------------
export function shopStock(r: RunState): Item[] {
  if (!r.shop) {
    const n = GAME_CONFIG.city.shopStock;
    const pool: Rarity[] = r.act === 0 ? ['common', 'uncommon', 'uncommon', 'rare'] : r.act === 1 ? ['uncommon', 'rare', 'rare', 'epic'] : ['rare', 'rare', 'epic', 'epic'];
    r.shop = Array.from({ length: n }, () => rollItem(uiRng, 0, itemId(), { rarity: pool[uiRng.int(pool.length)] }, r.party));
  }
  return r.shop;
}

export const itemPrice = (r: RunState, it: Item) => Math.round(GAME_CONFIG.city.itemPrice[it.rarity] * priceMult(r));
export const sellPrice = (it: Item) => Math.round(GAME_CONFIG.city.sellPrice[it.rarity] * (1 + 0.3 * (it.refine ?? 0)));
export const rerollPrice = (r: RunState, it: Item) => Math.round(GAME_CONFIG.city.rerollPrice[it.rarity] * priceMult(r));
export const potionPrice = (r: RunState, i: number) => Math.round(GAME_CONFIG.city.potions[i].price * priceMult(r));
export const orePrice = (r: RunState) => Math.round(GAME_CONFIG.city.orePrice * priceMult(r));
export const refineFee = (it: Item) => GAME_CONFIG.city.refineFeePerLevel * ((it.refine ?? 0) + 1);
export const reviveCost = (r: RunState) => Math.floor(r.profile.zeni * GAME_CONFIG.city.reviveFraction);

function spend(r: RunState, z: number): boolean {
  if (r.profile.zeni < z) return false;
  r.profile.zeni -= z;
  return true;
}

export function buyItem(r: RunState, id: string): string | undefined {
  const stock = shopStock(r);
  const i = stock.findIndex((it) => it.id === id);
  if (i < 0) return;
  if (!spend(r, itemPrice(r, stock[i]))) return 'Zeni insuficiente.';
  r.profile.inventory.push(stock[i]);
  stock.splice(i, 1);
  return 'Comprado!';
}

export function sellItem(r: RunState, id: string): string | undefined {
  const inv = r.profile.inventory;
  const i = inv.findIndex((it) => it.id === id);
  if (i < 0) return;
  addZeni(r.profile, sellPrice(inv[i]));
  inv.splice(i, 1);
  return 'Vendido.';
}

export function buyPotion(r: RunState, i: number, hero: HeroKind): number | undefined {
  const pot = GAME_CONFIG.city.potions[i];
  if (!pot || r.dead.includes(hero) || !spend(r, potionPrice(r, i))) return undefined;
  return addExperience(r.profile, hero, pot.exp);
}

/** Minérios originais: Aço Rúnico (armas) e Cristal de Égide (armaduras/acessórios). */
export const ORE_NAME = (slot: Slot) => (slot === 'weapon' ? 'Aço Rúnico' : 'Cristal de Égide');

export interface RefineResult {
  ok: boolean;
  text: string;
}

/** Tenta refinar: gasta 1 minério (comprado na hora) + taxa. Falha a partir de +5 faz o item voltar 1 nível. */
export function refineItem(r: RunState, it: Item): RefineResult {
  const cur = it.refine ?? 0;
  if (cur >= REFINE.max) return { ok: false, text: 'Refino máximo.' };
  const cost = orePrice(r) + refineFee(it);
  if (!spend(r, cost)) return { ok: false, text: 'Zeni insuficiente.' };
  const chance = REFINE.chance[cur + 1];
  if (uiRng.next() < chance) {
    it.refine = cur + 1;
    return { ok: true, text: `Sucesso! Agora +${it.refine}.` };
  }
  const drop = cur >= 5 ? 1 : 0;
  it.refine = Math.max(0, cur - drop);
  return { ok: false, text: drop ? `Falhou... o item voltou para +${it.refine}.` : 'Falhou, mas o item não perdeu nível.' };
}

/** Roleta de atributos: sorteia de novo as rolagens mantendo slot e raridade. */
export function rerollItem(r: RunState, it: Item): string | undefined {
  if (!spend(r, rerollPrice(r, it))) return 'Zeni insuficiente.';
  // mantém tipo e Ataque da arma: só os atributos extras mudam
  const fresh = rollItem(uiRng, 0, it.id, { rarity: it.rarity, slot: it.slot, kind: it.kind });
  it.rolls = fresh.rolls;
  return 'Atributos sorteados de novo.';
}

export function canAwaken(it: Item): boolean {
  return (it.rarity === 'legendary' || it.rarity === 'mythic') && !it.awakened;
}

export function awakenItem(r: RunState, it: Item): string | undefined {
  if (!canAwaken(it)) return;
  const cost = GAME_CONFIG.city.awakenSouls[it.rarity];
  if (r.profile.souls < cost) return 'Almas insuficientes.';
  r.profile.souls -= cost;
  it.awakened = true;
  return 'O item despertou!';
}

export function revive(r: RunState, hero: HeroKind, free = false): boolean {
  if (!r.dead.includes(hero)) return false;
  if (!free && !spend(r, reviveCost(r))) return false;
  r.dead = r.dead.filter((h) => h !== hero);
  return true;
}

// ---------------- Árvore de habilidades ----------------
export function learnSkill(r: RunState, hero: HeroKind, id: SkillId): string | undefined {
  const h = r.profile.heroes[hero];
  const d = SKILL_BY_ID[id];
  const lv = lvOf(h.skills, id);
  if (lv >= d.maxLevel) return 'Nível máximo.';
  if (missingRequirements(h.skills, id).length) return 'Pré-requisito faltando.';
  if (h.skillPoints <= 0) return 'Sem pontos de habilidade.';
  const cost = skillZeniCost(id, lv + 1);
  if (!spend(r, cost)) return 'Zeni insuficiente.';
  h.skillPoints--;
  h.skills[id] = lv + 1;
  return undefined;
}

export const skillRespecCost = (r: RunState) => Math.round(SKILL_ZENI.respecBase * priceMult(r));

export function respecSkills(r: RunState, hero: HeroKind): boolean {
  const h = r.profile.heroes[hero];
  const invested = investedSkillPoints(hero, h.skills);
  if (invested <= 0 || !spend(r, skillRespecCost(r))) return false;
  for (const d of heroSkills(hero)) h.skills[d.id] = d.start;
  h.skillPoints += invested;
  return true;
}

export function resetAttrsFree(r: RunState, hero: HeroKind): void {
  resetAttributes(r.profile, hero);
}

/** Raridades acima de Épico existem (Lendário/Mítico) e só caem de chefes. */
export const BOSS_RARITY: Rarity[] = RARITIES.slice(2);
export function reseedUi(seed: number): void {
  uiRng = new Rng(seed >>> 0 || 1);
}
