import type { Vec2 } from '../core/grid/types';
import { barriersAround, type PartySetup } from './gameConfig';

/**
 * Zonas como DADOS (MAP_CONFIG): mapa ASCII + tamanho + spawns fixos + objetos + setup padrão +
 * composição da onda + tema visual. Para criar uma zona nova basta adicionar uma entrada aqui
 * (e, se quiser um visual novo, um construtor de cenário para o `theme`).
 *
 * Os mapas de combate têm 45 × 39 tiles (3× os 15 × 13 antigos). `widthTiles`/`heightTiles`
 * precisam bater com o mapa — a grade SQM, o pathfinding e o render escalam sozinhos.
 * Os mapas foram gerados a partir dos antigos (ampliados e "orgânicos") e agora são fixos.
 *
 * Legenda (uma linha por fileira; y = 0 é o lado de onde a horda vem):
 *   .  chão                                   ,  chão de praça (pedra)
 *   :  chão com neblina densa (esconde inimigos de longe)
 *   r  raízes expostas (chão lento: custa mais para andar)
 *   w  poça d'água (visual; reflete a luz)
 *   g  portão da cidade (os inimigos que chegam aqui invadem a cidade)
 *   ~  vazio/água (não anda, mas NÃO bloqueia visão)
 *   P  parapeito (bloqueia)                    B  braseiro (bloqueia)
 *   L  poste de lanterna (bloqueia)            c  carroça virada (bloqueia)
 *   x  escombros (bloqueia)                    o  barris/caixotes (bloqueia)
 *   #  muro (bloqueia)                         W  muralha da cidade (bloqueia)
 *   T  árvore (bloqueia)                       R  rocha (bloqueia)
 *   K  cacto (bloqueia)                        U  coluna em ruínas (bloqueia)
 *   S  tronco seco (bloqueia)                  A  tenda/abrigo (bloqueia)
 *   M  palmeira (bloqueia)
 *
 * Objetos interativos (`objects`) ficam em tiles fixos por cima do chão; o que cada tipo faz
 * está em core/sim/objects.ts (e os números em GAME_CONFIG.objects).
 */
export type ZoneTheme = 'bridge' | 'town' | 'forest' | 'plains' | 'desert' | 'mountain' | 'ash';
export type PropKind =
  | 'parapet'
  | 'brazier'
  | 'lantern'
  | 'cart'
  | 'rubble'
  | 'barrels'
  | 'wall'
  | 'cityWall'
  | 'tree'
  | 'rock'
  | 'cactus'
  | 'ruin'
  | 'stump'
  | 'tent'
  | 'palm';

/** Tipos de objeto interativo (dados em GAME_CONFIG.objects, regras em core/sim/objects.ts). */
export type MapObjectType = 'cart' | 'oilBarrel' | 'torch' | 'roots' | 'altar' | 'sandColumn' | 'unstableRuin' | 'dryOasis' | 'campfire' | 'shieldWall';

export interface MapObjectDef {
  type: MapObjectType;
  x: number;
  y: number;
  /** Tamanho em tiles (padrão 1 × 1). */
  w?: number;
  h?: number;
}

export interface WaveMix {
  kind: string;
  weight: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  theme: ZoneTheme;
  /** Tamanho da grade (tem que bater com `map`). */
  widthTiles: number;
  heightTiles: number;
  map: string[];
  /** Pontos de spawn fixos da zona (2 nos mapas atuais; o motor aceita N e alterna entre eles). */
  spawnPoints: Vec2[];
  /** Fração da horda que sai do 1º spawn (padrão: GAME_CONFIG.wave.spawnSplit). */
  spawnSplit?: number;
  objects: MapObjectDef[];
  defaultSetup: PartySetup;
  wave: { count: number; spawnIntervalTicks: number; seed: number; mix: WaveMix[]; boss?: string; bossDelayTicks: number };
  /**
   * Mapa PINTADO (arte do dono): a imagem é o chão inteiro da zona e a grade só diz onde se anda.
   * Sem cenário 3D por cima. `fx` = pontos animados na imagem (0..1 da largura/altura):
   * cachoeiras (névoa), tochas (brilho) e o portal.
   */
  painted?: {
    image: string;
    fx?: { mist?: [number, number][]; torches?: [number, number][]; glow?: [number, number, number][] };
  };
}

const PROP_OF: Record<string, PropKind | undefined> = {
  P: 'parapet',
  B: 'brazier',
  L: 'lantern',
  c: 'cart',
  x: 'rubble',
  o: 'barrels',
  '#': 'wall',
  W: 'cityWall',
  T: 'tree',
  R: 'rock',
  K: 'cactus',
  U: 'ruin',
  S: 'stump',
  A: 'tent',
  M: 'palm',
};

/** Tipo de chão por caractere do mapa. */
export type GroundKind = 'plain' | 'plaza' | 'fog' | 'roots' | 'puddle' | 'gate';
const GROUND_OF: Record<string, GroundKind | undefined> = { '.': 'plain', ',': 'plaza', ':': 'fog', r: 'roots', w: 'puddle', g: 'gate' };

