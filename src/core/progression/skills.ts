import { GAME_CONFIG } from '../../config/gameConfig';

/**
 * Árvore de habilidades (estilo "pré-requisito por nível"). Tudo é DADO: para criar uma
 * habilidade nova basta adicionar uma entrada aqui e tratar o efeito na simulação.
 *
 * Regras:
 * - Cada habilidade tem nível máximo; subir 1 nível custa 1 ponto de habilidade + Zeni (na cidade).
 * - Pré-requisito = outras habilidades em um nível mínimo.
 * - As 4 habilidades originais começam no nível 1 (o herói já sabe usá-las).
 */
export type HeroKind = 'mage' | 'warrior' | 'archer';

export type SkillId =
  // Mago
  | 'frostBolt'
  | 'fireBarrier'
  | 'meditation'
  | 'frostNova'
  | 'doubleBarrier'
  | 'arcaneShield'
  | 'thunderstorm'
  | 'combustion'
  // Guerreiro
  | 'bash'
  | 'cleave'
  | 'ironSkin'
  | 'taunt'
  | 'shatter'
  | 'battleBreath'
  | 'shockwave'
  | 'fury'
  // Arqueira
  | 'preciseShot'
  | 'arrowRain'
  | 'eagleEye'
  | 'piercing'
  | 'volley'
  | 'doubleShot'
  | 'fireRain'
  | 'hunterFocus';

export interface SkillDef {
  id: SkillId;
  hero: HeroKind;
  name: string;
  tier: 1 | 2 | 3;
  /** Coluna na tela da árvore (0..2). */
  col: number;
  kind: 'active' | 'passive';
  maxLevel: number;
  requires: { id: SkillId; level: number }[];
  /** Nível inicial (as habilidades originais já vêm aprendidas). */
  start: number;
  desc: string;
  /** Texto do efeito num nível. */
  effect(lv: number): string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ticks: number) => `${(ticks / 10).toFixed(1)} s`;

/** Números de cada habilidade por nível (lidos pela simulação e pelos textos). */
export const SKILL_NUM = {
  frostBolt: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  fireBarrier: (lv: number) => ({ burnMult: 1 + 0.1 * (lv - 1), extraTicks: 6 * (lv - 1) }),
  meditation: (lv: number) => ({ cdr: 0.02 * lv }),
  frostNova: (lv: number) => ({ radius: lv >= 5 ? 3 : 2, damage: 8 + 3 * lv, freezeTicks: 20 + 4 * lv, cooldown: 95 - 5 * lv }),
  doubleBarrier: (lv: number) => ({ extraLen: lv >= 4 ? 2 : lv >= 2 ? 1 : 0, extraTicks: 8 * lv }),
  arcaneShield: (lv: number) => ({ block: 0.03 * lv, reduce: 0.04 * lv }),
  thunderstorm: (lv: number) => ({ strikes: 2 + lv, damage: 14 + 6 * lv, cooldown: 75 - 4 * lv }),
  combustion: (lv: number) => ({ splash: 0.3 + 0.1 * lv }),
  bash: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  cleave: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  ironSkin: (lv: number) => ({ hp: 0.04 * lv, reduce: 0.02 * lv }),
  /** Provocar: campo de aggro (números base em GAME_CONFIG.aggro.taunt) + puxão curto. */
  taunt: (lv: number) => {
    const T = GAME_CONFIG.aggro.taunt;
    const k = Math.max(0, lv - 1);
    return { radius: T.range + T.rangePerLevel * k, duration: T.durationTicks + T.durationPerLevel * k, maxEnemies: T.maxEnemies + T.maxPerLevel * k, pull: lv >= 3 ? 2 : 1, cooldown: T.cooldownTicks + T.cooldownPerLevel * lv };
  },
  shatter: (lv: number) => ({ chance: Math.min(1, 0.4 + 0.12 * lv), distance: lv >= 4 ? 2 : 1 }),
  battleBreath: (lv: number) => ({ heal: 1 + lv }),
  shockwave: (lv: number) => ({ radius: lv >= 4 ? 3 : 2, damage: 18 + 7 * lv, push: 2, cooldown: 115 - 6 * lv }),
  fury: (lv: number) => ({ duration: 40 + 8 * lv, cdMult: 0.7 - 0.04 * lv, cooldown: 170 - 6 * lv }),
  preciseShot: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  arrowRain: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  eagleEye: (lv: number) => ({ range: Math.min(3, Math.floor(lv / 3)), crit: 0.02 * lv }),
  piercing: (lv: number) => ({ damage: 12 + 5 * lv, cooldown: 75 - 5 * lv }),
  volley: (lv: number) => ({ radius: lv >= 3 ? 1 : 0, dmgMult: 1 + 0.08 * lv }),
  doubleShot: (lv: number) => ({ chance: 0.1 + 0.08 * lv }),
  fireRain: (lv: number) => ({ burnTicks: 20 + 8 * lv }),
  hunterFocus: (lv: number) => ({ duration: 40 + 8 * lv, cdMult: 0.65 - 0.04 * lv, cooldown: 170 - 6 * lv }),
} satisfies Record<SkillId, (lv: number) => Record<string, number>>;

