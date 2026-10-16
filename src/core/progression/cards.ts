/**
 * Cartas de monstro: progressão permanente entre runs (coleção no save de meta).
 *
 * Run (vitória) → pacote → coleção → fundir cópias para subir de nível → equipar nos heróis → próxima run mais forte.
 * Cada carta tem um BÔNUS (passivo ou por gatilho, a força cresce do nível 1 ao 5) e um DESBLOQUEIO
 * (uma regra extra, liberada só no nível máximo). As regras são executadas pela simulação (core/sim/cardRules.ts).
 * O catálogo (dados) fica em core/progression/cardCatalog/. A referência do Ragnarok Online vem junto de cada carta.
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { HERO_ORDER } from '../../config/heroes';
import type { HeroKind } from './skills';
import { CARDS_NORMAIS_A } from './cardCatalog/normaisA';
import { CARDS_NORMAIS_B } from './cardCatalog/normaisB';
import { CARDS_ESPECIAIS } from './cardCatalog/especiais';
import { Rng } from '../sim/rng';

export type CardCategory = 'ofensiva' | 'defensiva' | 'sustentacao' | 'utilidade' | 'mobilidade';
export const CARD_CATEGORIES: readonly CardCategory[] = ['ofensiva', 'defensiva', 'sustentacao', 'utilidade', 'mobilidade'];
export const CARD_CATEGORY_LABEL: Record<CardCategory, string> = {
  ofensiva: 'Ofensiva',
  defensiva: 'Defensiva',
  sustentacao: 'Sustentação',
  utilidade: 'Utilidade',
  mobilidade: 'Mobilidade',
};

// ---------- níveis e fusão ----------

/** Nível máximo de uma carta. No nível máximo o bônus chega ao teto e o desbloqueio é liberado. */
export const CARD_MAX_LEVEL = 5;
/** Piso do multiplicador de modDano: várias cópias de redução não zeram nem invertem o dano (causado ou recebido). */
export const CARD_MOD_DANO_MIN = 0.25;
/** Cópias do MESMO nível (livres) gastas para fazer 1 cópia do nível seguinte: 5 → nível 2; depois 2, 2, 2. */
export const FUSION_COST: Record<number, number> = { 1: 5, 2: 2, 3: 2, 4: 2 };
/** Sufixo do nome por nível (índice = nível − 1): Fabre, Fabre+, Fabre++... */
export const LEVEL_SUFFIX: string[] = ['', '+', '++', '+++', '++++'];
/** Multiplicador padrão do bônus por nível (índice = nível − 1). Uma carta pode trazer a sua escala (`bonus.scale`). */
export const LEVEL_SCALE: number[] = [1, 1.25, 1.5, 1.75, 2];

// ---------- regras ----------

/** Quando a regra é verificada. `start` = começo da batalha (também é o disparo dos bônus passivos). */
export type CardTrigger = 'start' | 'tick' | 'hit' | 'crit' | 'kill' | 'hurt' | 'lowHp' | 'dodge' | 'cast';

/** Atributos e derivados que um bônus `stat` soma ao herói no começo da batalha. Pontos são inteiros; o resto é fração. */
export const CARD_STATS = ['forca', 'vitalidade', 'inteligencia', 'destreza', 'sorte', 'mana', 'esquiva', 'critico', 'danoCritico', 'haste', 'vidaMax'] as const;
export type CardStat = (typeof CARD_STATS)[number];
export const CARD_STAT_LABEL: Record<CardStat, string> = {
  forca: 'Força',
  vitalidade: 'Vitalidade',
  inteligencia: 'Inteligência',
  destreza: 'Destreza',
  sorte: 'Sorte',
  mana: 'Mana',
  esquiva: 'chance de esquiva',
  critico: 'chance de crítico',
  danoCritico: 'dano crítico',
  haste: 'Skill Haste',
  vidaMax: 'vida máxima',
};
const STAT_EH_PONTO = new Set<CardStat>(['forca', 'vitalidade', 'inteligencia', 'destreza', 'sorte', 'mana']);

/**
 * Tipo de dano que um `modDano` pode filtrar (além do grupo de inimigos). Nomes são as fontes de dano da simulação
 * (`DamageSource`). Sem fonte no bônus, vale para qualquer dano.
 */