// Setup padrão de uma zona: guerreiro, mago e o centro das 3 barreiras.
const setup = (wx: number, wy: number, mx: number, my: number, bx: number, by: number, o: PartySetup['barriers'][number]['orientation'] = 'H'): PartySetup => ({
  members: [
    { archetype: 'warrior', x: wx, y: wy },
    { archetype: 'mage', x: mx, y: my },
  ],
  barriers: barriersAround(bx, by, o),
});
const UNDEAD: WaveMix[] = [
  { kind: 'grunt', weight: 56 },
  { kind: 'runner', weight: 26 },
  { kind: 'brute', weight: 12 },
  { kind: 'necro', weight: 6 },
];
const FAST: WaveMix[] = [
  { kind: 'grunt', weight: 42 },
  { kind: 'runner', weight: 40 },
  { kind: 'brute', weight: 12 },
  { kind: 'necro', weight: 6 },
];
const HEAVY: WaveMix[] = [
  { kind: 'grunt', weight: 46 },
  { kind: 'runner', weight: 20 },
  { kind: 'brute', weight: 26 },
  { kind: 'necro', weight: 8 },
];
const wave = (seed: number, mix: WaveMix[], count = 40, interval = 5, bossDelay = 30) => ({ count, spawnIntervalTicks: interval, seed, mix, boss: 'boss', bossDelayTicks: bossDelay });

export const ZONES: Record<string, ZoneDef> = {
  /** Zona inicial: a ponte de pedra e a praça diante dos portões de Valdrec. Spawn distante (fim da ponte) e próximo (cais do rio). */
  bridge: {
    id: 'bridge',
    name: 'Ponte da Cidade',
    theme: 'bridge',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~B...............B~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P.xx............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P.x.............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P............xx.P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~B...............B~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P.x.............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P..x............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~B...............B~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~P...............P~~~~~~~~~~~~~~',
      '~PPPPPPPPPPPPPP...............PPPPPPPPPPPPPP~',
      '~L,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,L~',
      '~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~',
      ',,,,,,,,,,B,,,,,,,,,,,,,,,,,,,,,,,B,,,,,,,,,~',
      ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~',
      '~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~',
      '~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~',
      '~,,,,,,,,,,,,,,,,,,#,,,,,,,,,,,,,,,,,,,,,,,,~',
      '~,,,,,,,,,,,,,,,,,##,,,,,,,,,,,,,,,,,,,,,,,,~',
      '~L,,,,,,,,,,,,,,####,,,,,####,,,,,,,,,,,,,,L~',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 22, y: 0 }, { x: 0, y: 31 }],
    spawnSplit: 0.65,
    objects: [
      { type: 'cart', x: 25, y: 4, h: 2 },
      { type: 'oilBarrel', x: 19, y: 15 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: {
      count: 160,
      spawnIntervalTicks: 6,
      seed: 1337,
      mix: [
        { kind: 'grunt', weight: 62 },
        { kind: 'runner', weight: 26 },
        { kind: 'brute', weight: 12 },
      ],
      boss: 'boss',
      bossDelayTicks: 30,
    },
  },
  /** Zona antiga (vila com muro em ruínas) — mantida para uso futuro. */
  town: {
    id: 'town',
    name: 'Vila',
    theme: 'town',
    widthTiles: 15,
    heightTiles: 13,
    map: [
      '...............',
      '...............',
      '...............',
      '...............',
      '...............',
      '####.......####',
      '...............',
      '...............',
      '...............',
      '...............',
      '...............',
      '...............',
      'WWWWgggggggWWWW',
    ],
    spawnPoints: [{ x: 3, y: 0 }, { x: 11, y: 0 }],
    objects: [],
    defaultSetup: setup(9, 6, 6, 10, 6, 5),
    wave: { count: 40, spawnIntervalTicks: 5, seed: 1337, mix: [{ kind: 'grunt', weight: 1 }], bossDelayTicks: 0 },
  },
};

// ---------------- Mapa pintado oficial: Floresta Serena (80 × 40) ----------------
/**
 * Arte do dono (public/maps/floresta_serena.webp) como chão. A horda sai do Portal Antigo (leste)
 * e tem dois caminhos até a vila (oeste): a ponte de pedra (norte) e a ponte de madeira (sul).
 * Os dois caminhos se encontram no pátio da vila (a trilha da margem sobe da ponte de madeira).
 * ~ = rio (não bloqueia flechas), T = mata/rocha/ruína, g = porta da vila (a cidade).
 */
