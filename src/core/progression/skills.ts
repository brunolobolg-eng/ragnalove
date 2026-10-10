import { GAME_CONFIG } from '../../config/gameConfig';

/**
 * Árvore de habilidades (estilo "pré-requisito por nível"). Tudo é DADO: para criar uma
 * habilidade nova basta adicionar uma entrada aqui e tratar o efeito na simulação.
 *
 * Regras:
 * - Cada habilidade tem nível máximo; subir 1 nível custa 1 ponto de habilidade + Zen (na cidade).
 * - Pré-requisito = outras habilidades em um nível mínimo.
 * - As 4 habilidades originais começam no nível 1 (o herói já sabe usá-las).
 */
export type HeroKind = 'mage' | 'warrior' | 'archer' | 'sorcerer' | 'warlock' | 'assassin';

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
  | 'heal'
  | 'sanctuary'
  | 'holyShield'
  | 'blessing'
  | 'healGift'
  | 'judgment'
  // Guerreiro
  | 'bash'
  | 'cleave'
  | 'ironSkin'
  | 'taunt'
  | 'shatter'
  | 'battleBreath'
  | 'shockwave'
  | 'fury'
  | 'shieldWall'
  // Guerreiro — Cavaleiro Rúnico (conjunto de teste, fora da árvore: ver RUNIC_SKILLS)
  | 'enchantBlade'
  | 'sonicWave'
  | 'deathBound'
  | 'hundredSpear'
  | 'windCutter'
  // Arqueira
  | 'preciseShot'
  | 'arrowRain'
  | 'eagleEye'
  | 'piercing'
  | 'volley'
  | 'doubleShot'
  | 'fireRain'
  | 'hunterFocus'
  | 'snareTrap'
  | 'landMine'
  | 'freezingTrap'
  | 'claymore'
  | 'trapMaster'
  // Feiticeira
  | 'arcaneOrb'
  | 'meteorStrike'
  | 'arcaneFlow'
  | 'chainLightning'
  | 'meteorShower'
  // Bruxa
  | 'lifeDrain'
  | 'curse'
  | 'darkPact'
  | 'shadowSwarm'
  | 'soulHarvest'
  // Bruxa — magias novas (lançadas na hora; só a recarga limita)
  | 'etherealCage'
  | 'soulEcho'
  | 'frostMist'
  | 'blackFrost'
  | 'abyssMarsh'
  | 'darkApex'
  // Assassino
  | 'backstab'
  | 'bladeFan'
  | 'shadowStep'
  | 'poisonBlades'
  | 'execute';

export interface SkillDef {
  id: SkillId;
  hero: HeroKind;
  name: string;
  tier: 1 | 2 | 3;
  /** Coluna na tela da árvore (0..3). */
  col: number;
  kind: 'active' | 'passive';
  maxLevel: number;
  requires: { id: SkillId; level: number }[];
  /** Nível inicial (as habilidades originais já vêm aprendidas). */
  start: number;
  desc: string;
  /** Texto do efeito num nível. */
  effect(lv: number): string;
  /**
   * Especialização (ramo exclusivo). Aprender uma habilidade de um ramo trava os outros ramos
   * do herói até refazer as habilidades. Sem ramo = habilidade comum a todos.
   */
  branch?: string;
  /** Cavaleiro Rúnico: fora da árvore (teste); ver RUNIC_SKILLS. */
  runic?: true;
}