export type BonusFonte = 'fisico' | 'magico' | 'sombra' | 'vento' | 'distancia';
export const BONUS_FONTES: Record<BonusFonte, { label: string; texto: string; sources: string[] }> = {
  fisico: { label: 'físico (corpo a corpo e flechas)', texto: 'físico', sources: ['melee', 'bash', 'cleave', 'blade', 'spear', 'execute', 'arrow', 'pierce', 'rain'] },
  magico: { label: 'mágico (magias e elementos)', texto: 'mágico', sources: ['bolt', 'spell', 'arcane', 'nova', 'storm', 'shock', 'combust', 'meteor', 'frost', 'enchant', 'burn', 'oil'] },
  sombra: { label: 'sombra (magias de sombra e maldição)', texto: 'de sombra', sources: ['shadow', 'curse'] },
  vento: { label: 'vento', texto: 'de vento', sources: ['wind'] },
  distancia: { label: 'a distância (tudo que não é corpo a corpo)', texto: 'a distância', sources: ['arrow', 'pierce', 'rain', 'bolt', 'spell', 'storm', 'meteor', 'arcane', 'shock', 'nova', 'wave', 'frost', 'burn', 'oil'] },
};

/**
 * Grupos de inimigos para `modDano.alvo`. Cada grupo é uma lista de tipos da simulação (GAME_CONFIG.enemies).
 * Motivo: o tipo do monstro é o mesmo nos três atos (um Comum é rato, goblin ou zumbi), então a FAMÍLIA visual
 * não existe no motor. Os grupos de família (humanoide, animal, demônio, morto-vivo, inseto) são aproximações
 * pelos tipos que só aparecem nela (chefes e minis). Se o motor ganhar família por
 * monstro, estes grupos trocam de kinds sem mudar as cartas.
 */
export const BONUS_TARGETS: Record<string, { label: string; kinds: string[] }> = {
  chefe: { label: 'chefes (de ato e mini-chefes)', kinds: [...GAME_CONFIG.bossKinds] },
  mini: { label: 'mini-chefes', kinds: ['elite', 'goblinImp', 'goblinWarlord', 'dinoBoss', 'goblinLeader'] },
  comum: { label: 'comuns', kinds: ['grunt'] },
  pequeno: { label: 'pequenos (Corredores)', kinds: ['runner'] },
  grande: { label: 'grandes (Pesados e Raydric)', kinds: ['brute', 'raydric'] },
  pedra: { label: 'criaturas de pedra (Raydric)', kinds: ['raydric'] },
  necro: { label: 'necromantes (fantasmas e mortos-vivos)', kinds: ['necro'] },
  humanoide: { label: 'humanoides (chefes e minis goblin/orc)', kinds: ['boss2', 'orcboss', 'goblinImp', 'goblinWarlord', 'goblinLeader'] },
  animal: { label: 'animais (chefe rato e dinossauro)', kinds: ['boss', 'dinoBoss'] },
  demonio: { label: 'demônios (chefe orc)', kinds: ['orcboss'] },
};

/**
 * Efeito da regra. Durações em segundos (`sec`). Números `pct`/`amp`/`valor` são fração (0,1 = 10%).
 * Efeitos sobre o inimigo (lentidão, maldição, congelar, veneno) usam o alvo do gatilho ou o inimigo mais próximo.
 */
export type CardEffect =
  | { kind: 'shield'; pct: number; sec: number } // escudo de pct da vida máxima do herói
  | { kind: 'heal'; pct: number } // cura pct da vida máxima do herói
  | { kind: 'bless'; amp: number; sec: number } // o herói causa +amp de dano
  | { kind: 'fury'; sec: number } // fúria: recargas do herói mais curtas
  | { kind: 'cooldown'; sec: number } // reduz as recargas do herói em sec
  | { kind: 'slow'; mult: number; sec: number } // alvo: passos mult vezes mais lentos
  | { kind: 'curse'; amp: number; sec: number } // alvo: recebe amp a mais de dano
  | { kind: 'freeze'; sec: number } // alvo congela
  | { kind: 'reflect'; pct: number; sec: number } // o herói devolve pct do dano que sofre
  | { kind: 'burst'; pct: number } // golpe extra de pct do dano do golpe (só em hit/crit)
  | { kind: 'poison'; pct: number; sec: number } // alvo: pct da vida máxima por pulso de veneno
  | { kind: 'soul'; amount: number } // almas extras
  | { kind: 'stat'; stat: CardStat; value: number } // soma ao atributo/derivado do herói (começo da batalha)
  | { kind: 'modDano'; sentido: 'causa' | 'recebe'; alvo?: string; fonte?: BonusFonte; valor: number; resto?: number } // ver comentário abaixo
  | { kind: 'respingo'; pct: number; raio: number }; // pct do dano do golpe nos outros inimigos a raio tiles do alvo (só hit/crit)