ZONES.serene = {
  id: 'serene',
  name: 'Floresta Serena',
  theme: 'forest',
  widthTiles: 80,
  heightTiles: 40,
  map: [
      'TTTTTTTTTTT~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TTTTTTT..............TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TTTTTTT..............TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TT...................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~~TT...................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT~~~~~~~~......................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTT......TTTTT...............TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT.....TTT~~~~TTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT.....TTT~~~~TTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT.....TTT~~~~TTTTTTTTTTT.......TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT.....TTT~~~~TTTTTTTTTTT.......TTTTT...........................TTTTTT',
      'TTTTTTTTTT.......TTT~~~~TTTTTTTTTTT.......TTTTT...........................TTTTTT',
      'TTTTTTTTTT......TTTT~~~~TTTTTTTTTTT.......................................TTTTTT',
      'TTTTTTTTTT......TTTT~~~~TTTTTTTTTTT.......................................TTTTTT',
      'TTTTTTTTTT......TTTT~~~~TTTTTTTTTTT.......................................TTTTTT',
      'TTTTTT..........TTTT~~~~TTTTTTTTTTTTTTTTT........TTT......................TTTTTT',
      'TTTTTg......TTTT~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTT...................TTTTTTTTTT',
      'TTTTTg......TTTT~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTT....................TTTTTTTTTT',
      'TTTTTg......TTTT~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTT....................TTTTTTTTTT',
      'TTTTTg......TTTT~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTT....................TTTTTTTTTT',
      'TTTTTg......TTTT~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTT....................TTTTTTTTTT',
      'TTTTTTT....TTTTT~~~~~~~~~~~~~TTTTTTTT.................................TTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~~~~~~~~~TTT......................................TTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~~TTTTTTTTTT......................................TTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~~TTTTTTTTTT......................................TTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~~TTTTTTTTTT......................................TTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~~TT..........................................TTTTTTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~~TT.....................................TTTTTTTTTTTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~........................................TTTTTTTTTTTTTTTTTTT',
      'TTTTTTT....T~~~~~~~~~........................................TTTTTTTTTTTTTTTTTTT',
      'TTTTTTT....T~~~~.........TTTTTTT.............................TTTTTTTTTTTTTTTTTTT',
      'TTTTTT...............~TTTTTTTTTT.............................TTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........~~~~~~TTTTTTTTTT.............TTTT...........TTTTTTTTTTTTTTTTTTTT',
      'TTTTTT....~~~~~~~~~~~~TTTTTTTTTT.............TTTT.T.........TTTTTTTTTTTTTTTTTTTT',
      'TTTTTTT...~~~~~~~~~~~~TTTTTTTTTT.............TTTT.T.........TTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTT~~~~~~~~~~~~TTTTTTTTTT.............TTTT.T.........TTTTTTTTTTTTTTTTTTTT',
  ],
  spawnPoints: [{ x: 69, y: 15 }, { x: 71, y: 16 }],
  objects: [],
  defaultSetup: {
    members: [
      { archetype: 'warrior', x: 10, y: 20 },
      { archetype: 'mage', x: 7, y: 22 },
    ],
    // ponte de pedra (norte), trilha da margem (sul) e a descida até o pátio
    barriers: [{ x: 24, y: 9, orientation: 'V' }, { x: 9, y: 29, orientation: 'H' }, { x: 13, y: 14, orientation: 'H' }],
  },
  wave: wave(1601, UNDEAD, 60, 3),
  painted: {
    image: 'maps/floresta_serena.webp',
    fx: {
      // cachoeiras (névoa subindo) e tochas da ponte/vila (posições na imagem, 0..1)
      mist: [[0.28, 0.5], [0.2, 0.75]],
      torches: [[0.215, 0.29], [0.335, 0.18], [0.078, 0.6], [0.135, 0.88], [0.83, 0.3], [0.924, 0.374]],
      glow: [[0.89, 0.27, 0x5a8cff]],
    },
  },
};

