import { GAME_CONFIG } from './gameConfig';
import type { DamageSource } from '../core/sim/types';

/**
 * Árvores de habilidade das vocações (dado puro: nomes, posição, requisitos e números).
 * O comportamento na simulação está em core/archetypes/vocationEngine.ts; cada `behavior` é um dos
 * tipos que ele sabe executar. Ícones: public/icons/skills/catalogo.json (arte do dono, sem alteração).
 *
 * Tempo: os números de recarga e duração estão em TICKS (10 por segundo), como no resto do jogo.
 * Dano: valor base; a simulação multiplica pelo poder da classe (Força ou Inteligência, ver heroStats).
 */

/** Comportamentos que o motor de vocações executa. */
export type VocationBehavior =
  | 'melee' // golpe corpo a corpo no adjacente mais ferido (o básico é um desses)
  | 'charge' // avança até o inimigo e golpeia (atordoa)
  | 'line' // golpe em linha reta: todos os inimigos na linha
  | 'cone' // cone na direção com mais inimigos (pode gelar)
  | 'areaSelf' // área em volta da própria vocação (pode empurrar)
  | 'areaTarget' // área no grupo mais denso ao alcance (quadrado ou cruz)
  | 'bolt' // alvo único à distância, com efeitos extras (queimadura, veneno, gelo, dreno)
  | 'chain' // raio que salta de inimigo em inimigo
  | 'control' // controle mental: atordoa e puxa o inimigo mais forte em direção à vocação
  | 'trap' // armadilha no caminho da horda (mina)
  | 'shield' // escudo: um aliado, a área, ou a própria vocação
  | 'heal' // cura: o aliado mais ferido ao alcance, ou todos numa área
  | 'bless' // bênção: dano a mais para a party perto (ou para si)
  | 'guard' // redução de dano para si por um tempo (100% = imunidade)
  | 'fury' // fúria: recargas mais curtas por um tempo
  | 'blink' // salta para longe dos inimigos
  | 'auraGuard' // passiva: aliados perto recebem menos dano
  | 'reflect' // passiva: devolve parte do dano que sofre
  | 'lifesteal'; // passiva: cura parte do dano dos golpes corpo a corpo

/** Bônus passivos de atributo que somam em heroStats (ver attributes.computeStats). */
export interface VocationPassiveBonus {
  /** Vida máxima (fração: 0,1 = +10%). */
  hp: number;
  /** Dano de todas as habilidades e golpes (fração). */
  dmg: number;
  /** Chance de bloqueio (fração, com teto da Sorte/equipamento). */
  block: number;
  /** Chance de esquiva (fração). */
  dodge: number;
  /** Chance de crítico (fração). */
  crit: number;
  /** Dano crítico extra (fração, somada ao 150% base; separada da chance). */
  critDano?: number;
  /** Skill Haste (o único acelerador de recarga). */
  haste: number;
  /** Redução do dano recebido (fração). */
  reduce: number;
}

export interface VocationSkillSpec {
  id: string;
  name: string;
  /** Caminho do ícone em public/icons/ (sem extensão): arte do catálogo do dono. */
  icon: string;
  tier: 1 | 2 | 3;
  col: number;
  kind: 'active' | 'passive';
  maxLevel: number;
  /** Nível inicial (só o básico começa aprendido). */
  start: number;
  requires: { id: string; level: number }[];
  /** Comportamento na simulação. Ausente = só atributo (passiva de número). */
  behavior?: VocationBehavior;
  /** Tipo de dano que a habilidade causa (efeito e texto de combate). */
  src?: DamageSource;
  /** Números por nível (chaves lidas pelo motor). */
  num: (lv: number) => Record<string, number>;
  /** Bônus passivos por nível (só passivas de atributo). */
  stat?: (lv: number) => Partial<VocationPassiveBonus>;
  /** Texto curto do efeito (pt-BR), gerado dos números do nível. */
  effect: (n: Record<string, number>) => string;
  desc: string;
}

export interface VocationTreeSpec {
  /** Classe base que pode escolher esta vocação. */
  hero: 'warrior' | 'warlock';
  /** Ataque básico: sempre ativo, não usa slot de Mana. */
  basic: string;
  skills: VocationSkillSpec[];
}