/*
 * modDano: `valor` é a fração aplicada ao dano que o herói causa (causa) ou recebe (recebe) do grupo `alvo` e da
 * fonte `fonte`. Se o dano NÃO casa com (alvo E fonte), vale `resto` (fração, fixa: não escala com o nível).
 * Sem `alvo`, vale para qualquer inimigo; sem `fonte`, para qualquer tipo de dano.
 * Passivo: a regra é `start` e chance 1; o motor aplica no começo da batalha e mantém até o fim.
 */

/** Regra de gatilho. `chance` 0–1; `icd` = recarga interna; `every` (s) só em `tick`. */
export interface CardRule {
  /** Nome criativo do efeito (pt-BR). Aparece no herói quando dispara. */
  name: string;
  trigger: CardTrigger;
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
  category: CardCategory;
  /** 'Onde vai' da tabela do dono (arma, elmo, escudo...; '?' quando a tabela não diz). */
  origin: string;
  /** Bônus do nível 1 (cresce com o nível pela escala). `scale` substitui LEVEL_SCALE quando a carta pede. */
  bonus: { name: string; desc: string; rule: CardRule; scale?: number[] };
  /** Desbloqueio: só no nível máximo. Os números são os finais (não passam pela escala). */
  unlock: { name: string; desc: string; rule: CardRule };
  /** Referência do Ragnarok Online (texto curto em pt-BR). Sem carta equivalente: efeito autoral. */
  ro: string;
}

/** Regra pronta para a simulação: efeito já escalado pelo nível da carta. Durações continuam em segundos. */
export interface CardRuntime {
  /** Chave estável da instância (carta + posição no slot + bônus/desbloqueio): recarga própria. */
  key: string;
  card: string;
  name: string;
  trigger: CardTrigger;
  chance: number;
  every?: number;
  icd: number;
  effect: CardEffect;
}

// ---------- coleção ----------

/** Uma cópia equipada: id da carta e nível em que está. */
export interface CardEquip {
  id: string;
  level: number;
}

export interface CardCollection {
  /** owned[id][L−1] = cópias livres e equipadas no nível L (sempre 5 posições). */
  owned: Record<string, number[]>;
  /** Cartas equipadas por herói (com nível; respeita slots e posse). */
  equipped: Partial<Record<HeroKind, CardEquip[]>>;
}

export const emptyCollection = (): CardCollection => ({ owned: {}, equipped: {} });

/** Catálogo (dados em core/progression/cardCatalog/). */
export const CARD_CATALOG: CardDef[] = [...CARDS_NORMAIS_A, ...CARDS_NORMAIS_B, ...CARDS_ESPECIAIS];
export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARD_CATALOG.map((c) => [c.id, c]));

/**
 * Ids de versões antigas (a 2ª arte de uma carta com o mesmo nome). Saves que os têm são migrados para a carta base.
 * Não existem mais no catálogo: uma carta por nome.
 */
export const CARD_ID_ALIAS: Record<string, string> = {
  angeling_2: 'angeling',
  deviling_2: 'deviling',
  ghostring_2: 'ghostring',
  mandragora_2: 'mandragora',
  miming_2: 'miming',
  poison_spore_2: 'poison_spore',
  spore_2: 'spore',
  bloody_knight_2: 'bloody_knight',
  garm_2: 'garm',
  orc_hero_2: 'orc_hero',
};

export const cardArt = (id: string): string => `sprites/cards/${CARD_BY_ID[id]?.art ?? id}.jpg`;
/**
 * Recorte da arte (fração da imagem original de 192×256). A arte traz pintados a moldura e a faixa do nome;
 * a interface corta isso e desenha a moldura e o nome iguais em todas as cartas. Dado, não número mágico:
 * ajuste aqui se uma arte nova tiver outra margem.
 */
export const CARD_ART_WINDOW = { x: 0.085, y: 0.05, w: 0.83, h: 0.74 } as const;

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

// ---------- posse, fusão e equipar ----------

const clampLevel = (n: number): number => Math.min(CARD_MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));

/** Id atual de uma carta (aceita ids antigos de save). Undefined se não existe. */
export function resolveCardId(raw: string): string | undefined {
  if (CARD_BY_ID[raw]) return raw;
  const base = CARD_ID_ALIAS[raw];
  return base && CARD_BY_ID[base] ? base : undefined;
}