// ---------------- Zonas das regiões do mapa-múndi (45 × 39) ----------------
Object.assign(ZONES, {
  crookedWood: {
    id: 'crookedWood',
    name: 'Bosque Torto',
    theme: 'forest',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'TTTTTT.................................TTTTTT',
      'TTTTTT.............S...................TTTTTT',
      'TTTTTT.................................TTTTTT',
      'TTTTT.....................................TTT',
      'TTTT.....................................TTTT',
      'TTTr.....................................TTTT',
      'TT.........R.......................w......TTT',
      'TT................................Sw.....TTTT',
      'TT..............T.........................TTT',
      'TTTT.::::::....TT.TT...................T.TTTT',
      'TTTTT::::::::..TTTT...T.............TTTrT.TTT',
      'TTTT::::::::::TT.TTTTrT......TTTTT..TTT.r.TTT',
      'TTT:::::::::::.T.TTTTTTT.....TTTTT.TTTT..TTTT',
      'TTT.::::::::::.T.TTTTTTTT....TTTTT..TTT...TTT',
      'TTTT:::::::::.....TTTTTTTT...TTTTT..TTT...TTT',
      'TTTr.:::::::......TTTTTTTT...TTTTT...T...TTTT',
      'TTT.....:.....T.S..TTTTTT.......T....:....TTT',
      'TTT.Tr.......TTTT.TTTTT............::T:::..TT',
      'TTTTTTTT.TrTTTTTTTTTT.T..........:::TTTT:TTTT',
      'TTTTTTTTTr.TTTTTTTTT..T..........:T:TTTTTTTTT',
      'TTTTTTTTT...TTTTTTTTT............T:TTTTTTTTTT',
      'TTTTTTTT....TTT.TTTTTTT....w....::::T:TTTTTTT',
      'TTTTTT........T..TTTTTT....w.....:::::TTTTTTT',
      'TTTTTT...........TTTTTT............::::TTTTTT',
      'TTTT.r...........wTTTTT.............:::..rTTT',
      'TTT..............w.TTT.ww.................TTT',
      'TT.................R....................rTTTT',
      'TTTT....................ww...............rTTT',
      'TTT.................ww..................rTTTT',
      'TTT......................................rTTT',
      'TTTT.....~~~~~~...........................TTT',
      'TTT......~~~~~~...........................TTT',
      'TT.......~~~~~~.............w............TTTT',
      'TTTT.....~~~~~~.............w.............TTT',
      'TTT......~~~~~~................o..........TTT',
      'TTT......~~~~~~....#......................TTT',
      'TTTTTT............##...................TTTTTT',
      'TTTTTT..........####.....####..........TTTTTT',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'torch', x: 31, y: 21 },
      { type: 'roots', x: 27, y: 18, w: 3 },
      { type: 'altar', x: 21, y: 36 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(2101, UNDEAD, 250, 7),
  },
  whisperWood: {
    id: 'whisperWood',
    name: 'Floresta dos Sussurros',
    theme: 'forest',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'TTTTTTTTT...........................TTTTTTTTT',
      'TTTTTTTTT...........................TTTTTTTTT',
      'TTTTTTTTT...........................TTTTTTTTT',
      'TTTTTT...........T.T..................TTT.TTT',
      'TTTTT...........TTTT...................rr.TTT',
      'TTTT.T.........TTTTTT....................TTTT',
      'TTTT.r...T.....TTTTTTTr...................TTT',
      'TTTT.TTTTTT...TTTTTTTTT........::::::.....TTT',
      'TTTr.TTTTTTT...TTTTTTTTTTT....:::::::::..TTTT',
      'TTr..TTTTTTTT......TTTTTTT....:::::::::..TTTT',
      'TTT..TTTTTTT......rTTTTTTT....::::::::::.TTTT',
      'TTT..TTTTTTT....ww...TT....T..:::::::::r.TTTT',
      'TTT..T..T..:............TTTTTT::::::T:.TTTTTT',
      'TTTTTT.::::::::.........TTTTTTTT:::::T..TTTTT',
      'TTTTTT::::::::::........T.TTTTTTT:T....TTTTTT',
      'TTTTTTTT::::::::...........TTTwTTTT..rTTTTTTT',
      'TTTTTTTTT::::::::...........TTwT.TTT..TTTTTTT',
      'TTTTTTTTT::::::::................TTTT.TTTTTTT',
      'TTTTTTTTTT:::::.................TTTTTTTTTTTTT',
      'TTTTTTTTTTT::::................TTTTTTTTTTTTTT',
      'TTTTTTTTTT...............w.....TTTTT.TTTTTTTT',
      'TTTTTTTT.................w....TTTT...TTTTTTTT',
      'TTTTTTTTTT.....................TTT...TTTTTTTT',
      'TTTTTTTTTT.....................TT...TrTTTTTTT',
      'TTTTTTTTTTT.T...R..............ww......TTTTTT',
      'TTTTTTTTTTTTT...R......................TTTTTT',
      'TTT.rTTTTTTTTT.R.....................wwTTTTTT',
      'TTT...TTTTTTT........................TTTTrTTT',
      'TT.....TTTTT..........................TT..TTT',
      'TTTT......................................TTT',
      'TTT......................................TTTT',
      'TTTT...............A......................TTT',
      'TTT...............................ww.......TT',
      'TT........................................TTT',
      'TTTT......................................TTT',
      'TTT................#......................TTT',
      'TTTTTTTTT.........##................TTTTTTTTT',
      'TTTTTTTTT.......####.....####.......TTTTTTTTT',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'torch', x: 17, y: 17 },
      { type: 'roots', x: 18, y: 13, w: 3 },
      { type: 'altar', x: 21, y: 36 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(2202, FAST, 250, 7),
  },
  ravenGlade: {
    id: 'ravenGlade',
    name: 'Clareira do Corvo Ancião',
    theme: 'forest',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'TTTTTTTTTTT.......................TTTTTTTTTTT',
      'TTTTTTTTTTT.......................TTTTTTTTTTT',
      'TTTTTTTTTTTT..T..................TTTTTTTTTTTT',
      'TTTTTTTTTT...TTT...................TTTTTTTTTT',
      'TTTTTTTTTr...TTT.....................TTTTTTTT',
      'TTTTTTT.T....TTT....................TTTTTTTTT',
      'TTTTTTT.r....TTTT...........R........r..TTTTT',
      'TTTTTT.......wwTR............R.........TTTTTT',
      'TTTTTT.T......T......................wwTTTTTT',
      'TTT.rTTT..................................TTT',
      'TTT..TTT............TTT..........ww.......TTT',
      'TTT.........TTT.....TTTT..................TTT',
      'TTT.........TTTTTw..TT....................TTT',
      'TTTr.....:R.TTTTTw...........TTT..T.:TTT..TTT',
      'TTT.....:::RTTTTT.T.........TTTTT:::::TT..rTT',
      'TTTr...::::::TTTTTT..........TTT:::::::T..TTT',
      'TTT...:::::::.TTTTT...........T.:::::::TT.TTT',
      'TTT..::::::::..wT..............:::::::::..TTT',
      'TTT..::::::::..w................:::::::..TTTT',
      'TTT...:::::::.........S........::::::::..rTTT',
      'TTT...:::::::...................:::::::.rTTTT',
      'TTT...:::::::....TT.....ww......:::::::..r.TT',
      'TTTT...:::::....TTTT.............:::::.....TT',
      'TTTTr............TTT...............::....rTTT',
      'TTTT..............................RR.....TTTT',
      'TTTT.....RRR.......................R....rT.TT',
      'TTrr......RR............................r.rTT',
      'TTTT.Tr..............................wwTTTTTT',
      'TTTTTTT................................TTTTTT',
      'TTTTTT...............................TTTTTTTT',
      'TTTTTT.T...........R................TTTTTTTTT',
      'TTTTTTTTT.........R......R.........TTTTTTTTTT',
      'TTTTTTTTTrr..............R........TTTTTTTTTTT',
      'TTTTTTTTTTTT.....................TTTTTTTTTTTT',
      'TTTTTTTTTTTTT.....................TTTTTTTTTTT',
      'TTTTTTTTTTTT.......#.............TTTTTTTTTTTT',
      'TTTTTTTTTTTTTTT...##..........TTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTT.####.....####.TTTTTTTTTTTTTTT',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'torch', x: 30, y: 19 },
      { type: 'roots', x: 6, y: 11, w: 3 },
      { type: 'altar', x: 21, y: 36 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(2303, HEAVY, 130, 7),
  },
  rootVale: {
    id: 'rootVale',
    name: 'Vale das Raízes',
    theme: 'forest',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'TTT.......................................TTT',
      'TTT................S......................TTT',
      'TTT.......................................TTT',
      'TTT.......................................TTT',
      'TTT...::::::::.........TTTTTT.............TTT',
      'TTr..:::::::::.........TTTTTTT.............TT',
      'TTT.:::::::::::........TTTTTTTT..........rTTT',
      'TTT..:::::::::TT........TTTTTTTT..........rTT',
      'TTTr..:::::::TT..........TTTTTT............TT',
      'TTTTr...::TTTTT.........TTTTTT...........TTTT',
      'TTT.......TT...........TTTTTT.............rTT',
      'TTT.................ww..TTTTT.............TTT',
      '~~~~~~~~~~~~~~~~~~........T~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~..............T~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~............TTT~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~...........w.TT~~~~~~~~~~~~~~~',
      'TT........................w.TTTTTTTTTT...rTTT',
      'TTr.........ww..............TTTT.TTTTT...TTTT',
      'TTT........................TTTT..TTTTT..rTTTT',
      'TTT..................ww.....TT....TTTT....TTT',
      'TTTT...............................TT...rTTTT',
      'TT.r.................ww..............:....TTT',
      'TTT...........................T..::::::::.TTT',
      'TTT.........................T.TT:::::::::.TTT',
      'TTT........................TTTTT:::::::::TTTT',
      'TTr.................R......TTTTT:::::::::.TTT',
      'TTr..r.............R........TTTTT:::::::T.TTT',
      'TTT..Tr....................w.TwwTTT.::...TTTT',
      'TT...r.....................w....TTT........TT',
      'TTT.............................TTT.......TTT',
      'TTT..............................T........TTT',
      'TT.......................................TTTT',
      'TTT.......................................TTT',
      'TTT................#......................TTT',
      'TTTTTT............##...................TTTTTT',
      'TTTTTT..........####.....####..........TTTTTT',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'torch', x: 32, y: 24 },
      { type: 'roots', x: 21, y: 14, w: 3 },
      { type: 'altar', x: 21, y: 36 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(3101, UNDEAD, 240, 6),
  },
  dryCrossing: {
    id: 'dryCrossing',
    name: 'Encruzilhada Seca',
    theme: 'plains',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'RRR.......................................RRR',
      'RRR.......................................RRR',
      'RRR.......................................RRR',
      '.............................................',
      '..........K.......................K..........',
      '.............................................',
      '............................................R',
      '.........................................RRRR',
      '.RR.......................................RRR',
      'RRRR..............R........................RR',
      'RR.................R.....RR.............RRRRR',
      'RRR.RR............R.....RR................R..',
      '.............................................',
      '.............................................',
      '.............................................',
      'KKK.......................................KKK',
      'KKK...............R.......................KKK',
      'KKKR..............R......................RKKK',
      'RRRRR.R................................RRRRRR',
      'RRRRR.RR...............................RRRRRR',
      '.RRRRRR..............................RRRRRRRR',
      '..RR....................................R..R.',
      '.............................................',
      '.............................................',
      '.............................................',
      '.......K.............................K.......',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.R.........................................R.',
      '.R....................o....................R.',
      '............................................R',
      '.............................................',
      '.............................................',
      '...................#.........................',
      'RRRRRR............##...................RRRRRR',
      'RRRRRR..........####.....####..........RRRRRR',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 22, y: 0 }, { x: 0, y: 13 }],
    objects: [
      { type: 'campfire', x: 33, y: 36 },
      { type: 'dryOasis', x: 24, y: 15 },
      { type: 'oilBarrel', x: 29, y: 28 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(3202, FAST, 450, 6),
  },
  redDunes: {
    id: 'redDunes',
    name: 'Dunas Vermelhas',
    theme: 'desert',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'KKK.......................................KKK',
      'KKK.......................................KKK',
      'KKK.......................................KKK',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.........................U...................',
      '...........................................R.',
      'R.RRR.....................................RRR',
      'RRR.R...................................R.RRR',
      'RRR................M...M.M................RRR',
      'RRR......................................RRRR',
      'RRR...................K~..................RRR',
      'RRR................~~~~~~...M.............R.R',
      '...................~~~~~~~...................',
      '...................~~~~~~~...................',
      '.RRRRR............~~~~~~~~~................R.',
      'RRRRRR..R.......M...~~~~~..M........RR.R...RR',
      'RRRRRRRRRRR............~..........R.RRRRRRRRR',
      'RRRRRRRR.R.R......M.................RR.RRRRRR',
      'RRRRRR.R................................RRRRR',
      'RRRRR..................................RRRRRR',
      '.RRRR...................................RRRRR',
      '..RR....................................RR...',
      '.............U.................K.............',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.R........................................RR.',
      '..R.......................................R..',
      '.............................................',
      '.............................................',
      '...................#.........................',
      'RRRRRR............##...................RRRRRR',
      'RRRRRR..........####.....####..........RRRRRR',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 22, y: 0 }, { x: 44, y: 4 }],
    objects: [
      { type: 'sandColumn', x: 15, y: 21 },
      { type: 'sandColumn', x: 36, y: 22 },
      { type: 'campfire', x: 33, y: 36 },
      { type: 'unstableRuin', x: 35, y: 17 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    // Dunas: respiro tático do Ato II — horda rápida de flanqueadores (a pressão do ato está em dryCrossing/solarRuins)
    wave: { count: 260, spawnIntervalTicks: 8, seed: 3303, mix: [
      { kind: 'grunt', weight: 48 },
      { kind: 'runner', weight: 34 },
      { kind: 'brute', weight: 10 },
      { kind: 'necro', weight: 8 },
    ], boss: 'boss', bossDelayTicks: 30 },
  },
  solarRuins: {
    id: 'solarRuins',
    name: 'Ruínas Solares',
    theme: 'desert',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'UUU###.................................###UUU',
      'UUU###.................................###UUU',
      'UUU###.................................###UUU',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......U.......................U.......###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '######UUU...........................UUU######',
      '######UUU...........................UUU######',
      '######UUU...........................UUU######',
      '#########...........................#########',
      '#########...........................#########',
      '#########...........................#########',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......U.......................U.......###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###...................U...................###',
      '###.......................................###',
      '###.......................................###',
      '###.......................................###',
      '###................#......................###',
      'UUU###............##...................###UUU',
      'UUU###..........####.....####..........###UUU',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'unstableRuin', x: 35, y: 21 },
      { type: 'unstableRuin', x: 9, y: 14 },
      { type: 'dryOasis', x: 15, y: 12 },
      { type: 'sandColumn', x: 20, y: 12 },
      { type: 'campfire', x: 33, y: 36 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    // Ruínas: prelúdio do Colosso Solar — pressão de corredores com poucos brutamontes (duo não tanka HEAVY cheio)
    wave: { count: 90, spawnIntervalTicks: 7, seed: 3404, mix: [
      { kind: 'grunt', weight: 48 },
      { kind: 'runner', weight: 34 },
      { kind: 'brute', weight: 10 },
      { kind: 'necro', weight: 8 },
    ], boss: 'boss', bossDelayTicks: 30 },
  },
  ashenFields: {
    id: 'ashenFields',
    name: 'Campos Cinzentos',
    theme: 'plains',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'SSS.......................................SSS',
      'SSS.......................................SSS',
      'SSS.......................................SSS',
      '.S...........................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.......x.................S...................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.S...........................................',
      '.S...........................................',
      'SS..S..............x.................x.....S.',
      'SSS..........................................',
      '.S...........................................',
      '.............................................',
      '.............................................',
      'xxxxxx.................................xxxxxx',
      'xxxxxx.x...........S.................x.xxxxxx',
      'xxxxxx.................................xxxxxx',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.....................................S.......',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.............................................',
      '.x....................o....................x.',
      '.............................................',
      '.............................................',
      '.............................................',
      '...................#.........................',
      'SSSSSS............##...................SSSSSS',
      'SSSSSS..........####.....####..........SSSSSS',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 22, y: 0 }, { x: 44, y: 4 }],
    objects: [
      { type: 'oilBarrel', x: 31, y: 18 },
      { type: 'campfire', x: 33, y: 36 },
      { type: 'unstableRuin', x: 18, y: 14 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(4101, FAST, 600, 6),
  },
  rustGorge: {
    id: 'rustGorge',
    name: 'Garganta de Ferrugem',
    theme: 'mountain',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'RRRRRRRRR...........................RRRRRRRRR',
      'RRRRRRRRR...........................RRRRRRRRR',
      'RRRRRRRRR...........................RRRRRRRRR',
      'RRRRRRR..............................R.RRRRRR',
      'RRRRRR.................................RRRRRR',
      'RRRRRRR...............................RRRRRRR',
      'RRRRRRR.R...........................RRRRRRRRR',
      'RRRRRRRRRR............RR...........RRRRRRRRRR',
      'RRRRRRRRR.........................RRRRRRRRRRR',
      'RRRRRRRRRRRR.......................RRRRRRRRRR',
      'RRRRRRRRRRRRR....................RRRRRRRRRRRR',
      'RRRRRRRRRRRR.....................RRRRRRRRRRRR',
      'RRRRRRRRRRRR.....................RRRRRRRRRRRR',
      'RRRRRRRRRRRR.....................RRRRRRRRRRRR',
      'RRRRRRRRRRRR...................RRRRRRRRRRRRRR',
      'RRRRRRRRRRRRR.................RRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRR...............RRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRRR...............RRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRRR.............R.RRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRRR...............RRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRR................RRRRRRRRRRRRRRR',
      'RRRRRRRRRRR..R.................RRRRRRRRRRRRRR',
      'RRRRRRRRRRRR....................RRRRRRRRRRRRR',
      'RRRRRRRRRRRR.....................RRRRRRRRRRRR',
      'RRRRRRRRR..........................RRRRRRRRRR',
      'RRRRRRRR...........................R.RRRRRRRR',
      'RRRRRRRR..............................RRRRRRR',
      'RRRRRR...............................RRRRRRRR',
      'RRRRRRR...............................RRRRRRR',
      'RRRRRR................................RRRRRRR',
      'RRRRRR.................R...............RRRRRR',
      'RRRRRRR...............R...............RRRRRRR',
      'RRRRR....................................RRRR',
      'RR........................................RRR',
      'RR........................................RRR',
      'RRR................#......................RRR',
      'RRRRRR............##...................RRRRRR',
      'RRRRRR..........####.....####..........RRRRRR',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'unstableRuin', x: 32, y: 10 },
      { type: 'oilBarrel', x: 25, y: 11 },
      { type: 'campfire', x: 33, y: 36 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(4202, HEAVY, 600, 6),
  },
  frostPass: {
    id: 'frostPass',
    name: 'Passo da Geada',
    theme: 'mountain',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'TTTRRR.................................RRRTTT',
      'TTTRRR.................................RRRTTT',
      'TTTRRR.................................RRRTTT',
      'RRR.....................................R..RR',
      'RR...............T.........................RR',
      'RRR.......................................RRR',
      'RRR........................................RR',
      'RRR......................................RRRR',
      'RRR.......................................RRR',
      'RRR........................R...........R.RRRR',
      'RRRRRR..........R...........R...........RRRRR',
      'RR.....................................R.RRRR',
      'RRR........................................RR',
      'RRR......................................RRRR',
      'RRRRR..R.................................RRRR',
      'RRRRRRRRR...........................RR.R..RRR',
      'RRRRRRRRRR.........................RRRRRRRRRR',
      'RRRRRRRRR............................RRRRRRRR',
      'RRRRRRRRR...........................RRRRRRRRR',
      'RRRRRRRRR.R.......................RRRRRRRRRRR',
      'RRRRRRRRRR........................RRRRRRRRRRR',
      'RRRRR...................................RRRRR',
      'RRRRRR.................................RRRRRR',
      'RRRRR..................................R.RRRR',
      'RRRRR..........TT.........................RRR',
      'RRRR............TT.........TT..............RR',
      'RR.......................................RRRR',
      'RRR......................................RRRR',
      'RRRR......................................RRR',
      'RRR.......................................RRR',
      'RRRR.....................................RRRR',
      'RRR...................A..................RRRR',
      'RRRR.....................................RRRR',
      'RRR.......................................RRR',
      'RRR......................................RRRR',
      'RRR................#......................RRR',
      'RRRRRR............##...................RRRRRR',
      'RRRRRR..........####.....####..........RRRRRR',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'campfire', x: 33, y: 36 },
      { type: 'oilBarrel', x: 35, y: 28 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(4303, UNDEAD, 600, 7),
  },
  ashPeak: {
    id: 'ashPeak',
    name: 'Cume das Cinzas',
    theme: 'ash',
    widthTiles: 45,
    heightTiles: 39,
    map: [
      'RRRRRR.................................RRRRRR',
      'RRRRRR.................................RRRRRR',
      'RRRRRR.................................RRRRRR',
      'RRRRR.............~~~~~~~~~...............RRR',
      'RRRR..............~~~~~~~~~................RR',
      'RR................~~~~~~~~~..............RRRR',
      'RRR.......................................RRR',
      'RRR.......................................RRR',
      'RR.........................................RR',
      'RRR........R..............................RRR',
      'RRR.......RR.....................R.........RR',
      'RRR.......R.......................R........RR',
      'RRR......................................RRRR',
      'RR........................................RRR',
      'RRR........................................RR',
      'RRRRRR~~~~~~.....................~~~~~~RR.RRR',
      'RRRRRR~~~~~~.....................~~~~~~RRRRRR',
      'RRRRRR~~~~~~.....................~~~~~~RRRRRR',
      'RRRRRRR................................RRRRRR',
      'RRRRRRR..............................R.RRRRRR',
      'RRRRRRRR..............................RRRRRRR',
      'RRRR..R....................................RR',
      'RR.R......................................RRR',
      'RR.......................................RRRR',
      'RRR.........R.................R............RR',
      'RRR..........R................RRR..........RR',
      'RRR..........R.................RR.........RRR',
      'RR.........................................RR',
      'RRRR......................................RRR',
      'RRR.......................................RRR',
      'RRR........................................RR',
      'RR.......................................RRRR',
      'RRRR......................................RRR',
      'RRR....................................RR.RRR',
      'RRRRRR.................................RRRRRR',
      'RRRRRR.............#...................RRRRRR',
      'RRRRRRRRR.........##................RRRRRRRRR',
      'RRRRRRRRR.......####.....####.......RRRRRRRRR',
      'WWWWWWWWWWWWWWWWWWWWgggggWWWWWWWWWWWWWWWWWWWW',
    ],
    spawnPoints: [{ x: 12, y: 0 }, { x: 32, y: 0 }],
    objects: [
      { type: 'altar', x: 21, y: 36 },
      { type: 'unstableRuin', x: 9, y: 11 },
      { type: 'oilBarrel', x: 27, y: 27 },
    ],
    defaultSetup: {
      members: [
        { archetype: 'warrior', x: 22, y: 35 },
        { archetype: 'mage', x: 27, y: 36 },
      ],
      barriers: [{ x: 20, y: 37, orientation: 'H' }, { x: 24, y: 37, orientation: 'H' }, { x: 18, y: 34, orientation: 'H' }],
    },
    wave: wave(4404, HEAVY, 240, 6, 600),
  },
} satisfies Record<string, ZoneDef>);

