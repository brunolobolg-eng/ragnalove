/**
 * Cartas de monstro: progressão permanente entre runs (coleção no save de meta).
 *
 * Run (vitória) → pacote → coleção → equipar nos heróis → próxima run mais forte.
 * Cada carta tem um EFEITO BASE (todas as classes podem usar) e um BÔNUS DE VOCAÇÃO (só a classe indicada).
 * Os efeitos são regras de gatilho (ao acertar, ao abater, ao sofrer dano...) executadas pela simulação
 * (core/sim/cardRules.ts). O tier (Comum → Mítico, a mesma escala dos equipamentos) escala a força dos números.
 * O catálogo (dados) fica em core/progression/cardCatalog/. A referência do Ragnarok Online vem junto de cada carta.
 */
import { HERO_NAME, HERO_ORDER } from '../../config/heroes';
import type { HeroKind } from './skills';
import { CARDS_NORMAIS_A } from './cardCatalog/normaisA';
import { CARDS_NORMAIS_B } from './cardCatalog/normaisB';
import { CARDS_ESPECIAIS } from './cardCatalog/especiais';

export type CardRarity = 'normal' | 'miniboss' | 'mvp';

/** Tier: a mesma escala de raridade dos equipamentos (Comum → Mítico). Define a força dos efeitos. */
export type CardTier = 1 | 2 | 3 | 4 | 5 | 6;
export const CARD_TIER_NAMES: Record<CardTier, string> = { 1: 'Comum', 2: 'Incomum', 3: 'Raro', 4: 'Épico', 5: 'Lendário', 6: 'Mítico' };
/** Quanto o tier multiplica a força dos números da regra (Comum = 1). Balanceamento fica aqui. */
export const TIER_POWER: Record<CardTier, number> = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.5, 5: 1.75, 6: 2 };
/** Faixa de tier de cada raridade de pacote (Normal: Comum a Raro; Mini-Boss: Épico e Lendário; MVP: Mítico). */
const TIER_RANGE: Record<CardRarity, [CardTier, CardTier]> = { normal: [1, 3], miniboss: [4, 5], mvp: [6, 6] };

/** Quando a regra é verificada. `hit`/`crit`: golpe da própria carta; `cast`: habilidade lançada. */
export type CardTrigger = 'start' | 'tick' | 'hit' | 'crit' | 'kill' | 'hurt' | 'lowHp' | 'dodge' | 'cast';

/**
 * Efeito da regra. Durações em segundos (`sec`). Os números `pct`/`amp` são fração (0,1 = 10%).
 * Efeitos sobre o inimigo (lentidão, maldição, congelar, veneno) usam o alvo do gatilho ou o inimigo mais próximo.
 */
export type CardEffect =
  | { kind: 'shield'; pct: number; sec: number } // escudo de pct da vida máxima do herói
  | { kind: 'heal'; pct: number } // cura pct da vida máxima do herói
  | { kind: 'bless'; amp: number; sec: number } // o herói causa +amp de dano
  | { kind: 'fury'; sec: number } // fúria: recargas do Guerreiro e da Arqueira mais curtas
  | { kind: 'cooldown'; sec: number } // reduz todas as recargas do herói em sec
  | { kind: 'slow'; mult: number; sec: number } // alvo: passos mult vezes mais lentos
  | { kind: 'curse'; amp: number; sec: number } // alvo: recebe amp a mais de dano
  | { kind: 'freeze'; sec: number } // alvo congela
  | { kind: 'reflect'; pct: number; sec: number } // o herói devolve pct do dano corpo a corpo que sofre
  | { kind: 'burst'; pct: number } // golpe extra de pct do dano do golpe (só em hit/crit)
  | { kind: 'poison'; pct: number; sec: number } // alvo: pct da vida máxima por pulso de veneno
  | { kind: 'soul'; amount: number }; // almas extras

export interface CardRule {
  /** Nome criativo do efeito (pt-BR). Aparece no herói quando dispara. */
  name: string;
  trigger: CardTrigger;
  /** 0..1. `start` e `tick` sempre disparam (chance 1). */
  chance: number;
  /** Só `tick`: a cada quantos segundos. */
  every?: number;
  /** Recarga interna desta regra, em segundos (evita spam). */
  icd?: number;
  effect: CardEffect;
}