const ownedOf = (c: CardCollection, id: string): number[] => (c.owned[id] ??= [0, 0, 0, 0, 0]);

/** Cópias da carta no nível (livres e equipadas). */
export function copiesAt(c: CardCollection, id: string, level: number): number {
  return c.owned[id]?.[clampLevel(level) - 1] ?? 0;
}

/** Cópias equipadas nesse nível, em todos os heróis. */
export function equippedAt(c: CardCollection, id: string, level: number): number {
  let used = 0;
  for (const list of Object.values(c.equipped)) for (const e of list ?? []) if (e.id === id && e.level === level) used++;
  return used;
}

/** Cópias livres no nível: total − equipadas nesse mesmo nível. Só estas podem fundir ou equipar. */
export function freeCopiesAt(c: CardCollection, id: string, level: number): number {
  return copiesAt(c, id, level) - equippedAt(c, id, level);
}

/** Cartas novas entram no nível 1. */
export function addCards(c: CardCollection, ids: string[]): void {
  for (const id of ids) if (CARD_BY_ID[id]) ownedOf(c, id)[0]++;
}

/**
 * Funde FUSION_COST[fromLevel] cópias livres do nível `fromLevel` em 1 cópia do nível seguinte.
 * Não toca em cópias equipadas. Nível máximo não funde.
 */
export function fuseCard(c: CardCollection, id: string, fromLevel: number): { ok: true; level: number } | { ok: false; err: string } {
  if (!CARD_BY_ID[id]) return { ok: false, err: 'Carta inválida.' };
  if (!Number.isInteger(fromLevel) || fromLevel < 1 || fromLevel >= CARD_MAX_LEVEL) return { ok: false, err: 'Nível máximo: não funde mais.' };
  const custo = FUSION_COST[fromLevel];
  const livres = freeCopiesAt(c, id, fromLevel);
  if (livres < custo) return { ok: false, err: `Precisa de ${custo} cópias livres no nível ${fromLevel} (tem ${livres}).` };
  const arr = ownedOf(c, id);
  arr[fromLevel - 1] -= custo;
  arr[fromLevel] += 1;
  return { ok: true, level: fromLevel + 1 };
}

/** Equipa uma cópia livre do nível `level` no herói. Devolve o motivo da recusa, ou undefined se deu certo. */
export function equipCard(c: CardCollection, hero: HeroKind, id: string, level: number, slots: number): string | undefined {
  if (!CARD_BY_ID[id]) return 'Carta inválida.';
  if (!Number.isInteger(level) || level < 1 || level > CARD_MAX_LEVEL) return 'Nível inválido.';
  const list = (c.equipped[hero] ??= []);
  if (list.length >= slots) return 'Sem slots livres.';
  if (freeCopiesAt(c, id, level) <= 0) return `Sem cópias livres no nível ${level}.`;
  list.push({ id, level });
  return undefined;
}

export function unequipCard(c: CardCollection, hero: HeroKind, index: number): void {
  const list = c.equipped[hero];
  if (!list || !Number.isInteger(index) || index < 0 || index >= list.length) return;
  list.splice(index, 1);
}

/**
 * Pacote (5 cartas sorteadas igualmente do catálogo). O sorteio vem de fora (`rand`): quem chama passa um gerador
 * com semente. Campanha: `rollRunPack`. Bastião: `grantWavePacks` (semente da cidade).
 */
export function rollPack(rand: () => number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const k = Math.min(CARD_CATALOG.length - 1, Math.floor(rand() * CARD_CATALOG.length));
    out.push(CARD_CATALOG[k].id);
  }
  return out;
}

/** Desloca a semente da jornada antes do sorteio do pacote: não repete a sequência que a batalha e os eventos usam. */
const PACOTE_SALT = 0x9e3779b9;

/**
 * Pacote de fim de run (só vitória), sorteado pela semente da jornada (`run.seed`, salva no save). A mesma jornada
 * vencida dá o mesmo pacote, e recarregar a página não sorteia de novo. Não usa Math.random.
 */
export function rollRunPack(seed: number): string[] {
  const rng = new Rng((seed ^ PACOTE_SALT) >>> 0);
  return rollPack(() => rng.next());
}

/** Ordem de revelação do pacote. Sem raridade, a ordem é a que saiu (função mantida para a interface). */
export const revealOrder = (ids: string[]): string[] => [...ids];

// ---------- escala e regras ----------