/** Especializações por classe (ramos exclusivos da árvore). */
export const BRANCHES: Partial<Record<HeroKind, { id: string; name: string; desc: string }[]>> = {
  mage: [
    { id: 'divina', name: 'Cura (Divina)', desc: 'Magia sagrada: cura, santuário, escudo e bênção para a party.' },
    { id: 'arcana', name: 'Dano (Arcana)', desc: 'Magia de destruição: nova congelante, tempestade, combustão e julgamento.' },
  ],
  archer: [
    { id: 'armadilhas', name: 'Armadilhas', desc: 'Minas, armadilhas congelantes e claymores no caminho da horda.' },
    { id: 'tiro', name: 'Tiro', desc: 'Flechas perfurantes, tiro duplo e foco do caçador.' },
  ],
};

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
  /** Cura (Heal do Ragnarok): cura o aliado mais ferido ao alcance. */
  heal: (lv: number) => ({ amount: 16 + 7 * lv, range: 6, cooldown: Math.max(15, 42 - 2 * lv) }),
  /** Santuário (Sanctuary): chão sagrado que cura quem estiver dentro, a cada segundo. */
  sanctuary: (lv: number) => ({ radius: lv >= 4 ? 2 : 1, perSec: 3 + 2 * lv, ticks: 50 + 6 * lv, cooldown: 140 - 8 * lv }),
  /** Escudo Sagrado (Kyrie Eleison): barreira que absorve dano num aliado. */
  holyShield: (lv: number) => ({ absorb: 20 + 10 * lv, ticks: 80 + 10 * lv, cooldown: 110 - 6 * lv }),
  /** Bênção (Blessing): a party perto causa mais dano por um tempo. */
  blessing: (lv: number) => ({ amp: 0.08 + 0.03 * lv, ticks: 80 + 10 * lv, radius: 6, cooldown: 180 - 10 * lv }),
  /** Dom da Cura (passiva): curas mais fortes; no nível 3+ a Cura alcança 2 aliados. */
  healGift: (lv: number) => ({ healMult: 1 + 0.1 * lv, targets: lv >= 3 ? 2 : 1 }),
  /** Julgamento Divino (Magnus Exorcismus): pilares de luz em cruz sobre o grupo mais denso. */
  judgment: (lv: number) => ({ damage: 26 + 10 * lv, stun: 6 + 2 * lv, cooldown: 125 - 7 * lv }),
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
  /** Atordoa (sem empurrar): o alvo perde o próximo passo/ataque. */
  shatter: (lv: number) => ({ chance: Math.min(1, 0.4 + 0.12 * lv), stun: 6 + 2 * lv }),
  battleBreath: (lv: number) => ({ heal: 1 + lv }),
  shockwave: (lv: number) => ({ radius: lv >= 4 ? 3 : 2, damage: 18 + 7 * lv, stun: 10 + 2 * lv, cooldown: 115 - 6 * lv }),
  fury: (lv: number) => ({ duration: 40 + 8 * lv, cdMult: 0.7 - 0.04 * lv, cooldown: 170 - 6 * lv }),
  preciseShot: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  arrowRain: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  eagleEye: (lv: number) => ({ range: Math.min(3, Math.floor(lv / 3)), crit: 0.02 * lv }),
  piercing: (lv: number) => ({ damage: 12 + 5 * lv, cooldown: 75 - 5 * lv }),
  volley: (lv: number) => ({ radius: lv >= 3 ? 1 : 0, dmgMult: 1 + 0.08 * lv }),
  doubleShot: (lv: number) => ({ chance: 0.1 + 0.08 * lv }),
  fireRain: (lv: number) => ({ burnTicks: 20 + 8 * lv }),
  hunterFocus: (lv: number) => ({ duration: 40 + 8 * lv, cdMult: 0.65 - 0.04 * lv, cooldown: 170 - 6 * lv }),
  /** Muralha do Guerreiro: números base em GAME_CONFIG.archetypes.warrior.shieldWall. */
  /** Lâmina Encantada: o golpe corpo a corpo ganha `bonus` de dano mágico enquanto a magia dura. */
  enchantBlade: (lv: number) => ({ bonus: 3 + 2 * lv, ticks: 3000, cooldown: Math.max(400, 1200 - 80 * lv), range: 2 }),
  /** Onda Sônica: dano à distância num alvo (sem linha de visão); pode causar crítico. */
  sonicWave: (lv: number) => ({ damage: 12 + 5 * lv, range: 5, cooldown: Math.max(30, 60 - 2 * lv) }),
  /** Limite da Morte: o marcado recebe `amp` a mais de dano e devolve `reflect` do dano a quem bateu (não é usado em chefes). */
  deathBound: (lv: number) => ({ amp: 0.15 + 0.03 * lv, reflect: 0.1 + 0.02 * lv, ticks: 300 + 30 * lv, range: 4, cooldown: Math.max(80, 150 - 8 * lv) }),
  /** Cem Lanças (exige lança): `hits` golpes de `damage` no alvo e nos vizinhos dele (raio `radius`), até `range` casas. */
  hundredSpear: (lv: number) => ({ hits: 4 + Math.floor(lv / 2), damage: 4 + 2 * lv, range: 7, radius: 1, cooldown: Math.max(60, 160 - 8 * lv) }),
  /** Cortador de Vento: giro com `damage` em cada inimigo do raio; com lança o raio é `spearRadius`. */
  windCutter: (lv: number) => ({ damage: 8 + 3 * lv, radius: 1, spearRadius: 2, cooldown: Math.max(30, 70 - 3 * lv) }),
  shieldWall: (lv: number) => {
    const W = GAME_CONFIG.archetypes.warrior.shieldWall;
    return { length: W.length + (lv >= 4 ? 2 : lv >= 2 ? 1 : 0), hp: W.hp + W.hpPerLevel * (lv - 1), cooldown: Math.max(20, W.cooldownTicks - W.cooldownPerLevel * (lv - 1)) };
  },
  /** Armadilha da Arqueira: números base em GAME_CONFIG.archetypes.archer.trap. */
  snareTrap: (lv: number) => {
    const T = GAME_CONFIG.archetypes.archer.trap;
    return { damage: T.damage + T.damagePerLevel * (lv - 1), slowTicks: T.slowTicks + 6 * (lv - 1), slowMult: T.slowMult, maxTraps: T.maxTraps + (lv >= 3 ? 1 : 0), cooldown: Math.max(20, T.cooldownTicks - 4 * (lv - 1)) };
  },
  /** Mina Terrestre (Land Mine): explode ao ser pisada — dano em volta e atordoa quem pisou. */
  landMine: (lv: number) => ({ damage: 22 + 8 * lv, stun: 10 + 3 * lv, radius: 1, maxTraps: 2, cooldown: Math.max(25, 70 - 4 * lv) }),
  /** Armadilha Congelante (Freezing Trap): congela os inimigos em volta de quem pisou. */
  freezingTrap: (lv: number) => ({ damage: 8 + 3 * lv, freeze: 20 + 5 * lv, radius: 1, maxTraps: 2, cooldown: Math.max(30, 90 - 5 * lv) }),
  /** Armadilha Claymore (Claymore Trap): grande explosão de fogo em área. */
  claymore: (lv: number) => ({ damage: 30 + 12 * lv, radius: 2, maxTraps: 1, cooldown: Math.max(45, 125 - 8 * lv) }),
  /** Mestre Armadilheiro (passiva): todas as armadilhas mais fortes, mais rápidas e +1 armada no nível 3+. */
  trapMaster: (lv: number) => ({ dmgMult: 1 + 0.08 * lv, cdMult: 1 - 0.04 * lv, extraTraps: lv >= 3 ? 1 : 0 }),
  arcaneOrb: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  meteorStrike: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  arcaneFlow: (lv: number) => ({ cdr: 0.02 * lv }),
  chainLightning: (lv: number) => ({ jumps: 2 + lv, damage: 12 + 5 * lv, cooldown: 80 - 5 * lv }),
  meteorShower: (lv: number) => ({ extra: lv >= 4 ? 2 : 1, dmgMult: 0.5 + 0.08 * lv }),
  lifeDrain: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1), heal: 0.35 + 0.03 * (lv - 1) }),
  curse: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1), amp: 0.2 + 0.03 * (lv - 1) }),
  darkPact: (lv: number) => ({ dmg: 0.04 * lv }),
  shadowSwarm: (lv: number) => ({ targets: 2 + lv, dot: 3 + 1.5 * lv, ticks: 40 + 6 * lv, cooldown: 90 - 5 * lv }),
  soulHarvest: (lv: number) => ({ heal: 2 + lv, soulChance: 0.08 * lv }),
  /** Névoa Gélida: área no chão (raio 3→5), pulso de gelo a cada 1 s; cada pulso deixa o inimigo gelado. */
  frostMist: (lv: number) => ({ radius: lv >= 5 ? 5 : lv >= 3 ? 4 : 3, pulse: 2 + lv, ticks: 100 + 75 * (lv - 1), range: 6, cooldown: 90 - 5 * (lv - 1) }),
  /** Cárcere Etéreo: prende um inimigo (não chefe) em cristal; chance de falhar até o nível 2. Preso só recebe dano de sombra. */
  etherealCage: (lv: number) => ({ chance: Math.min(0.9, 0.5 + 0.1 * (lv - 1)), ticks: 100 + 20 * (lv - 1), range: 6, cooldown: 150 - 10 * (lv - 1) }),
  /** Eco da Alma: 2 batidas de sombra no alvo e na área (raio 1→2); dobra contra inimigos presos. */
  soulEcho: (lv: number) => ({ damage: 10 + 3 * lv, radius: lv >= 4 ? 2 : 1, blows: 2, cagedMult: 2, range: 6, cooldown: 70 - 4 * (lv - 1) }),
  /** Geada Negra: dano de gelo instantâneo na área (raio 3→5); mais dano nos inimigos gelados. */
  blackFrost: (lv: number) => ({ damage: 12 + 4 * lv, radius: lv >= 5 ? 5 : lv >= 3 ? 4 : 3, chillMult: 1.4 + 0.075 * (lv - 1), range: 6, cooldown: 70 - 4 * (lv - 1) }),
  /** Lodaçal Abissal: lentidão e vulnerabilidade sobem com a Inteligência (teto em `slowCap` e `curseCap`). */
  abyssMarsh: (lv: number) => ({
    slow: 2.0 + 0.25 * (lv - 1), slowPerInt: 0.01, slowCap: 3.5,
    curse: 0.15 + 0.03 * (lv - 1), cursePerInt: 0.002, curseCap: 0.3,
    ticks: 300, range: 6, cooldown: 70 - 4 * (lv - 1),
  }),
  /** Ápice Sombrio: a Bruxa ganha `amp` no dano de sombra, maldição e gelo (não gasta a ação). `range`: só ativa com inimigo perto. */
  darkApex: (lv: number) => ({ amp: 0.15 + 0.02 * (lv - 1), ticks: 300 + 30 * (lv - 1), range: 6, cooldown: 600 - 40 * (lv - 1) }),
  backstab: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  bladeFan: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  shadowStep: (lv: number) => ({ dodge: 0.02 * lv, crit: 0.02 * lv }),
  poisonBlades: (lv: number) => ({ dot: 2 + lv, ticks: 30 + 6 * lv }),
  execute: (lv: number) => ({ threshold: 0.18 + 0.04 * lv, range: 2, cooldown: 110 - 8 * lv }),
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
    id: 'frostNova', hero: 'mage', name: 'Nova Congelante', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'frostBolt', level: 3 }], start: 0, branch: 'arcana',
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
    requires: [{ id: 'frostNova', level: 3 }, { id: 'fireBarrier', level: 3 }], start: 0, branch: 'arcana',
    desc: 'Raios caem sobre inimigos congelados (ou sobre o grupo mais denso), com respingo em volta.',
    effect: (lv) => { const n = N.thunderstorm(lv); return `${n.strikes} raios · dano ${n.damage} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'combustion', hero: 'mage', name: 'Combustão', tier: 3, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'doubleBarrier', level: 4 }], start: 0, branch: 'arcana',
    desc: 'Passiva: as chamas saltam dos inimigos queimando para os vizinhos.',
    effect: (lv) => `Respingo de ${pct(N.combustion(lv).splash)} da queimadura nos vizinhos`,
  },
  {
    id: 'judgment', hero: 'mage', name: 'Julgamento Divino', tier: 3, col: 2, kind: 'active', maxLevel: 5,
    requires: [{ id: 'frostNova', level: 3 }, { id: 'arcaneShield', level: 2 }], start: 0, branch: 'arcana',
    desc: 'Pilares de luz caem em cruz sobre o grupo mais denso: dano alto e atordoa.',
    effect: (lv) => { const n = N.judgment(lv); return `Dano ${n.damage} em cruz · atordoa ${sec(n.stun)} · recarga ${sec(n.cooldown)}`; },
  },
  // ---------------- Mago: especialização Divina (cura) ----------------
  {
    id: 'heal', hero: 'mage', name: 'Cura', tier: 1, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 0, branch: 'divina',
    desc: 'Luz curativa no aliado mais ferido ao alcance (inclui a própria Cléria).',
    effect: (lv) => { const n = N.heal(lv); return `Cura ${n.amount} de vida · alcance ${n.range} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'sanctuary', hero: 'mage', name: 'Santuário', tier: 2, col: 3, kind: 'active', maxLevel: 5, requires: [{ id: 'heal', level: 3 }], start: 0, branch: 'divina',
    desc: 'Consagra o chão onde a party está: todo aliado dentro recupera vida a cada segundo.',
    effect: (lv) => { const n = N.sanctuary(lv); return `Área ${n.radius * 2 + 1}×${n.radius * 2 + 1} · cura ${n.perSec}/s por ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'holyShield', hero: 'mage', name: 'Escudo Sagrado', tier: 2, col: 4, kind: 'active', maxLevel: 5, requires: [{ id: 'heal', level: 2 }], start: 0, branch: 'divina',
    desc: 'Barreira de luz no aliado da linha de frente: absorve o dano até quebrar.',
    effect: (lv) => { const n = N.holyShield(lv); return `Absorve ${n.absorb} de dano por ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'blessing', hero: 'mage', name: 'Bênção', tier: 3, col: 3, kind: 'active', maxLevel: 5, requires: [{ id: 'sanctuary', level: 3 }], start: 0, branch: 'divina',
    desc: 'Abençoa a party por perto: todos causam mais dano por alguns segundos.',
    effect: (lv) => { const n = N.blessing(lv); return `Dano +${pct(n.amp)} por ${sec(n.ticks)} · raio ${n.radius} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'healGift', hero: 'mage', name: 'Dom da Cura', tier: 3, col: 4, kind: 'passive', maxLevel: 5, requires: [{ id: 'holyShield', level: 2 }], start: 0, branch: 'divina',
    desc: 'Passiva: curas e santuário mais fortes; no nível 3 a Cura alcança 2 aliados.',
    effect: (lv) => { const n = N.healGift(lv); return `Cura ×${n.healMult.toFixed(2)} · Cura em ${n.targets} aliado(s)`; },
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
    desc: 'Passiva: o Golpe em Área atordoa os inimigos atingidos (sem empurrar).',
    effect: (lv) => `${pct(N.shatter(lv).chance)} de chance · atordoa ${sec(N.shatter(lv).stun)}`,
  },
  {
    id: 'taunt', hero: 'warrior', name: 'Provocar', tier: 2, col: 2, kind: 'active', maxLevel: 5, requires: [{ id: 'ironSkin', level: 3 }], start: 0,
    desc: 'Grito de guerra: os inimigos em volta esquecem a cidade e vão atrás do Guerreiro (e são puxados um pouco).',
    effect: (lv) => { const n = N.taunt(lv); return `Raio ${n.radius} · até ${n.maxEnemies} inimigos por ${sec(n.duration)} · puxa ${n.pull} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'shockwave', hero: 'warrior', name: 'Onda de Choque', tier: 3, col: 1, kind: 'active', maxLevel: 5,
    requires: [{ id: 'shatter', level: 3 }, { id: 'taunt', level: 3 }], start: 0,
    desc: 'Golpe no chão: dano em área grande e atordoa quem estiver em volta (sem empurrar).',
    effect: (lv) => { const n = N.shockwave(lv); return `Raio ${n.radius} · dano ${n.damage} · atordoa ${sec(n.stun)} · recarga ${sec(n.cooldown)}`; },
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
    id: 'piercing', hero: 'archer', name: 'Flecha Perfurante', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'preciseShot', level: 3 }], start: 0, branch: 'tiro',
    desc: 'Atravessa todos os inimigos em linha reta até o fim do alcance.',
    effect: (lv) => `Dano ${N.piercing(lv).damage} em cada · recarga ${sec(N.piercing(lv).cooldown)}`,
  },
  {
    id: 'volley', hero: 'archer', name: 'Saraivada', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'arrowRain', level: 3 }], start: 0,
    desc: 'Passiva: a Chuva de Flechas cobre uma área maior e fere mais.',
    effect: (lv) => `Área +${N.volley(lv).radius} · dano ×${N.volley(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'doubleShot', hero: 'archer', name: 'Tiro Duplo', tier: 2, col: 2, kind: 'passive', maxLevel: 5, requires: [{ id: 'eagleEye', level: 3 }], start: 0, branch: 'tiro',
    desc: 'Passiva: chance de disparar uma segunda flecha em outro alvo.',
    effect: (lv) => `${pct(N.doubleShot(lv).chance)} de chance`,
  },
  {
    id: 'hunterFocus', hero: 'archer', name: 'Foco do Caçador', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'piercing', level: 3 }, { id: 'doubleShot', level: 3 }], start: 0, branch: 'tiro',
    desc: 'Concentração total: recargas muito mais curtas por alguns segundos.',
    effect: (lv) => { const n = N.hunterFocus(lv); return `Recargas ×${n.cdMult.toFixed(2)} por ${sec(n.duration)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'fireRain', hero: 'archer', name: 'Chuva Incendiária', tier: 3, col: 1, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'volley', level: 3 }, { id: 'preciseShot', level: 3 }], start: 0,
    desc: 'Passiva: a Chuva de Flechas deixa o chão em chamas.',
    effect: (lv) => `Fogo por ${sec(N.fireRain(lv).burnTicks)}`,
  },
  {
    id: 'snareTrap', hero: 'archer', name: 'Armadilha', tier: 1, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Arma uma armadilha no caminho da horda: o primeiro inimigo que pisar leva dano alto e fica lento. Só 1 alvo.',
    effect: (lv) => { const n = N.snareTrap(lv); return `Dano ${n.damage} · lento ×${n.slowMult} por ${sec(n.slowTicks)} · até ${n.maxTraps} armadas · recarga ${sec(n.cooldown)}`; },
  },
  // ---------------- Arqueira: especialização em Armadilhas ----------------
  {
    id: 'landMine', hero: 'archer', name: 'Mina Terrestre', tier: 2, col: 3, kind: 'active', maxLevel: 5, requires: [{ id: 'snareTrap', level: 3 }], start: 0, branch: 'armadilhas',
    desc: 'Enterra uma mina no caminho da horda: explode ao ser pisada, fere quem estiver em volta e atordoa quem pisou.',
    effect: (lv) => { const n = N.landMine(lv); return `Dano ${n.damage} em área · atordoa ${sec(n.stun)} · até ${n.maxTraps} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'freezingTrap', hero: 'archer', name: 'Armadilha Congelante', tier: 2, col: 4, kind: 'active', maxLevel: 5, requires: [{ id: 'snareTrap', level: 2 }], start: 0, branch: 'armadilhas',
    desc: 'Ao ser pisada, congela todos os inimigos em volta: a horda para no lugar.',
    effect: (lv) => { const n = N.freezingTrap(lv); return `Congela ${sec(n.freeze)} em área · dano ${n.damage} · até ${n.maxTraps} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'claymore', hero: 'archer', name: 'Armadilha Claymore', tier: 3, col: 3, kind: 'active', maxLevel: 5, requires: [{ id: 'landMine', level: 3 }], start: 0, branch: 'armadilhas',
    desc: 'Carga explosiva enorme: ao ser pisada, uma explosão de fogo arrasa a área.',
    effect: (lv) => { const n = N.claymore(lv); return `Dano ${n.damage} · área ${n.radius * 2 + 1}×${n.radius * 2 + 1} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'trapMaster', hero: 'archer', name: 'Mestre Armadilheiro', tier: 3, col: 4, kind: 'passive', maxLevel: 5, requires: [{ id: 'freezingTrap', level: 2 }], start: 0, branch: 'armadilhas',
    desc: 'Passiva: todas as armadilhas causam mais dano e voltam mais rápido; no nível 3 arma uma a mais.',
    effect: (lv) => { const n = N.trapMaster(lv); return `Dano das armadilhas ×${n.dmgMult.toFixed(2)} · recarga ×${n.cdMult.toFixed(2)}${n.extraTraps ? ' · +1 armada' : ''}`; },
  },
  // ---------------- Guerreiro (muralha) ----------------
  {
    id: 'shieldWall', hero: 'warrior', name: 'Muralha', tier: 1, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Ergue uma muralha intransponível onde você posicionar (arraste no campo). A horda precisa quebrá-la para passar; ela volta depois da recarga.',
    effect: (lv) => { const n = N.shieldWall(lv); return `${n.length} blocos · ${n.hp} de vida cada · reergue em ${sec(n.cooldown)}`; },
  },
  // ---------------- Feiticeira ----------------
  {
    id: 'arcaneOrb', hero: 'sorcerer', name: 'Orbe Arcano', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Orbe de energia no inimigo mais próximo (exige linha de visão). Escala com Inteligência.',
    effect: (lv) => `Dano ×${N.arcaneOrb(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'meteorStrike', hero: 'sorcerer', name: 'Meteoro', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Invoca um meteoro sobre o grupo mais denso ao alcance.',
    effect: (lv) => `Dano ×${N.meteorStrike(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'arcaneFlow', hero: 'sorcerer', name: 'Fluxo Arcano', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: recargas mais curtas.',
    effect: (lv) => `Recarga −${pct(N.arcaneFlow(lv).cdr)}`,
  },
  {
    id: 'chainLightning', hero: 'sorcerer', name: 'Corrente Elétrica', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'arcaneOrb', level: 3 }], start: 0,
    desc: 'Um raio que salta de inimigo em inimigo.',
    effect: (lv) => { const n = N.chainLightning(lv); return `${n.jumps} saltos · dano ${n.damage} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'meteorShower', hero: 'sorcerer', name: 'Chuva de Meteoros', tier: 3, col: 1, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'meteorStrike', level: 4 }, { id: 'chainLightning', level: 2 }], start: 0,
    desc: 'Passiva: cada Meteoro traz meteoros menores nos grupos vizinhos.',
    effect: (lv) => `+${N.meteorShower(lv).extra} meteoro(s) com ${pct(N.meteorShower(lv).dmgMult)} do dano`,
  },
  // ---------------- Bruxa ----------------
  {
    id: 'lifeDrain', hero: 'warlock', name: 'Dreno de Vida', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Rouba vida do inimigo mais próximo: cura a Bruxa com parte do dano.',
    effect: (lv) => `Dano ×${N.lifeDrain(lv).dmgMult.toFixed(2)} · cura ${pct(N.lifeDrain(lv).heal)} do dano`,
  },
  {
    id: 'curse', hero: 'warlock', name: 'Maldição', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Amaldiçoa um grupo: dano contínuo e os amaldiçoados sofrem mais dano de toda a party.',
    effect: (lv) => `Dano ×${N.curse(lv).dmgMult.toFixed(2)} · +${pct(N.curse(lv).amp)} de dano recebido`,
  },
  {
    id: 'darkPact', hero: 'warlock', name: 'Pacto Sombrio', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais dano em todas as magias da Bruxa.',
    effect: (lv) => `Dano +${pct(N.darkPact(lv).dmg)}`,
  },
  {
    id: 'shadowSwarm', hero: 'warlock', name: 'Enxame de Sombras', tier: 2, col: 1, kind: 'active', maxLevel: 5, requires: [{ id: 'curse', level: 3 }], start: 0,
    desc: 'Sombras devoram vários inimigos aos poucos (dano contínuo).',
    effect: (lv) => { const n = N.shadowSwarm(lv); return `${n.targets} alvos · ${n.dot} por segundo por ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'soulHarvest', hero: 'warlock', name: 'Colheita de Almas', tier: 3, col: 0, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'lifeDrain', level: 4 }, { id: 'shadowSwarm', level: 2 }], start: 0,
    desc: 'Passiva: inimigos mortos pela Bruxa curam a party e podem render almas extras.',
    effect: (lv) => `+${N.soulHarvest(lv).heal} HP para a party · ${pct(N.soulHarvest(lv).soulChance)} de alma extra`,
  },
  {
    id: 'frostMist', hero: 'warlock', name: 'Névoa Gélida', tier: 1, col: 3, kind: 'active', maxLevel: 5, requires: [], start: 0,
    desc: 'Névoa de gelo no chão: dano contínuo e Frio (mais lenta e mais vulnerável).',
    effect: (lv) => { const n = N.frostMist(lv); return `Raio ${n.radius} · dano ${n.pulse} por segundo · Frio · ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'etherealCage', hero: 'warlock', name: 'Cárcere Etéreo', tier: 1, col: 4, kind: 'active', maxLevel: 5, requires: [], start: 0,
    desc: 'Prende um inimigo em cristal: ele fica parado e só recebe dano de sombra.',
    effect: (lv) => { const n = N.etherealCage(lv); return `Chance ${pct(n.chance)} · prende ${sec(n.ticks)} · alcance ${n.range} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'abyssMarsh', hero: 'warlock', name: 'Lodaçal Abissal', tier: 2, col: 2, kind: 'active', maxLevel: 5, requires: [{ id: 'curse', level: 2 }], start: 0,
    desc: 'Raízes prendem um inimigo: ele anda mais devagar e recebe mais dano por 30 s.',
    effect: (lv) => { const n = N.abyssMarsh(lv); return `Lento ×${n.slow.toFixed(2)} · +${pct(n.curse)} de dano recebido (sobe com Inteligência) · ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'blackFrost', hero: 'warlock', name: 'Geada Negra', tier: 2, col: 3, kind: 'active', maxLevel: 5, requires: [{ id: 'frostMist', level: 2 }], start: 0,
    desc: 'Gelo negro na área. Mais dano nos inimigos com Frio.',
    effect: (lv) => { const n = N.blackFrost(lv); return `Dano ${n.damage} em área (raio ${n.radius}) · ×${n.chillMult.toFixed(2)} contra inimigos com Frio · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'soulEcho', hero: 'warlock', name: 'Eco da Alma', tier: 2, col: 4, kind: 'active', maxLevel: 5, requires: [{ id: 'etherealCage', level: 2 }], start: 0,
    desc: 'Duas batidas de sombra no inimigo e na área. Dobra o dano contra inimigos presos.',
    effect: (lv) => { const n = N.soulEcho(lv); return `2 golpes de ${n.damage} de sombra · área ${n.radius * 2 + 1}×${n.radius * 2 + 1} · ×${n.cagedMult} contra presos · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'darkApex', hero: 'warlock', name: 'Ápice Sombrio', tier: 3, col: 3, kind: 'active', maxLevel: 5,
    requires: [{ id: 'blackFrost', level: 2 }, { id: 'soulEcho', level: 2 }], start: 0,
    desc: 'A Bruxa se maximiza: mais dano de sombra, gelo e maldição por um tempo.',
    effect: (lv) => { const n = N.darkApex(lv); return `Dano de sombra, gelo e maldição +${pct(n.amp)} por ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  // ---------------- Assassino ----------------
  {
    id: 'backstab', hero: 'assassin', name: 'Golpe Furtivo', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Ataque rápido no inimigo adjacente mais ferido, com muito crítico.',
    effect: (lv) => `Dano ×${N.backstab(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'bladeFan', hero: 'assassin', name: 'Leque de Lâminas', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Arremessa lâminas em cone curto na direção com mais inimigos.',
    effect: (lv) => `Dano ×${N.bladeFan(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'shadowStep', hero: 'assassin', name: 'Passo das Sombras', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais esquiva e mais crítico.',
    effect: (lv) => `Esquiva +${pct(N.shadowStep(lv).dodge)} · crítico +${pct(N.shadowStep(lv).crit)}`,
  },
  {
    id: 'poisonBlades', hero: 'assassin', name: 'Lâminas Envenenadas', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'bladeFan', level: 3 }], start: 0,
    desc: 'Passiva: os golpes envenenam (dano contínuo).',
    effect: (lv) => `${N.poisonBlades(lv).dot} por segundo por ${sec(N.poisonBlades(lv).ticks)}`,
  },
  {
    id: 'execute', hero: 'assassin', name: 'Execução', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'backstab', level: 4 }, { id: 'poisonBlades', level: 2 }], start: 0,
    desc: 'Finaliza na hora um inimigo próximo com pouca vida (não funciona em chefes).',
    effect: (lv) => { const n = N.execute(lv); return `Abaixo de ${pct(n.threshold)} da vida · alcance ${n.range} · recarga ${sec(n.cooldown)}`; },
  },
];

/**
 * Cavaleiro Rúnico (Guerreiro): conjunto de teste para a transformação futura. Fica FORA da árvore
 * (`heroSkills`), dos slots automáticos e dos iniciais; libera-se pelo debug (Desbloquear árvore) e na
 * Dev Lab (aba SKILLS). Quando a transformação entrar, estas entradas viram a árvore dela.
 */
export const RUNIC_SKILLS: SkillDef[] = [
  {
    id: 'enchantBlade', hero: 'warrior', name: 'Lâmina Encantada', tier: 3, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 0, runic: true,
    desc: 'Envolve a arma em magia por 5 minutos: os golpes corpo a corpo causam dano mágico extra.',
    effect: (lv) => { const n = N.enchantBlade(lv); return `+${n.bonus} de dano mágico por golpe · ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'sonicWave', hero: 'warrior', name: 'Onda Sônica', tier: 3, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 0, runic: true,
    desc: 'Golpeia o chão com a arma e manda uma onda sônica até o inimigo à distância. Pode causar crítico.',
    effect: (lv) => { const n = N.sonicWave(lv); return `Dano ${n.damage} · alcance ${n.range} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'deathBound', hero: 'warrior', name: 'Limite da Morte', tier: 3, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 0, runic: true,
    desc: 'Marca um inimigo: ele recebe mais dano e parte desse dano volta para quem atacou. Não funciona em chefes.',
    effect: (lv) => { const n = N.deathBound(lv); return `Dano recebido +${pct(n.amp)} · devolve ${pct(n.reflect)} · ${sec(n.ticks)} · alcance ${n.range} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'hundredSpear', hero: 'warrior', name: 'Cem Lanças', tier: 3, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 0, runic: true,
    desc: 'Exige lança. Ataca o alvo e os inimigos perto dele várias vezes em sequência; cresce com o nível do herói.',
    effect: (lv) => { const n = N.hundredSpear(lv); return `${n.hits} golpes de ${n.damage} · alcance ${n.range} · raio ${n.radius} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'windCutter', hero: 'warrior', name: 'Cortador de Vento', tier: 3, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 0, runic: true,
    desc: 'Gira a arma e solta uma pressão de vento que atinge os inimigos em volta. Com lança, o alcance é maior.',
    effect: (lv) => { const n = N.windCutter(lv); return `Dano ${n.damage} por inimigo · raio ${n.radius} (lança: ${n.spearRadius}) · recarga ${sec(n.cooldown)}`; },
  },
];

export const SKILL_BY_ID = Object.fromEntries([...SKILLS, ...RUNIC_SKILLS].map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const heroSkills = (hero: HeroKind) => SKILLS.filter((s) => s.hero === hero);
export const runicSkills = (hero: HeroKind) => RUNIC_SKILLS.filter((s) => s.hero === hero);

export type SkillLevels = Partial<Record<SkillId, number>>;

export function startingSkills(hero: HeroKind): SkillLevels {
  const out: SkillLevels = {};
  for (const s of heroSkills(hero)) if (s.start > 0) out[s.id] = s.start;
  return out;
}

export const lvOf = (levels: SkillLevels | undefined, id: SkillId) => levels?.[id] ?? 0;

/** Especialização já escolhida (o ramo de qualquer habilidade de ramo aprendida). */
export function chosenBranch(hero: HeroKind, levels: SkillLevels): string | undefined {
  return heroSkills(hero).find((d) => d.branch && lvOf(levels, d.id) > 0)?.branch;
}

export const branchName = (hero: HeroKind, id: string) => BRANCHES[hero]?.find((b) => b.id === id)?.name ?? id;

/** Falta algum pré-requisito? Devolve o texto do que falta (ou vazio). Inclui a especialização. */
export function missingRequirements(levels: SkillLevels, id: SkillId): string[] {
  const d = SKILL_BY_ID[id];
  const out = d.requires.filter((r) => lvOf(levels, r.id) < r.level).map((r) => `${SKILL_BY_ID[r.id].name} nv ${r.level}`);
  const chosen = d.branch ? chosenBranch(d.hero, levels) : undefined;
  if (chosen && chosen !== d.branch) out.push(`especialização ${branchName(d.hero, d.branch!)} (já escolheu ${branchName(d.hero, chosen)})`);
  return out;
}

/** Um passo do caminho até a habilidade desejada: subir `id` de `from` até `to`. */
export interface PathStep {
  id: SkillId;
  from: number;
  to: number;
  /** Pontos de habilidade e Zen que este passo custa. */
  points: number;
  zeni: number;
}
/** Caminho de pré-requisitos até o alvo (fecho transitivo dos requisitos). */
export interface PrereqPath {
  target: SkillId;
  /** Passos em ordem de compra (requisitos dos requisitos primeiro). Vazio = já desbloqueável. */
  steps: PathStep[];
  /** Totais do caminho (sem o alvo: ele continua sendo comprado à parte). */
  points: number;
  zeni: number;
  /** Motivos que impedem o caminho (vazio = caminho válido). */
  blocked: string[];
}

/**
 * Caminho automático até `id`: que níveis faltam, em que ordem e quanto custa no total.
 * O jogador nunca precisa calcular de cabeça — a UI mostra este caminho antes de confirmar.
 * Regras preservadas: sem o caminho todo não há desbloqueio; ramos de especialização
 * nunca são escolhidos sozinhos (caminho que cruza dois ramos sem escolha feita = bloqueado).
 */
export function prereqPath(levels: SkillLevels, hero: HeroKind, id: SkillId): PrereqPath {
  const steps: PathStep[] = [];
  const blocked: string[] = [];
  const seen = new Set<SkillId>();
  const need = (sid: SkillId, level: number): void => {
    const d = SKILL_BY_ID[sid];
    if (!d || seen.has(sid)) return;
    seen.add(sid);
    for (const r of d.requires) need(r.id, r.level);
    const cur = lvOf(levels, sid);
    const to = Math.min(level, d.maxLevel);
    if (to > cur) {
      let zeni = 0;
      for (let lv = cur; lv < to; lv++) zeni += skillZeniCost(sid, lv + 1);
      steps.push({ id: sid, from: cur, to, points: to - cur, zeni });
    } else if (level > d.maxLevel) blocked.push(`${d.name} só vai até o nível ${d.maxLevel}`);
  };
  const target = SKILL_BY_ID[id];
  if (!target || target.hero !== hero) {
    blocked.push('Habilidade inválida para este herói.');
    return { target: id, steps, points: 0, zeni: 0, blocked };
  }
  for (const r of target.requires) need(r.id, r.level);
  // especialização: o caminho nunca atravessa dois ramos sozinho (a escolha é do jogador)
  const branches = new Set([target.branch, ...steps.map((s) => SKILL_BY_ID[s.id].branch)].filter(Boolean) as string[]);
  const chosen = chosenBranch(hero, levels);
  if (chosen) {
    const invader = [...branches].find((b) => b !== chosen);
    if (invader) blocked.push(`especialização ${branchName(hero, invader)} (já escolheu ${branchName(hero, chosen)})`);
  } else if (branches.size > 1) {
    blocked.push(`escolha um ramo primeiro: ${[...branches].map((b) => branchName(hero, b)).join(' ou ')}`);
  }
  return { target: id, steps, points: steps.reduce((s, x) => s + x.points, 0), zeni: steps.reduce((s, x) => s + x.zeni, 0), blocked };
}

/** Zen para levar a habilidade ao nível `next`. */
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