const N = SKILL_NUM;

export const SKILLS: SkillDef[] = [
  // ---------------- Mago ----------------
  {
    id: 'frostBolt', hero: 'mage', name: 'Raio Gélido', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Ataque à distância de alvo único (exige linha de visão).',
    effect: (lv) => `Dano ×${N.frostBolt(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'fireBarrier', hero: 'mage', name: 'Barreira de Fogo', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Três linhas curtas de chamas que queimam e desviam a horda (monte o funil).',
    effect: (lv) => `Queimadura ×${N.fireBarrier(lv).burnMult.toFixed(2)} · +${sec(N.fireBarrier(lv).extraTicks)} de duração`,
  },
  {
    id: 'meditation', hero: 'mage', name: 'Meditação', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: regeneração de mana — todas as recargas do Mago ficam mais curtas.',
    effect: (lv) => `Recarga −${pct(N.meditation(lv).cdr)}`,
  },
  {
    id: 'frostNova', hero: 'mage', name: 'Nova Congelante', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'frostBolt', level: 3 }], start: 0,
    desc: 'Explosão de gelo ao redor do Mago: dano e congela os inimigos no lugar.',
    effect: (lv) => { const n = N.frostNova(lv); return `Raio ${n.radius} · dano ${n.damage} · congela ${sec(n.freezeTicks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'doubleBarrier', hero: 'mage', name: 'Barreira Ampliada', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'fireBarrier', level: 3 }], start: 0,
    desc: 'Passiva: as 3 barreiras ficam mais longas e duram mais.',
    effect: (lv) => `+${N.doubleBarrier(lv).extraLen} tile(s) em cada barreira · +${sec(N.doubleBarrier(lv).extraTicks)} de duração`,
  },
  {
    id: 'arcaneShield', hero: 'mage', name: 'Escudo Arcano', tier: 2, col: 2, kind: 'passive', maxLevel: 5, requires: [{ id: 'meditation', level: 3 }], start: 0,
    desc: 'Passiva: chance de bloqueio e absorção de parte do dano recebido.',
    effect: (lv) => `Bloqueio +${pct(N.arcaneShield(lv).block)} · dano recebido −${pct(N.arcaneShield(lv).reduce)}`,
  },
  {
    id: 'thunderstorm', hero: 'mage', name: 'Tempestade Elétrica', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'frostNova', level: 3 }, { id: 'fireBarrier', level: 3 }], start: 0,
    desc: 'Raios caem sobre inimigos congelados (ou sobre o grupo mais denso), com respingo em volta.',
    effect: (lv) => { const n = N.thunderstorm(lv); return `${n.strikes} raios · dano ${n.damage} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'combustion', hero: 'mage', name: 'Combustão', tier: 3, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'doubleBarrier', level: 4 }], start: 0,
    desc: 'Passiva: as chamas saltam dos inimigos queimando para os vizinhos.',
    effect: (lv) => `Respingo de ${pct(N.combustion(lv).splash)} da queimadura nos vizinhos`,
  },
  // ---------------- Guerreiro ----------------
  {
    id: 'bash', hero: 'warrior', name: 'Investida', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Golpe pesado de alvo único no inimigo adjacente mais ferido.',
    effect: (lv) => `Dano ×${N.bash(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'cleave', hero: 'warrior', name: 'Golpe em Área', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Corte em cone que acerta todos os inimigos na frente.',
    effect: (lv) => `Dano ×${N.cleave(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'ironSkin', hero: 'warrior', name: 'Pele de Ferro', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais vida e menos dano recebido.',
    effect: (lv) => `HP +${pct(N.ironSkin(lv).hp)} · dano recebido −${pct(N.ironSkin(lv).reduce)}`,
  },
  {
    id: 'fury', hero: 'warrior', name: 'Fúria', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'bash', level: 5 }, { id: 'battleBreath', level: 3 }], start: 0,
    desc: 'Entra em fúria: ataques muito mais rápidos por alguns segundos.',
    effect: (lv) => { const n = N.fury(lv); return `Recargas ×${n.cdMult.toFixed(2)} por ${sec(n.duration)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'battleBreath', hero: 'warrior', name: 'Fôlego de Batalha', tier: 2, col: 0, kind: 'passive', maxLevel: 5, requires: [{ id: 'bash', level: 3 }], start: 0,
    desc: 'Passiva: recupera vida a cada inimigo atingido.',
    effect: (lv) => `+${N.battleBreath(lv).heal} HP por acerto`,
  },
  {
    id: 'shatter', hero: 'warrior', name: 'Golpe Estilhaçante', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'cleave', level: 3 }], start: 0,
    desc: 'Passiva: o Golpe em Área empurra os inimigos atingidos.',
    effect: (lv) => `${pct(N.shatter(lv).chance)} de chance · empurra ${N.shatter(lv).distance} tile(s)`,
  },
  {
    id: 'taunt', hero: 'warrior', name: 'Provocar', tier: 2, col: 2, kind: 'active', maxLevel: 5, requires: [{ id: 'ironSkin', level: 3 }], start: 0,
    desc: 'Grito de guerra: os inimigos em volta esquecem a cidade e vão atrás do Guerreiro (e são puxados um pouco).',
    effect: (lv) => { const n = N.taunt(lv); return `Raio ${n.radius} · até ${n.maxEnemies} inimigos por ${sec(n.duration)} · puxa ${n.pull} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'shockwave', hero: 'warrior', name: 'Onda de Choque', tier: 3, col: 1, kind: 'active', maxLevel: 5,
    requires: [{ id: 'shatter', level: 3 }, { id: 'taunt', level: 3 }], start: 0,
    desc: 'Golpe no chão: dano em área grande e empurrão forte.',
    effect: (lv) => { const n = N.shockwave(lv); return `Raio ${n.radius} · dano ${n.damage} · empurra ${n.push} · recarga ${sec(n.cooldown)}`; },
  },
  // ---------------- Arqueira ----------------
  {
    id: 'preciseShot', hero: 'archer', name: 'Flecha Precisa', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Flecha de longo alcance no inimigo mais próximo (exige linha de visão).',
    effect: (lv) => `Dano ×${N.preciseShot(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'arrowRain', hero: 'archer', name: 'Chuva de Flechas', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Dispara para o alto: flechas caem numa área sobre o grupo mais denso.',
    effect: (lv) => `Dano ×${N.arrowRain(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'eagleEye', hero: 'archer', name: 'Olho de Águia', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais alcance e chance de acerto crítico (dano dobrado).',
    effect: (lv) => `Alcance +${N.eagleEye(lv).range} · crítico +${pct(N.eagleEye(lv).crit)}`,
  },
  {
    id: 'piercing', hero: 'archer', name: 'Flecha Perfurante', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'preciseShot', level: 3 }], start: 0,
    desc: 'Atravessa todos os inimigos em linha reta até o fim do alcance.',
    effect: (lv) => `Dano ${N.piercing(lv).damage} em cada · recarga ${sec(N.piercing(lv).cooldown)}`,
  },
  {
    id: 'volley', hero: 'archer', name: 'Saraivada', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'arrowRain', level: 3 }], start: 0,
    desc: 'Passiva: a Chuva de Flechas cobre uma área maior e fere mais.',
    effect: (lv) => `Área +${N.volley(lv).radius} · dano ×${N.volley(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'doubleShot', hero: 'archer', name: 'Tiro Duplo', tier: 2, col: 2, kind: 'passive', maxLevel: 5, requires: [{ id: 'eagleEye', level: 3 }], start: 0,
    desc: 'Passiva: chance de disparar uma segunda flecha em outro alvo.',
    effect: (lv) => `${pct(N.doubleShot(lv).chance)} de chance`,
  },
  {
    id: 'hunterFocus', hero: 'archer', name: 'Foco do Caçador', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'piercing', level: 3 }, { id: 'doubleShot', level: 3 }], start: 0,
    desc: 'Concentração total: recargas muito mais curtas por alguns segundos.',
    effect: (lv) => { const n = N.hunterFocus(lv); return `Recargas ×${n.cdMult.toFixed(2)} por ${sec(n.duration)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'fireRain', hero: 'archer', name: 'Chuva Incendiária', tier: 3, col: 1, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'volley', level: 3 }, { id: 'preciseShot', level: 3 }], start: 0,
    desc: 'Passiva: a Chuva de Flechas deixa o chão em chamas.',
    effect: (lv) => `Fogo por ${sec(N.fireRain(lv).burnTicks)}`,
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const heroSkills = (hero: HeroKind) => SKILLS.filter((s) => s.hero === hero);

export type SkillLevels = Partial<Record<SkillId, number>>;

export function startingSkills(hero: HeroKind): SkillLevels {
  const out: SkillLevels = {};
  for (const s of heroSkills(hero)) if (s.start > 0) out[s.id] = s.start;
  return out;
}

export const lvOf = (levels: SkillLevels | undefined, id: SkillId) => levels?.[id] ?? 0;

/** Falta algum pré-requisito? Devolve o texto do que falta (ou vazio). */
export function missingRequirements(levels: SkillLevels, id: SkillId): string[] {
  return SKILL_BY_ID[id].requires.filter((r) => lvOf(levels, r.id) < r.level).map((r) => `${SKILL_BY_ID[r.id].name} nv ${r.level}`);
}

/** Zeni para levar a habilidade ao nível `next`. */
export function skillZeniCost(id: SkillId, next: number): number {
  const d = SKILL_BY_ID[id];
  return SKILL_ZENI.base * d.tier * next;
}

export const SKILL_ZENI = { base: 30, respecBase: 150 };

export type SkillState = 'locked' | 'available' | 'learned' | 'max';
export function skillState(levels: SkillLevels, id: SkillId): SkillState {
  const lv = lvOf(levels, id);
  const d = SKILL_BY_ID[id];
  if (lv >= d.maxLevel) return 'max';
  if (missingRequirements(levels, id).length) return 'locked';
  return lv > 0 ? 'learned' : 'available';
}

/** Soma de pontos já investidos acima do nível inicial (para redistribuir). */
export function investedSkillPoints(hero: HeroKind, levels: SkillLevels): number {
  return heroSkills(hero).reduce((s, d) => s + Math.max(0, lvOf(levels, d.id) - d.start), 0);
}