/** Escala do bônus no nível `level` (ver `bonus.scale`). */
export function levelScale(d: CardDef, level: number): number {
  return (d.bonus.scale ?? LEVEL_SCALE)[clampLevel(level) - 1];
}

/**
 * Aplica a escala aos números do efeito. Pontos de atributo são arredondados (não existe meio ponto de Força).
 * Durações de controle (congelar, recarga, fúria) crescem pela metade da escala. `resto` e `raio` não escalam.
 */
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
    case 'stat':
      return { ...e, value: STAT_EH_PONTO.has(e.stat) ? Math.round(e.value * f) : e.value * f };
    case 'modDano':
      return { ...e, valor: e.valor * f };
    case 'respingo':
      return { ...e, pct: e.pct * f };
  }
}

function runtimeOf(card: CardDef, rule: CardRule, key: string, effect: CardEffect): CardRuntime {
  return { key, card: card.name, name: rule.name, trigger: rule.trigger, chance: rule.chance, every: rule.every, icd: rule.icd ?? 0, effect };
}

/**
 * Regras que o herói recebe das cartas equipadas: o bônus de cada carta (escalado pelo nível) e, só no nível
 * máximo, o desbloqueio (números finais). Chave por posição no slot (duas cópias não dividem recarga).
 */
export function cardRuntimeFor(hero: HeroKind, c: CardCollection): CardRuntime[] {
  const out: CardRuntime[] = [];
  (c.equipped[hero] ?? []).forEach((eq, i) => {
    const d = CARD_BY_ID[eq.id];
    if (!d) return;
    const level = clampLevel(eq.level);
    out.push(runtimeOf(d, d.bonus.rule, `${d.id}#${i}b`, scaledEffect(d.bonus.rule.effect, levelScale(d, level))));
    if (level >= CARD_MAX_LEVEL) out.push(runtimeOf(d, d.unlock.rule, `${d.id}#${i}u`, d.unlock.rule.effect));
  });
  return out;
}

/** Aplica a build de cartas no profile (toda nova run; vale para os 6 heróis). */
export function applyCardLoadout(profile: { heroes: Record<string, { cards?: CardRuntime[] }> }, c: CardCollection): void {
  for (const [hero, h] of Object.entries(profile.heroes)) h.cards = cardRuntimeFor(hero as HeroKind, c);
}

// ---------- save ----------

/**
 * Saves antigos (e de versões anteriores da coleção): owned numérico n → n cópias no nível 1; equipped como texto
 * → nível 1; ids antigos (aliases) viram a carta base. Nunca lança erro: lixo vira coleção vazia no que não se
 * entende. Equipadas além das cópias livres do nível são descartadas.
 */
export function migrateCollection(raw: unknown): CardCollection {
  const out = emptyCollection();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as { owned?: unknown; equipped?: unknown };
  if (o.owned && typeof o.owned === 'object' && !Array.isArray(o.owned)) {
    for (const [rawId, v] of Object.entries(o.owned as Record<string, unknown>)) {
      const id = resolveCardId(rawId);
      if (!id) continue;
      const arr = ownedOf(out, id);
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) arr[0] += Math.floor(v);
      else if (Array.isArray(v)) {
        for (let i = 0; i < CARD_MAX_LEVEL; i++) {
          const n = v[i];
          if (typeof n === 'number' && Number.isFinite(n) && n > 0) arr[i] += Math.floor(n);
        }
      }
    }
  }
  if (o.equipped && typeof o.equipped === 'object' && !Array.isArray(o.equipped)) {
    for (const [hero, list] of Object.entries(o.equipped as Record<string, unknown>)) {
      if (!HERO_ORDER.includes(hero as HeroKind) || !Array.isArray(list)) continue;
      for (const e of list) {
        let id: string | undefined;
        let level = 1;
        if (typeof e === 'string') id = resolveCardId(e);
        else if (e && typeof e === 'object') {
          const x = e as { id?: unknown; level?: unknown };
          if (typeof x.id === 'string') id = resolveCardId(x.id);
          level = clampLevel(Number(x.level));
        }
        if (!id) continue;
        (out.equipped[hero as HeroKind] ??= []).push({ id, level });
      }
    }
  }
  // posse: cada equipada precisa de uma cópia no seu nível (sobra ou falta é corrigida aqui)
  const usado: Record<string, number> = {};
  for (const hero of HERO_ORDER) {
    const list = out.equipped[hero];
    if (!list) continue;
    out.equipped[hero] = list.filter((e) => {
      const chave = `${e.id}@${e.level}`;
      const ok = (usado[chave] ?? 0) < copiesAt(out, e.id, e.level);
      if (ok) usado[chave] = (usado[chave] ?? 0) + 1;
      return ok;
    });
  }
  return out;
}