// ---------- ajudantes de número (puro: só montam as curvas por nível) ----------
/** Valor que começa em `base` no nível 1 e cresce `step` a cada nível. */
const lin = (base: number, step: number) => (lv: number) => base + step * (lv - 1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ticks: number) => `${(ticks / 10).toFixed(1).replace('.', ',')} s`;
/** Dano/cura por nível (inteiro para o texto). */
const n0 = (v: number) => Math.round(v).toString();

const W = GAME_CONFIG.archetypes.warrior;
const L = GAME_CONFIG.archetypes.warlock;

/** Dano base de referência: o golpe do Guerreiro (Investida). */
const BASH = W.bash.damage;

// =====================================================================
// CRUSADO (2ª vocação do Guerreiro): espada e escudo sagrados
// =====================================================================
const CRUSADO: VocationTreeSpec = {
  hero: 'warrior',
  basic: 'corteCruzado',
  skills: [
    // ---- Tier 1 ----
    {
      id: 'corteCruzado', name: 'Corte Cruzado', icon: 'cruzado/corte-cruzado', tier: 1, col: 0, kind: 'active', maxLevel: 10, start: 1, requires: [],
      behavior: 'melee', src: 'bash',
      num: (lv) => ({ dmg: BASH - 2 + 1.5 * (lv - 1), cd: W.bash.cooldownTicks }),
      effect: (n) => `Dano ${n0(n.dmg)} · recarga ${sec(n.cd)}`,
      desc: 'Golpe básico da espada no inimigo colado mais ferido.',
    },
    {
      id: 'impactoDevoto', name: 'Impacto Devoto', icon: 'cruzado/impacto-devoto', tier: 1, col: 1, kind: 'active', maxLevel: 5, start: 0, requires: [],
      behavior: 'melee', src: 'bash',
      num: (lv) => ({ dmg: BASH + 2.5 * (lv - 1), cd: 19 - (lv - 1), stun: 8 + 2 * (lv - 1) }),
      effect: (n) => `Dano ${n0(n.dmg)} · atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'Golpe pesado e sagrado no inimigo colado: atordoa o que sobrar.',
    },
    {
      id: 'revidar', name: 'Revidar', icon: 'cruzado/revidar', tier: 1, col: 2, kind: 'passive', maxLevel: 5, start: 0, requires: [],
      behavior: 'reflect', src: 'reflect',
      num: (lv) => ({ pct: lin(0.15, 0.05)(lv) }),
      effect: (n) => `Devolve ${pct(n.pct)} do dano que sofre`,
      desc: 'Passiva: parte do dano que a vocação recebe volta para quem bateu.',
    },
    {
      id: 'determinacao', name: 'Determinação', icon: 'cruzado/determinacao', tier: 1, col: 3, kind: 'passive', maxLevel: 5, start: 0, requires: [],
      stat: (lv) => ({ hp: 0.04 * lv }),
      num: (lv) => ({ hp: 0.04 * lv }),
      effect: (n) => `Vida máxima +${pct(n.hp)}`,
      desc: 'Passiva: mais vida para ficar de pé na linha de frente.',
    },
    {
      id: 'escudoDeFe', name: 'Escudo de Fé', icon: 'cruzado/escudo-de-fe', tier: 1, col: 4, kind: 'active', maxLevel: 5, start: 0, requires: [],
      behavior: 'shield',
      num: (lv) => ({ absorb: lin(22, 8)(lv), ticks: lin(70, 10)(lv), range: 5, radius: 0, self: 0, cd: lin(110, -6)(lv) }),
      effect: (n) => `Absorve ${n0(n.absorb)} de dano no aliado mais ferido por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Uma barreira de luz no aliado mais ferido ao alcance: absorve o dano até quebrar.',
    },
    {
      id: 'soproDeLuz', name: 'Sopro de Luz', icon: 'cruzado/sopro-de-luz', tier: 1, col: 5, kind: 'passive', maxLevel: 5, start: 0, requires: [],
      behavior: 'lifesteal',
      num: (lv) => ({ pct: lin(0.06, 0.02)(lv) }),
      effect: (n) => `Cura ${pct(n.pct)} do dano dos golpes corpo a corpo`,
      desc: 'Passiva: cada golpe corpo a corpo devolve um pouco de vida.',
    },
    {
      id: 'forcaDivina', name: 'Força Divina', icon: 'cruzado/forca-divina', tier: 1, col: 6, kind: 'passive', maxLevel: 5, start: 0, requires: [],
      stat: (lv) => ({ dmg: 0.04 * lv }),
      num: (lv) => ({ dmg: 0.04 * lv }),
      effect: (n) => `Dano +${pct(n.dmg)} em tudo`,
      desc: 'Passiva: a fé aumenta o dano de todos os golpes e magias da vocação.',
    },
    // ---- Tier 2 ----
    {
      id: 'perfuracao', name: 'Perfuração', icon: 'cruzado/perfuracao', tier: 2, col: 0, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'corteCruzado', level: 3 }],
      behavior: 'line', src: 'pierce',
      num: (lv) => ({ dmg: 14 + 3 * (lv - 1), len: lv >= 4 ? 3 : 2, range: 3, cd: lin(22, -2)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} em cada inimigo numa linha de ${n.len} casas · recarga ${sec(n.cd)}`,
      desc: 'Estocada que atravessa a linha de inimigos à frente.',
    },
    {
      id: 'investida', name: 'Investida', icon: 'cruzado/investida', tier: 2, col: 1, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'impactoDevoto', level: 2 }],
      behavior: 'charge', src: 'bash',
      num: (lv) => ({ dmg: lin(14, 3)(lv), range: 4, stun: lin(6, 2)(lv), cd: lin(40, -3)(lv) }),
      effect: (n) => `Avança até ${n.range} casas, dano ${n0(n.dmg)} e atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'Parte para cima do inimigo a até 4 casas e golpeia com o escudo.',
    },
    {
      id: 'furiaSagrada', name: 'Fúria Sagrada', icon: 'cruzado/furia-sagrada', tier: 2, col: 2, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'revidar', level: 2 }],
      behavior: 'fury',
      num: (lv) => ({ ticks: lin(40, 8)(lv), cdMult: lin(0.7, -0.04)(lv), cd: lin(170, -6)(lv) }),
      effect: (n) => `Recargas ×${n.cdMult.toFixed(2).replace('.', ',')} por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Entra em fúria sagrada: os golpes e magias voltam muito mais rápido por alguns segundos.',
    },
    {
      id: 'auraDeProtecao', name: 'Aura de Proteção', icon: 'cruzado/aura-de-protecao', tier: 2, col: 3, kind: 'passive', maxLevel: 5, start: 0,
      requires: [{ id: 'determinacao', level: 2 }],
      behavior: 'auraGuard',
      num: (lv) => ({ cut: lin(0.06, 0.02)(lv), radius: lv >= 4 ? 3 : 2 }),
      effect: (n) => `Aliados a ${n.radius} casas recebem ${pct(n.cut)} menos de dano`,
      desc: 'Passiva: a presença da vocação protege os aliados em volta.',
    },
    {
      id: 'gritoDeGuerra', name: 'Grito de Guerra', icon: 'cruzado/grito-de-guerra', tier: 2, col: 4, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'escudoDeFe', level: 2 }],
      behavior: 'bless', src: 'spell',
      num: (lv) => ({ amp: lin(0.08, 0.03)(lv), ticks: lin(80, 10)(lv), radius: 6, self: 0, cd: lin(180, -10)(lv) }),
      effect: (n) => `Dano +${pct(n.amp)} para a party a ${n.radius} casas por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Um brado que dá dano a mais para toda a party por perto.',
    },
    {
      id: 'restauracao', name: 'Restauração', icon: 'cruzado/restauracao', tier: 2, col: 5, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'soproDeLuz', level: 2 }],
      behavior: 'heal',
      num: (lv) => ({ amount: lin(22, 7)(lv), range: 6, radius: 0, cd: lin(40, -2)(lv) }),
      effect: (n) => `Cura ${n0(n.amount)} do aliado mais ferido a ${n.range} casas · recarga ${sec(n.cd)}`,
      desc: 'Cura o aliado mais ferido ao alcance.',
    },
    {
      id: 'imunidade', name: 'Imunidade', icon: 'cruzado/imunidade', tier: 2, col: 6, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'escudoDeFe', level: 3 }],
      behavior: 'guard',
      num: (lv) => ({ cut: 1, ticks: lin(20, 5)(lv), cd: lin(260, -20)(lv) }),
      effect: (n) => `Imune a todo dano por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Por alguns segundos nada atravessa a fé da vocação.',
    },
    // ---- Tier 3 ----
    {
      id: 'ondaDeChoque', name: 'Onda de Choque', icon: 'cruzado/onda-de-choque', tier: 3, col: 0, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'investida', level: 3 }, { id: 'impactoDevoto', level: 3 }],
      behavior: 'areaSelf', src: 'shock',
      num: (lv) => ({ dmg: lin(16, 5)(lv), radius: lv >= 4 ? 3 : 2, stun: lin(8, 2)(lv), cd: lin(115, -6)(lv) }),
      effect: (n) => `Raio ${n.radius} · dano ${n0(n.dmg)} · atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'Golpe no chão: dano em área e atordoa quem estiver em volta.',
    },
    {
      id: 'marteloDeDeus', name: 'Martelo de Deus', icon: 'cruzado/martelo-de-deus', tier: 3, col: 1, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'perfuracao', level: 3 }],
      behavior: 'areaSelf', src: 'shock',
      num: (lv) => ({ dmg: lin(30, 10)(lv), radius: 1, stun: lin(10, 3)(lv), knock: 1, cd: lin(130, -8)(lv) }),
      effect: (n) => `Raio ${n.radius} · dano ${n0(n.dmg)} · empurra e atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'Martelo que cai com força divina: empurra quem está colado e atordoa.',
    },
    {
      id: 'cruzDaJustica', name: 'Cruz da Justiça', icon: 'cruzado/cruz-da-justica', tier: 3, col: 2, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'gritoDeGuerra', level: 3 }],
      behavior: 'areaTarget', src: 'spell',
      num: (lv) => ({ dmg: lin(22, 8)(lv), range: 6, radius: 2, cross: 1, minTargets: 2, stun: lin(6, 2)(lv), cd: lin(125, -7)(lv) }),
      effect: (n) => `Pilares em cruz sobre o grupo mais denso: dano ${n0(n.dmg)} · atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'Pilares de luz em cruz caem sobre o grupo mais denso ao alcance.',
    },
    {
      id: 'lancaSagrada', name: 'Lança Sagrada', icon: 'cruzado/lanca-sagrada', tier: 3, col: 3, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'perfuracao', level: 3 }, { id: 'forcaDivina', level: 2 }],
      behavior: 'line', src: 'pierce',
      num: (lv) => ({ dmg: lin(18, 4)(lv), len: 6, range: 6, cd: lin(80, -5)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} em todos os inimigos de uma linha de ${n.len} casas · recarga ${sec(n.cd)}`,
      desc: 'Lança de luz que atravessa a horda inteira numa linha longa.',
    },
    {
      id: 'circuloDeProtecao', name: 'Círculo de Proteção', icon: 'cruzado/circulo-de-protecao', tier: 3, col: 4, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'auraDeProtecao', level: 3 }],
      behavior: 'shield', src: 'spell',
      num: (lv) => ({ absorb: lin(14, 5)(lv), ticks: lin(80, 10)(lv), range: 0, radius: 2, self: 0, cd: lin(150, -8)(lv) }),
      effect: (n) => `Escudo de ${n0(n.absorb)} em cada aliado a ${n.radius} casas por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Um círculo sagrado que cobre todos os aliados perto com escudo.',
    },
    {
      id: 'redencao', name: 'Redenção', icon: 'cruzado/redencao', tier: 3, col: 5, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'restauracao', level: 3 }, { id: 'imunidade', level: 2 }],
      behavior: 'heal',
      num: (lv) => ({ pct: lin(0.12, 0.04)(lv), amount: 0, range: 0, radius: 3, cd: lin(240, -20)(lv) }),
      effect: (n) => `Cura ${pct(n.pct)} da vida máxima de todos os aliados a ${n.radius} casas · recarga ${sec(n.cd)}`,
      desc: 'Cura em massa: a fé devolve parte da vida de todos os aliados perto.',
    },
  ],
};