export interface CardDef {
  id: string;
  name: string;
  /** Arquivo em public/sprites/cards (sem extensão). */
  art: string;
  rarity: CardRarity;
  tier: CardTier;
  /** Efeito para TODAS as classes. */
  base: CardRule;
  /** Bônus da vocação: só o herói desta classe recebe a regra (além do efeito base). */
  vocation: { hero: HeroKind; rule: CardRule };
  /** Referência do Ragnarok Online (texto curto em pt-BR). Sem carta equivalente: efeito autoral. */
  ro: string;
}

/** Regra pronta para a simulação: números com o tier aplicado. Durações continuam em segundos. */
export interface CardRuntime {
  /** Chave estável da instância (carta + posição no slot + base/vocação): recarga própria. */
  key: string;
  card: string;
  name: string;
  trigger: CardTrigger;
  chance: number;
  every?: number;
  icd: number;
  effect: CardEffect;
}

export interface CardCollection {
  /** Quantas cópias de cada carta (id → qtd). */
  owned: Record<string, number>;
  /** Cartas equipadas por herói (ids, com repetição; respeita slots e posse). */
  equipped: Partial<Record<HeroKind, string[]>>;
}

export const emptyCollection = (): CardCollection => ({ owned: {}, equipped: {} });

/** Saves antigos: garante o formato da coleção. */
export function migrateCollection(c: unknown): CardCollection {
  const base = emptyCollection();
  if (!c || typeof c !== 'object') return base;
  const o = c as Partial<CardCollection>;
  return { owned: { ...(o.owned ?? {}) }, equipped: { ...(o.equipped ?? {}) } };
}

/** Catálogo completo (112 cartas: 92 Normais, 11 Mini-Boss, 9 MVPs). Dados em core/progression/cardCatalog/. */
export const CARD_CATALOG: CardDef[] = [...CARDS_NORMAIS_A, ...CARDS_NORMAIS_B, ...CARDS_ESPECIAIS];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARD_CATALOG.map((c) => [c.id, c]));
export const NORMALS = CARD_CATALOG.filter((c) => c.rarity === 'normal');
export const MINIBOSSES = CARD_CATALOG.filter((c) => c.rarity === 'miniboss');
export const MVPS = CARD_CATALOG.filter((c) => c.rarity === 'mvp');
export const cardArt = (id: string): string => `sprites/cards/${CARD_BY_ID[id]?.art ?? id}.jpg`;
/**
 * Recorte da arte (fração da imagem original de 192×256). A arte traz pintados a moldura e a faixa do nome;
 * a interface corta isso e desenha a moldura e o nome iguais em todas as cartas. Dado, não número mágico:
 * ajuste aqui se uma arte nova tiver outra margem.
 */
export const CARD_ART_WINDOW = { x: 0.085, y: 0.05, w: 0.83, h: 0.74 } as const;

const RARITY_RANK: Record<CardRarity, number> = { normal: 0, miniboss: 1, mvp: 2 };

/**
 * Ordem de revelação do pacote: Normais primeiro e a MVP por último (o suspense cresce até a raridade).
 * Estável dentro da mesma raridade (mantém a ordem em que saíram).
 */