// ---------- texto (pt-BR) ----------

const TRIGGER_TEXT: Record<Exclude<CardTrigger, 'tick'>, string> = {
  start: 'No começo da batalha',
  hit: 'Ao acertar',
  crit: 'Ao causar um crítico',
  kill: 'Ao abater um inimigo',
  hurt: 'Ao sofrer dano',
  lowHp: 'Ao cair abaixo de 30% de vida (uma vez por batalha)',
  dodge: 'Ao esquivar',
  cast: 'Ao lançar uma habilidade',
};

const pctTxt = (v: number): string => `${numTxt(Math.round(v * 1000) / 10)}%`;
const numTxt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '').replace('.', ','));
const secTxt = (s: number): string => `${numTxt(Math.round(s * 10) / 10)} s`;

function statTxt(e: Extract<CardEffect, { kind: 'stat' }>): string {
  const sinal = e.value >= 0 ? '+' : '';
  const valor = STAT_EH_PONTO.has(e.stat) ? `${sinal}${e.value}` : `${sinal}${pctTxt(e.value)}`;
  return `${valor} de ${CARD_STAT_LABEL[e.stat]}`;
}

function modDanoTxt(e: Extract<CardEffect, { kind: 'modDano' }>): string {
  const alvo = e.alvo ? BONUS_TARGETS[e.alvo].label : 'todos os inimigos';
  const fonte = e.fonte ? ` ${BONUS_FONTES[e.fonte].texto}` : '';
  const principal =
    e.sentido === 'causa'
      ? `Causa ${e.valor >= 0 ? '+' : '−'}${pctTxt(Math.abs(e.valor))} de dano${fonte} contra ${alvo}`
      : e.valor < 0
        ? `Recebe ${pctTxt(-e.valor)} menos de dano${fonte} de ${alvo}`
        : `Recebe ${pctTxt(e.valor)} mais de dano${fonte} de ${alvo}`;
  if (e.resto === undefined) return principal;
  return `${principal} e ${pctTxt(Math.abs(e.resto))} ${e.resto > 0 ? 'mais' : 'menos'} dos demais inimigos`;
}

/** Quem sofre o efeito, pelo gatilho: quem bateu (hurt/dodge), o inimigo mais próximo (start/tick), ou o alvo do golpe. */
function alvoDoGatilho(trigger: CardTrigger): string {
  if (trigger === 'hurt' || trigger === 'dodge') return 'o atacante';
  if (trigger === 'start' || trigger === 'tick') return 'o inimigo mais próximo';
  return 'o alvo';
}

function efeitoTexto(e: CardEffect, quem: string = 'o alvo'): string {
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
      return `deixar ${quem} ${numTxt(e.mult)}× mais lento por ${secTxt(e.sec)}`;
    case 'curse':
      return `fazer ${quem} sofrer +${pctTxt(e.amp)} de dano por ${secTxt(e.sec)}`;
    case 'freeze':
      return `congelar ${quem} por ${secTxt(e.sec)}`;
    case 'reflect':
      return `devolver ${pctTxt(e.pct)} do dano sofrido por ${secTxt(e.sec)}`;
    case 'burst':
      return `desferir um golpe extra de ${pctTxt(e.pct)} do dano`;
    case 'poison':
      return `envenenar ${quem} (${pctTxt(e.pct)} da vida máxima por pulso) por ${secTxt(e.sec)}`;
    case 'soul':
      return `ganhar ${e.amount} alma${e.amount > 1 ? 's' : ''}`;
    case 'stat':
      return statTxt(e);
    case 'modDano':
      return modDanoTxt(e);
    case 'respingo':
      return `causar um respingo de ${pctTxt(e.pct)} do dano nos inimigos a ${e.raio} tile${e.raio > 1 ? 's' : ''} do alvo`;
  }
}

const PASSIVO = (e: CardEffect): boolean => e.kind === 'stat' || e.kind === 'modDano';

/** Texto de uma regra já com a escala aplicada (o que o jogador vê). */
function regraTexto(rule: CardRule, e: CardEffect): string {
  if (PASSIVO(e)) return `${efeitoTexto(e)}.`;
  const quando = rule.trigger === 'tick' ? `A cada ${secTxt(rule.every ?? 0)}` : TRIGGER_TEXT[rule.trigger];
  const chance = rule.chance < 1 ? `${pctTxt(rule.chance)} de chance de ` : '';
  return `${quando}, ${chance}${efeitoTexto(e, alvoDoGatilho(rule.trigger))}.`;
}