// =====================================================================
// HYPNOMANCER (2ª forma da Bruxa): controle mental e magia elemental
// =====================================================================
const HYPNO: VocationTreeSpec = {
  hero: 'warlock',
  basic: 'ataqueMagico',
  skills: [
    // ---- Tier 1 ----
    {
      id: 'ataqueMagico', name: 'Ataque Mágico', icon: 'professor/ataque-magico', tier: 1, col: 0, kind: 'active', maxLevel: 10, start: 1, requires: [],
      behavior: 'bolt', src: 'bolt',
      num: (lv) => ({ dmg: L.drain.damage + 1.5 * (lv - 1), range: 6, cd: L.drain.cooldownTicks }),
      effect: (n) => `Dano ${n0(n.dmg)} · alcance ${n.range} · recarga ${sec(n.cd)}`,
      desc: 'Básico: projétil de energia no inimigo mais próximo com linha de visão.',
    },
    {
      id: 'bolaDeFogo', name: 'Bola de Fogo', icon: 'professor/bola-de-fogo', tier: 1, col: 1, kind: 'active', maxLevel: 5, start: 0, requires: [],
      behavior: 'bolt', src: 'bolt',
      num: (lv) => ({ dmg: lin(12, 3)(lv), range: 6, burn: lin(3, 1)(lv), burnTicks: lin(30, 8)(lv), cd: lin(22, -1)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} · queima ${n0(n.burn)} por pulso por ${sec(n.burnTicks)} · recarga ${sec(n.cd)}`,
      desc: 'Esfera de fogo que deixa o alvo queimando.',
    },
    {
      id: 'gelo', name: 'Gelo', icon: 'professor/gelo', tier: 1, col: 2, kind: 'active', maxLevel: 5, start: 0, requires: [],
      behavior: 'bolt', src: 'bolt',
      num: (lv) => ({ dmg: lin(8, 2)(lv), range: 6, freeze: lin(15, 4)(lv), cd: lin(30, -2)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} · congela ${sec(n.freeze)} · recarga ${sec(n.cd)}`,
      desc: 'Um raio de gelo que prende o inimigo no lugar.',
    },
    {
      id: 'veneno', name: 'Veneno', icon: 'professor/veneno', tier: 1, col: 3, kind: 'active', maxLevel: 5, start: 0, requires: [],
      behavior: 'bolt', src: 'poison',
      num: (lv) => ({ dmg: lin(6, 2)(lv), range: 6, poison: lin(3, 2)(lv), poisonTicks: lin(40, 8)(lv), cd: lin(26, -2)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} · veneno ${n0(n.poison)} por pulso por ${sec(n.poisonTicks)} · recarga ${sec(n.cd)}`,
      desc: 'Envenena o alvo: dano contínuo que não para até o fim do efeito.',
    },
    {
      id: 'escudoMagico', name: 'Escudo Mágico', icon: 'professor/escudo-magico', tier: 1, col: 4, kind: 'passive', maxLevel: 5, start: 0, requires: [],
      stat: (lv) => ({ block: 0.03 * lv, reduce: 0.04 * lv }),
      num: (lv) => ({ block: 0.03 * lv, reduce: 0.04 * lv }),
      effect: (n) => `Bloqueio +${pct(n.block)} · dano recebido −${pct(n.reduce)}`,
      desc: 'Passiva: uma película mágica aumenta o bloqueio e reduz o dano que chega.',
    },
    {
      id: 'controleMental', name: 'Controle Mental', icon: 'professor/controle-mental', tier: 1, col: 5, kind: 'active', maxLevel: 5, start: 0, requires: [],
      behavior: 'control', src: 'spell',
      num: (lv) => ({ stun: lin(10, 3)(lv), pull: 2, range: 6, cd: lin(120, -8)(lv) }),
      effect: (n) => `Atordoa ${sec(n.stun)} e puxa o inimigo mais forte (sem chefe) até a vocação · recarga ${sec(n.cd)}`,
      desc: 'Domina a mente do inimigo mais forte: ele para e é puxado na direção da vocação.',
    },
    {
      id: 'amplificarMagia', name: 'Amplificar Magia', icon: 'professor/amplificar-magia', tier: 1, col: 6, kind: 'passive', maxLevel: 5, start: 0, requires: [],
      stat: (lv) => ({ dmg: 0.05 * lv }),
      num: (lv) => ({ dmg: 0.05 * lv }),
      effect: (n) => `Dano +${pct(n.dmg)} em tudo`,
      desc: 'Passiva: a magia da vocação sai mais forte.',
    },
    // ---- Tier 2 ----
    {
      id: 'raio', name: 'Raio', icon: 'professor/raio', tier: 2, col: 0, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'bolaDeFogo', level: 3 }],
      behavior: 'chain', src: 'storm',
      num: (lv) => ({ dmg: lin(12, 4)(lv), jumps: 1 + lv, reach: 2, range: 6, fall: 0.8, cd: lin(80, -5)(lv) }),
      effect: (n) => `${n.jumps} saltos · dano ${n0(n.dmg)} (cai a cada salto) · recarga ${sec(n.cd)}`,
      desc: 'Um raio que salta de inimigo em inimigo.',
    },
    {
      id: 'soproElemental', name: 'Sopro Elemental', icon: 'professor/sopro-elemental', tier: 2, col: 1, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'bolaDeFogo', level: 2 }],
      behavior: 'cone', src: 'spell',
      num: (lv) => ({ dmg: lin(10, 3)(lv), range: 3, halfAngle: 50, chill: lin(20, 5)(lv), cd: lin(60, -4)(lv) }),
      effect: (n) => `Cone de ${n.range} casas · dano ${n0(n.dmg)} · gela ${sec(n.chill)} · recarga ${sec(n.cd)}`,
      desc: 'Sopro de energia elemental em cone: quem é atingido fica gelado.',
    },
    {
      id: 'teleportar', name: 'Teleportar', icon: 'professor/teleportar', tier: 2, col: 2, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'gelo', level: 2 }],
      behavior: 'blink', src: 'spell',
      num: (lv) => ({ minDist: 3, range: 4, cd: lin(90, -6)(lv) }),
      effect: (n) => `Salta até ${n.range} casas para longe dos inimigos · recarga ${sec(n.cd)}`,
      desc: 'Some num estalo e reaparece longe dos inimigos.',
    },
    {
      id: 'drenoDeMana', name: 'Dreno de Mana', icon: 'professor/dreno-de-mana', tier: 2, col: 3, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'controleMental', level: 2 }],
      behavior: 'bolt', src: 'bolt',
      num: (lv) => ({ dmg: lin(9, 3)(lv), range: 5, drain: lin(0.35, 0.05)(lv), cd: lin(30, -2)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} · cura ${pct(n.drain)} do dano · recarga ${sec(n.cd)}`,
      desc: 'Drena a energia do inimigo: parte do dano volta como vida para a vocação.',
    },
    {
      id: 'campoDeForca', name: 'Campo de Força', icon: 'professor/campo-de-forca', tier: 2, col: 4, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'escudoMagico', level: 2 }],
      behavior: 'guard', src: 'spell',
      num: (lv) => ({ cut: lin(0.5, 0.05)(lv), ticks: lin(50, 10)(lv), cd: lin(180, -10)(lv) }),
      effect: (n) => `Reduz ${pct(n.cut)} do dano recebido por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Um campo que amortece o golpe por alguns segundos.',
    },
    {
      id: 'instalarArmadilha', name: 'Instalar Armadilha', icon: 'professor/instalar-armadilha', tier: 2, col: 5, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'veneno', level: 2 }],
      behavior: 'trap', src: 'trap',
      num: (lv) => ({ dmg: lin(26, 8)(lv), range: 7, radius: 1, stun: lin(10, 2)(lv), cd: lin(60, -4)(lv) }),
      effect: (n) => `Mina de ${n0(n.dmg)} em área ${n.radius * 2 + 1}×${n.radius * 2 + 1} · atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'Deixa uma mina mágica no caminho da horda: explode ao ser pisada.',
    },
    {
      id: 'conjuracaoRapida', name: 'Conjuração Rápida', icon: 'professor/conjuracao-rapida', tier: 2, col: 6, kind: 'passive', maxLevel: 5, start: 0,
      requires: [{ id: 'amplificarMagia', level: 2 }],
      stat: (lv) => ({ crit: 0.02 * lv }),
      num: (lv) => ({ crit: 0.02 * lv }),
      effect: (n) => `Chance de crítico +${pct(n.crit)}`,
      desc: 'Passiva: a conjuração precisa e rápida acerta mais golpes críticos.',
    },
    // ---- Tier 3 ----
    {
      id: 'meteoro', name: 'Meteoro', icon: 'professor/meteoro', tier: 3, col: 0, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'raio', level: 3 }, { id: 'bolaDeFogo', level: 4 }],
      behavior: 'areaTarget', src: 'meteor',
      num: (lv) => ({ dmg: lin(36, 12)(lv), range: 7, radius: 1, cross: 0, minTargets: 2, stun: 0, cd: lin(110, -6)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} numa área ${n.radius * 2 + 1}×${n.radius * 2 + 1} do grupo mais denso · recarga ${sec(n.cd)}`,
      desc: 'Um meteoro cai sobre o grupo mais denso ao alcance.',
    },
    {
      id: 'terremoto', name: 'Terremoto', icon: 'professor/terremoto', tier: 3, col: 1, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'soproElemental', level: 3 }],
      behavior: 'areaSelf', src: 'shock',
      num: (lv) => ({ dmg: lin(20, 6)(lv), radius: 2, stun: lin(12, 3)(lv), knock: 0, cd: lin(110, -6)(lv) }),
      effect: (n) => `Raio ${n.radius} · dano ${n0(n.dmg)} · atordoa ${sec(n.stun)} · recarga ${sec(n.cd)}`,
      desc: 'O chão racha em volta da vocação: dano e atordoamento para quem estiver perto.',
    },
    {
      id: 'explosaoArcana', name: 'Explosão Arcana', icon: 'professor/explosao-arcana', tier: 3, col: 2, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'drenoDeMana', level: 3 }],
      behavior: 'areaTarget', src: 'arcane',
      num: (lv) => ({ dmg: lin(30, 10)(lv), range: 6, radius: 2, cross: 0, minTargets: 2, stun: 0, cd: lin(140, -8)(lv) }),
      effect: (n) => `Dano ${n0(n.dmg)} numa área ${n.radius * 2 + 1}×${n.radius * 2 + 1} do grupo mais denso · recarga ${sec(n.cd)}`,
      desc: 'Explosão de energia arcana sobre o grupo mais denso.',
    },
    {
      id: 'cicloArcano', name: 'Ciclo Arcano', icon: 'professor/ciclo-arcano', tier: 3, col: 3, kind: 'passive', maxLevel: 5, start: 0,
      requires: [{ id: 'teleportar', level: 2 }],
      stat: (lv) => ({ haste: 0.03 * lv }),
      num: (lv) => ({ haste: 0.03 * lv }),
      effect: (n) => `Skill Haste +${pct(n.haste)}`,
      desc: 'Passiva: o ciclo de magia encurta as recargas das habilidades.',
    },
    {
      id: 'barreira', name: 'Barreira', icon: 'professor/barreira', tier: 3, col: 4, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'campoDeForca', level: 3 }],
      behavior: 'shield', src: 'spell',
      num: (lv) => ({ absorb: lin(30, 10)(lv), ticks: lin(90, 10)(lv), range: 0, radius: 0, self: 1, cd: lin(150, -10)(lv) }),
      effect: (n) => `Absorve ${n0(n.absorb)} de dano em si por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'Uma barreira de mana que envolve a própria vocação.',
    },
    {
      id: 'mestreDaMagia', name: 'Mestre da Magia', icon: 'professor/mestre-da-magia', tier: 3, col: 5, kind: 'active', maxLevel: 5, start: 0,
      requires: [{ id: 'explosaoArcana', level: 2 }, { id: 'cicloArcano', level: 2 }],
      behavior: 'bless', src: 'spell',
      num: (lv) => ({ amp: lin(0.25, 0.05)(lv), ticks: lin(120, 20)(lv), radius: 0, self: 1, cd: lin(480, -40)(lv) }),
      effect: (n) => `Dano +${pct(n.amp)} em si por ${sec(n.ticks)} · recarga ${sec(n.cd)}`,
      desc: 'A vocação se entrega por inteiro: todo o dano sai mais forte por um tempo.',
    },
  ],
};

/** Árvores por id de vocação (o id é o mesmo de config/vocations.ts). */
export const VOCATION_TREES: Record<string, VocationTreeSpec> = {
  crusado: CRUSADO,
  hypnomancer: HYPNO,
};