export const revealOrder = (ids: string[]): string[] =>
  ids
    .map((id, i) => ({ id, i, rank: RARITY_RANK[CARD_BY_ID[id]?.rarity ?? 'normal'] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.id);

/**
 * Vitórias acumuladas para liberar cada slot (o 1º na vitória 1, o 2º na 2...). Os cinco primeiros são fáceis
 * (6 vitórias); depois a conta sobe depressa (o 10º pede 31; o 20º, 156; o 30º, 381). Teto: 30 slots.
 * Vale para a campanha e para o Bastião, que somam (cardSlotsPool). Tudo que é balanceamento fica aqui.
 */
export const CARD_SLOT_WINS: readonly number[] = [
  1, 2, 3, 4, 6, 9, 13, 18, 24, 31, 39, 48, 58, 69, 81, 94, 108, 123, 139, 156, 174, 193, 213, 234, 256, 279, 303, 328, 354, 381,
];

/** Quantos slots um modo libera com `wins` vitórias (ondas vencidas no Bastião, vitórias de jornada na campanha). */
export function cardSlots(wins: number): number {
  let slots = 0;
  while (slots < CARD_SLOT_WINS.length && wins >= CARD_SLOT_WINS[slots]) slots++;
  return slots;
}

/**
 * Slots de carta por herói: cada modo solta os seus (a campanha pelas vitórias da jornada; o Bastião pelas
 * ondas vencidas) e os dois somam, até o máximo de 30. A build de cartas é uma só para os dois modos.
 */
export function cardSlotsPool(runsWon: number, bastionNights = 0): number {
  return Math.min(30, cardSlots(runsWon) + cardSlots(bastionNights));
}

/** Pacote de fim de run (só vitória): 3 Normais + 2 rolagens 90/5/5. */
export function rollPack(rand: () => number = Math.random): string[] {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const out = [pick(NORMALS).id, pick(NORMALS).id, pick(NORMALS).id];
  for (let i = 0; i < 2; i++) {
    const r = rand();
    out.push(r < 0.9 ? pick(NORMALS).id : r < 0.95 ? pick(MINIBOSSES).id : pick(MVPS).id);
  }
  return out;
}

export function addCards(c: CardCollection, ids: string[]): void {
  for (const id of ids) if (CARD_BY_ID[id]) c.owned[id] = (c.owned[id] ?? 0) + 1;
}

/** Cópias livres (fora das builds): total − equipadas em todos os heróis. */
export function freeCopies(c: CardCollection, id: string): number {
  let used = 0;
  for (const list of Object.values(c.equipped)) for (const x of list ?? []) if (x === id) used++;
  return (c.owned[id] ?? 0) - used;
}

export function equipCard(c: CardCollection, hero: HeroKind, id: string, slots: number): string | undefined {
  if (!CARD_BY_ID[id]) return 'Carta inválida.';
  const list = (c.equipped[hero] ??= []);
  if (list.length >= slots) return 'Sem slots livres.';
  if (freeCopies(c, id) <= 0) return 'Sem cópias livres.';
  list.push(id);
  return undefined;
}

export function unequipCard(c: CardCollection, hero: HeroKind, index: number): void {
  c.equipped[hero]?.splice(index, 1);
}

/**
 * Fusão 3 iguais → 1 Normal aleatória (nunca a mesma). Só usa cópias livres.
 * Devolve o id criado (ou o motivo da falha).
 */
export function fuseTriple(c: CardCollection, id: string, rand: () => number = Math.random): { made?: string; err?: string } {
  const d = CARD_BY_ID[id];
  if (!d || d.rarity !== 'normal') return { err: 'Só Normais fundem 3×.' };
  if (freeCopies(c, id) < 3) return { err: 'Precisa de 3 cópias livres.' };
  const pool = NORMALS.filter((x) => x.id !== id);
  const made = pool[Math.floor(rand() * pool.length)].id;
  c.owned[id]! -= 3;
  addCards(c, [made]);
  return { made };
}

/**
 * Fusão 10 Normais quaisquer → 1 Mini-Boss aleatória. Preserva 1 cópia de cada
 * carta quando dá (pega primeiro dos excedentes), e nunca toca em equipadas.
 */
export function fuseBulk(c: CardCollection, rand: () => number = Math.random): { made?: string; err?: string } {
  const avail = NORMALS.filter((x) => freeCopies(c, x.id) > 0).sort((a, b) => freeCopies(c, b.id) - freeCopies(c, a.id));
  const total = avail.reduce((s, x) => s + freeCopies(c, x.id), 0);
  if (total < 10) return { err: `Faltam ${10 - total} Normais livres.` };
  let need = 10;
  // 1ª passada: só excedentes (mantém 1 de cada)
  for (const x of avail) {
    if (need <= 0) break;
    const extra = freeCopies(c, x.id) - 1;
    const take = Math.min(Math.max(0, extra), need);
    c.owned[x.id]! -= take;
    need -= take;
  }
  // 2ª passada: últimas cópias, das menos repetidas (preserva diversidade)
  for (const x of [...avail].reverse()) {
    if (need <= 0) break;
    const take = Math.min(freeCopies(c, x.id), need);
    c.owned[x.id]! -= take;
    need -= take;
  }
  const made = MINIBOSSES[Math.floor(rand() * MINIBOSSES.length)].id;
  addCards(c, [made]);
  return { made };
}

// ---------- Tier e regras ----------

/** Aplica o tier aos números da regra: força (pct, amp, mult, quantidade) e duração (só nos efeitos de controle). */
function scaledEffect(e: CardEffect, f: number): CardEffect {
  const longer = (s: number): number => s * (1 + (f - 1) / 2);
  switch (e.kind) {
    case 'shield':
    case 'heal':
    case 'reflect':
    case 'burst':
    case 'poison':
      return { ...e, pct: e.pct * f };
    case 'bless':
    case 'curse':
      return { ...e, amp: e.amp * f };
    case 'slow':
      return { ...e, mult: 1 + (e.mult - 1) * f };
    case 'soul':
      return { ...e, amount: Math.max(1, Math.round(e.amount * f)) };
    case 'fury':
    case 'cooldown':
    case 'freeze':
      return { ...e, sec: longer(e.sec) };
  }
}

function runtimeOf(card: CardDef, rule: CardRule, key: string): CardRuntime {
  const f = TIER_POWER[card.tier];
  return { key, card: card.name, name: rule.name, trigger: rule.trigger, chance: rule.chance, every: rule.every, icd: rule.icd ?? 0, effect: scaledEffect(rule.effect, f) };
}

/**
 * Regras que o herói recebe das cartas equipadas: o efeito base de cada carta, e o bônus de vocação
 * quando a classe do herói é a da carta. Chave por posição no slot (duas cópias não dividem recarga).
 */
export function cardRuntimeFor(hero: HeroKind, c: CardCollection): CardRuntime[] {
  const out: CardRuntime[] = [];
  (c.equipped[hero] ?? []).forEach((id, i) => {
    const d = CARD_BY_ID[id];
    if (!d) return;
    out.push(runtimeOf(d, d.base, `${id}#${i}b`));
    if (d.vocation.hero === hero) out.push(runtimeOf(d, d.vocation.rule, `${id}#${i}v`));
  });
  return out;
}

/** Aplica a build de cartas no profile (toda nova run; vale para os 6 heróis). */
export function applyCardLoadout(profile: { heroes: Record<string, { cards?: CardRuntime[] }> }, c: CardCollection): void {
  for (const [hero, h] of Object.entries(profile.heroes)) h.cards = cardRuntimeFor(hero as HeroKind, c);
}

// ---------- Texto (pt-BR) ----------

const TRIGGER_TEXT: Record<Exclude<CardTrigger, 'tick'>, string> = {
  start: 'No começo da batalha',
  hit: 'Ao acertar um golpe',
  crit: 'Ao causar um crítico',
  kill: 'Ao abater um inimigo',
  hurt: 'Ao sofrer dano',
  lowHp: 'Ao cair abaixo de 30% de vida (uma vez por batalha)',
  dodge: 'Ao esquivar um golpe',
  cast: 'Ao lançar uma habilidade',
};

const pctTxt = (v: number): string => `${Math.round(v * 100)}%`;
const numTxt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
const secTxt = (s: number): string => `${numTxt(s)} s`;

function efeitoTexto(e: CardEffect): string {
  switch (e.kind) {
    case 'shield':
      return `erguer um escudo de ${pctTxt(e.pct)} da vida máxima por ${secTxt(e.sec)}`;
    case 'heal':
      return `recuperar ${pctTxt(e.pct)} da vida máxima`;
    case 'bless':
      return `causar +${pctTxt(e.amp)} de dano por ${secTxt(e.sec)}`;
    case 'fury':
      return `entrar em fúria por ${secTxt(e.sec)} (recargas mais curtas)`;
    case 'cooldown':
      return `reduzir as recargas em ${secTxt(e.sec)}`;
    case 'slow':
      return `deixar o alvo ${numTxt(e.mult)}× mais lento por ${secTxt(e.sec)}`;
    case 'curse':
      return `fazer o alvo sofrer +${pctTxt(e.amp)} de dano por ${secTxt(e.sec)}`;
    case 'freeze':
      return `congelar o alvo por ${secTxt(e.sec)}`;
    case 'reflect':
      return `devolver ${pctTxt(e.pct)} do dano sofrido por ${secTxt(e.sec)}`;
    case 'burst':
      return `desferir um golpe extra de ${pctTxt(e.pct)} do dano`;
    case 'poison':
      return `envenenar o alvo (${pctTxt(e.pct)} da vida máxima por pulso) por ${secTxt(e.sec)}`;
    case 'soul':
      return `ganhar ${e.amount} alma${e.amount > 1 ? 's' : ''}`;
  }
}

/** Texto de uma regra já com o tier da carta aplicado (o que o jogador vê). */
export function describeCardRule(card: CardDef, rule: CardRule): string {
  const quando = rule.trigger === 'tick' ? `A cada ${secTxt(rule.every ?? 0)}` : TRIGGER_TEXT[rule.trigger];
  const chance = rule.chance < 1 ? `${pctTxt(rule.chance)} de chance de ` : '';
  return `${quando}, ${chance}${efeitoTexto(scaledEffect(rule.effect, TIER_POWER[card.tier]))}.`;
}

/** Linha do bônus de vocação, com o nome da classe. */
export function describeVocation(card: CardDef): string {
  return `Bônus de ${HERO_NAME[card.vocation.hero]}: ${describeCardRule(card, card.vocation.rule)}`;
}

// ---------- Validação do catálogo (usada por scripts/cardCheck.ts) ----------

const TRIGGERS: CardTrigger[] = ['start', 'tick', 'hit', 'crit', 'kill', 'hurt', 'lowHp', 'dodge', 'cast'];

/** Limites de cada efeito, antes do tier (um número acima disto é erro de digitação ou de balanceamento). */
const LIMITES: Record<CardEffect['kind'], Record<string, [number, number]>> = {
  shield: { pct: [0.01, 0.12], sec: [0.5, 6] },
  heal: { pct: [0.01, 0.08] },
  bless: { amp: [0.02, 0.25], sec: [1, 6] },
  fury: { sec: [1, 6] },
  cooldown: { sec: [0.5, 3] },
  slow: { mult: [1.2, 2], sec: [1, 4] },
  curse: { amp: [0.02, 0.3], sec: [1, 6] },
  freeze: { sec: [0.5, 2] },
  reflect: { pct: [0.05, 0.5], sec: [1, 6] },
  burst: { pct: [0.1, 1] },
  poison: { pct: [0.005, 0.04], sec: [1, 8] },
  soul: { amount: [1, 3] },
};

function checarRegra(prefixo: string, rule: CardRule, erros: string[]): void {
  if (!rule.name?.trim()) erros.push(`${prefixo}: regra sem nome`);
  if (!TRIGGERS.includes(rule.trigger)) erros.push(`${prefixo}: gatilho inválido (${rule.trigger})`);
  if (!(rule.chance > 0 && rule.chance <= 1)) erros.push(`${prefixo}: chance fora de (0, 1]`);
  if ((rule.trigger === 'start' || rule.trigger === 'tick') && rule.chance !== 1) erros.push(`${prefixo}: ${rule.trigger} precisa de chance 1`);
  if (rule.trigger === 'tick' && !(rule.every && rule.every > 0)) erros.push(`${prefixo}: tick precisa de every > 0`);
  if (rule.icd !== undefined && rule.icd < 0) erros.push(`${prefixo}: icd negativo`);
  const e = rule.effect;
  if (e.kind === 'burst' && rule.trigger !== 'hit' && rule.trigger !== 'crit') erros.push(`${prefixo}: burst só em hit ou crit`);
  const lim = LIMITES[e.kind];
  if (!lim) {
    erros.push(`${prefixo}: efeito desconhecido (${(e as { kind: string }).kind})`);
    return;
  }
  for (const [campo, [min, max]] of Object.entries(lim)) {
    const v = (e as unknown as Record<string, number>)[campo];
    if (typeof v !== 'number' || Number.isNaN(v)) erros.push(`${prefixo}: ${e.kind}.${campo} ausente`);
    else if (v < min || v > max) erros.push(`${prefixo}: ${e.kind}.${campo} = ${v} fora de [${min}, ${max}]`);
  }
}

/** Lista de problemas do catálogo (vazia = válido). */
export function validarCatalogo(catalogo: CardDef[] = CARD_CATALOG): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  for (const d of catalogo) {
    const p = `carta ${d.id}`;
    if (ids.has(d.id)) erros.push(`${p}: id repetido`);
    ids.add(d.id);
    if (!d.name?.trim()) erros.push(`${p}: sem nome`);
    if (!d.art?.trim()) erros.push(`${p}: sem arte`);
    if (!d.ro?.trim()) erros.push(`${p}: sem referência RO (use o texto de 'sem carta' se não houver)`);
    const [min, max] = TIER_RANGE[d.rarity];
    if (!(d.tier >= min && d.tier <= max)) erros.push(`${p}: tier ${d.tier} fora da faixa da raridade ${d.rarity} (${min}–${max})`);
    if (!HERO_ORDER.includes(d.vocation.hero)) erros.push(`${p}: vocação inválida (${d.vocation.hero})`);
    checarRegra(`${p} base`, d.base, erros);
    checarRegra(`${p} vocação`, d.vocation.rule, erros);
  }
  const contagem = (r: CardRarity): number => catalogo.filter((c) => c.rarity === r).length;
  if (catalogo.length === 112 && (contagem('normal') !== 92 || contagem('miniboss') !== 11 || contagem('mvp') !== 9)) {
    erros.push(`contagem por raridade: ${contagem('normal')}/${contagem('miniboss')}/${contagem('mvp')} (esperado 92/11/9)`);
  }
  return erros;
}