/** Texto do bônus no nível dado (números já escalados). */
export function describeBonus(d: CardDef, level: number): string {
  return regraTexto(d.bonus.rule, scaledEffect(d.bonus.rule.effect, levelScale(d, level)));
}

/** Texto do desbloqueio (nível máximo; números finais). */
export function describeUnlock(d: CardDef): string {
  return regraTexto(d.unlock.rule, d.unlock.rule.effect);
}

/** Nome em título com o sufixo do nível: 'FABRE' no nível 2 → 'Fabre+'. */
export function cardLevelLabel(d: CardDef, level: number): string {
  const nome = d.name.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p: string, ch: string) => p + ch.toUpperCase());
  return nome + LEVEL_SUFFIX[clampLevel(level) - 1];
}

// ---------- validação do catálogo (usada por scripts/cardCheck.ts) ----------

const TRIGGERS: CardTrigger[] = ['start', 'tick', 'hit', 'crit', 'kill', 'hurt', 'lowHp', 'dodge', 'cast'];

/**
 * Limites de cada efeito. Valem para TODOS os níveis do bônus (já escalado) e para o desbloqueio (sem escala).
 * Um número fora daqui é erro de digitação ou de balanceamento.
 */
const LIMITES: Partial<Record<CardEffect['kind'], Record<string, [number, number]>>> = {
  shield: { pct: [0.01, 0.12], sec: [0.5, 8] },
  heal: { pct: [0.01, 0.4] },
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
  respingo: { pct: [0.05, 1], raio: [1, 3] },
  modDano: { valor: [0.02, 0.6], resto: [0.02, 0.6] },
  stat: { value: [0, 1] },
};

/** Limites por atributo (pontos inteiros ou fração). */
const STAT_LIMITES: Record<CardStat, [number, number]> = {
  forca: [1, 6],
  vitalidade: [1, 6],
  inteligencia: [1, 6],
  destreza: [1, 6],
  sorte: [1, 6],
  mana: [1, 6],
  esquiva: [0.01, 0.2],
  critico: [0.01, 0.2],
  danoCritico: [0.05, 0.4],
  haste: [0.01, 0.2],
  vidaMax: [0.02, 0.35],
};