/** MAP_CONFIG: tamanho, spawns e objetos de cada mapa (mesmos dados das zonas). */
export const MAP_CONFIG: Record<string, ZoneDef> = ZONES;

/** Zona inicial (a ponte); a run troca a zona ativa por região (ver applyZone em gameConfig). */
export const ACTIVE_ZONE: ZoneDef = ZONES.bridge;

export interface ParsedZone {
  width: number;
  height: number;
  /** Bloqueiam andar E visão. */
  walls: Vec2[];
  /** Bloqueiam andar mas não visão (água/abismo). */
  voids: Vec2[];
  props: { kind: PropKind; x: number; y: number }[];
  /** Tiles de chão por tipo (para o cenário pintar). */
  floor: { x: number; y: number; plaza: boolean; ground: GroundKind }[];
  /** Portão da cidade: inimigo que entra aqui invade a cidade. */
  city: Vec2[];
  /** Neblina densa (esconde inimigos de longe). */
  fog: Vec2[];
  /** Chão lento (raízes expostas). */
  slow: Vec2[];
  spawnPoints: Vec2[];
  objects: MapObjectDef[];
}

export function parseZone(z: ZoneDef): ParsedZone {
  const height = z.map.length;
  const width = z.map[0].length;
  if (width !== z.widthTiles || height !== z.heightTiles) throw new Error(`Zona ${z.id}: mapa ${width}×${height} ≠ ${z.widthTiles}×${z.heightTiles}`);
  const out: ParsedZone = { width, height, walls: [], voids: [], props: [], floor: [], city: [], fog: [], slow: [], spawnPoints: z.spawnPoints.map((p) => ({ ...p })), objects: z.objects.map((o) => ({ ...o })) };
  z.map.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Zona ${z.id}: linha ${y} com largura ${row.length} (esperado ${width})`);
    [...row].forEach((ch, x) => {
      const ground = GROUND_OF[ch];
      if (ground) {
        out.floor.push({ x, y, plaza: ch === ',', ground });
        if (ground === 'gate') out.city.push({ x, y });
        else if (ground === 'fog') out.fog.push({ x, y });
        else if (ground === 'roots') out.slow.push({ x, y });
      } else if (ch === '~') out.voids.push({ x, y });
      else {
        out.walls.push({ x, y });
        const k = PROP_OF[ch];
        if (k) out.props.push({ kind: k, x, y });
      }
    });
  });
  return out;
}