function checarRegra(prefixo: string, rule: CardRule, fatores: number[], erros: string[]): void {
  if (!rule.name?.trim()) erros.push(`${prefixo}: regra sem nome`);
  if (!TRIGGERS.includes(rule.trigger)) erros.push(`${prefixo}: gatilho inválido (${rule.trigger})`);
  if (!(rule.chance > 0 && rule.chance <= 1)) erros.push(`${prefixo}: chance fora de (0, 1]`);
  if ((rule.trigger === 'start' || rule.trigger === 'tick') && rule.chance !== 1) erros.push(`${prefixo}: ${rule.trigger} precisa de chance 1`);
  if (rule.trigger === 'tick' && !(rule.every && rule.every > 0)) erros.push(`${prefixo}: tick precisa de every > 0`);
  if (rule.trigger !== 'tick' && rule.every !== undefined) erros.push(`${prefixo}: every só vale em tick`);
  if (rule.icd !== undefined && rule.icd < 0) erros.push(`${prefixo}: icd negativo`);
  const e = rule.effect;
  if (!e || typeof e !== 'object' || !('kind' in e)) {
    erros.push(`${prefixo}: efeito ausente`);
    return;
  }
  if (PASSIVO(e) && rule.trigger !== 'start') erros.push(`${prefixo}: ${e.kind} é passivo e precisa de gatilho start`);
  if (e.kind === 'burst' && rule.trigger !== 'hit' && rule.trigger !== 'crit') erros.push(`${prefixo}: burst só em hit ou crit`);
  if (e.kind === 'respingo' && rule.trigger !== 'hit' && rule.trigger !== 'crit') erros.push(`${prefixo}: respingo só em hit ou crit`);
  if (e.kind === 'stat' && !(CARD_STATS as readonly string[]).includes(e.stat)) erros.push(`${prefixo}: atributo inválido (${e.stat})`);
  if (e.kind === 'modDano') {
    if (e.sentido !== 'causa' && e.sentido !== 'recebe') erros.push(`${prefixo}: sentido inválido`);
    if (e.alvo !== undefined && !BONUS_TARGETS[e.alvo]) erros.push(`${prefixo}: grupo de alvo inválido (${e.alvo})`);
    if (e.fonte !== undefined && !BONUS_FONTES[e.fonte]) erros.push(`${prefixo}: fonte inválida (${e.fonte})`);
    const sinalOk = e.sentido === 'causa' ? e.valor > 0 : e.valor < 0;
    if (!sinalOk) erros.push(`${prefixo}: valor com sinal errado para ${e.sentido}`);
    if (e.resto !== undefined) {
      if (e.alvo === undefined && e.fonte === undefined) erros.push(`${prefixo}: resto sem alvo nem fonte não faz sentido`);
      if (!(e.resto !== 0 && Math.sign(e.resto) === -Math.sign(e.valor))) erros.push(`${prefixo}: resto deve ter sinal oposto ao valor`);
    }
  }
  if (e.kind === 'respingo' && !(e.raio >= 1 && Number.isInteger(e.raio))) erros.push(`${prefixo}: raio inteiro ≥ 1`);
  const lim = LIMITES[e.kind];
  if (!lim) {
    erros.push(`${prefixo}: efeito desconhecido (${(e as { kind: string }).kind})`);
    return;
  }
  for (const f of fatores) {
    const scaled = scaledEffect(e, f) as unknown as Record<string, unknown>;
    const nivel = fatores.length > 1 ? ` (escala ×${f})` : '';
    const checa = (campo: string, [min, max]: [number, number], valor: number, abs = false): void => {
      const v = abs ? Math.abs(valor) : valor;
      if (typeof valor !== 'number' || Number.isNaN(valor)) erros.push(`${prefixo}: ${e.kind}.${campo} ausente${nivel}`);
      else if (v < min || v > max) erros.push(`${prefixo}: ${e.kind}.${campo} = ${valor}${nivel} fora de [${min}, ${max}]`);
    };
    for (const [campo, faixa] of Object.entries(lim)) {
      if (e.kind === 'stat') continue;
      if (e.kind === 'modDano' && campo === 'resto') {
        if (e.resto !== undefined) checa(campo, faixa, e.resto, true);
        continue;
      }
      if (e.kind === 'modDano' && campo === 'valor') checa(campo, faixa, scaled.valor as number, true);
      else checa(campo, faixa, scaled[campo] as number);
    }
    if (e.kind === 'stat') checa('value', STAT_LIMITES[e.stat] ?? [0, 0], scaled.value as number);
  }
}

/** Lista de problemas do catálogo (vazia = válido). Confere cada nível do bônus e o desbloqueio sem escala. */
export function validarCatalogo(catalogo: CardDef[] = CARD_CATALOG): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  const artes = new Set<string>();
  for (const d of catalogo) {
    const p = `carta ${d.id}`;
    if (ids.has(d.id)) erros.push(`${p}: id repetido`);
    ids.add(d.id);
    if (!d.name?.trim()) erros.push(`${p}: sem nome`);
    if (!d.art?.trim()) erros.push(`${p}: sem arte`);
    if (artes.has(d.art)) erros.push(`${p}: arte repetida (${d.art})`);
    artes.add(d.art);
    if (!d.ro?.trim()) erros.push(`${p}: sem referência RO (use o texto de 'sem carta' se não houver)`);
    if (!(CARD_CATEGORIES as readonly string[]).includes(d.category)) erros.push(`${p}: categoria inválida (${d.category})`);
    if (!d.origin?.trim()) erros.push(`${p}: sem 'onde vai' (use '?' se a tabela não diz)`);
    if (!d.bonus?.name?.trim() || !d.bonus?.desc?.trim()) erros.push(`${p}: bônus sem nome ou descrição`);
    if (!d.unlock?.name?.trim() || !d.unlock?.desc?.trim()) erros.push(`${p}: desbloqueio sem nome ou descrição`);
    const escala = d.bonus?.scale ?? LEVEL_SCALE;
    if (escala.length !== CARD_MAX_LEVEL || escala[0] !== 1 || escala.some((v, i) => i > 0 && v < escala[i - 1])) {
      erros.push(`${p}: escala precisa de ${CARD_MAX_LEVEL} valores, começar em 1 e não cair`);
    }
    checarRegra(`${p} bônus`, d.bonus.rule, escala, erros);
    checarRegra(`${p} desbloqueio`, d.unlock.rule, [1], erros);
  }
  return erros;
}
