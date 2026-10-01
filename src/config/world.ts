/**
 * Mundo de Aurenthal (original): regiões em grade 7 × 4, cidades, rota dos 3 atos e eventos.
 * Tudo é dado — adicionar região/ato/evento não exige mexer na lógica da run.
 */
export type Biome = 'forest' | 'plains' | 'desert' | 'mountain' | 'coast' | 'island' | 'sea' | 'ash';
export type NodeType = 'horde' | 'elite' | 'event' | 'city' | 'boss' | 'survival';

export interface City {
  name: string;
  access: 'open' | 'locked';
  reason?: string;
}

export interface Region {
  id: string;
  name: string;
  biome: Biome;
  gx: number;
  gy: number;
  /** Zona de combate (zones.ts). */
  zone?: string;
  act?: 0 | 1 | 2;
  cities?: City[];
  /** Chefe do ato nesta região. */
  bossOfAct?: number;
  enemies?: string;
  /** Fora da rota: aparece esmaecida ("em breve"). */
  future?: boolean;
}

export const WORLD = { cols: 7, rows: 4, name: 'Aurenthal' };

export const REGIONS: Region[] = [
  { id: 'ashPeak', name: 'Cume das Cinzas', biome: 'ash', gx: 1, gy: 0, zone: 'ashPeak', act: 2, bossOfAct: 2, enemies: 'Mortos-vivos calcinados e o Senhor Orc' },
  { id: 'frostPass', name: 'Passo da Geada', biome: 'mountain', gx: 2, gy: 0, zone: 'frostPass', act: 2, cities: [{ name: 'Kaldrun', access: 'open' }], enemies: 'Mortos congelados, brutamontes' },
  { id: 'rustGorge', name: 'Garganta de Ferrugem', biome: 'mountain', gx: 3, gy: 0, zone: 'rustGorge', act: 2, enemies: 'Brutamontes e corredores' },
  { id: 'whisperWood', name: 'Floresta dos Sussurros', biome: 'forest', gx: 0, gy: 1, zone: 'whisperWood', act: 0, cities: [{ name: 'Ardenfall', access: 'open' }], enemies: 'Corredores entre as árvores' },
  { id: 'crookedWood', name: 'Bosque Torto', biome: 'forest', gx: 1, gy: 1, zone: 'crookedWood', act: 0, enemies: 'Zumbis comuns e brutamontes' },
  {
    id: 'valdrec', name: 'Ponte e Portões de Valdrec', biome: 'plains', gx: 2, gy: 1, zone: 'bridge', act: 0,
    cities: [
      { name: 'Valdrec', access: 'locked', reason: 'Portões fechados pelo cerco dos mortos-vivos' },
      { name: 'Acampamento dos Refugiados', access: 'open' },
    ],
    enemies: 'A horda que cerca a capital',
  },
  { id: 'ashenFields', name: 'Campos Cinzentos', biome: 'plains', gx: 3, gy: 1, zone: 'ashenFields', act: 2, enemies: 'Hordas rápidas' },
  { id: 'saltCove', name: 'Enseada Salgada', biome: 'coast', gx: 4, gy: 1, future: true },
  { id: 'saltreach', name: 'Porto de Saltreach', biome: 'coast', gx: 5, gy: 1, future: true, cities: [{ name: 'Saltreach', access: 'locked', reason: 'Porto abandonado' }] },
  { id: 'ravenIsle', name: 'Ilha dos Corvos', biome: 'island', gx: 6, gy: 1, future: true },
  { id: 'ravenGlade', name: 'Clareira do Corvo Ancião', biome: 'forest', gx: 0, gy: 2, zone: 'ravenGlade', act: 0, bossOfAct: 0, enemies: 'O Colosso da floresta' },
  { id: 'rootVale', name: 'Vale das Raízes', biome: 'forest', gx: 1, gy: 2, zone: 'rootVale', act: 1, enemies: 'Mortos atravessando o rio' },
  { id: 'dryCrossing', name: 'Encruzilhada Seca', biome: 'plains', gx: 2, gy: 2, zone: 'dryCrossing', act: 1, enemies: 'Corredores do deserto' },
  { id: 'redDunes', name: 'Dunas Vermelhas', biome: 'desert', gx: 3, gy: 2, zone: 'redDunes', act: 1, enemies: 'Brutamontes das areias' },
  { id: 'selmara', name: 'Oásis de Selmara', biome: 'desert', gx: 4, gy: 2, zone: 'redDunes', act: 1, cities: [{ name: 'Selmara', access: 'open' }], enemies: 'Saqueadores mortos-vivos' },
  { id: 'duneSea', name: 'Mar de Dunas', biome: 'desert', gx: 2, gy: 3, future: true },
  { id: 'dunehold', name: 'Fortaleza de Dunehold', biome: 'desert', gx: 3, gy: 3, future: true, cities: [{ name: 'Dunehold', access: 'locked', reason: 'Fortaleza sitiada' }] },
  { id: 'solarRuins', name: 'Ruínas Solares', biome: 'desert', gx: 4, gy: 3, zone: 'solarRuins', act: 1, bossOfAct: 1, enemies: 'O Colosso Solar' },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<string, Region>;
export const regionAt = (gx: number, gy: number) => REGIONS.find((r) => r.gx === gx && r.gy === gy);

export const BIOME_LABEL: Record<Biome, string> = {
  forest: 'Floresta',
  plains: 'Planície',
  desert: 'Deserto',
  mountain: 'Montanha',
  coast: 'Costa',
  island: 'Ilha',
  sea: 'Mar',
  ash: 'Terras de cinza',
};

export const NODE_LABEL: Record<NodeType, string> = {
  horde: 'Horda',
  elite: 'Elite',
  event: 'Evento',
  city: 'Cidade',
  boss: 'Chefe',
  survival: 'Sobrevivência',
};

export interface RunNode {
  region: string;
  /** O jogador escolhe uma das opções. */
  options: NodeType[];
  /** Cidade usada quando a opção é "city". */
  city?: string;
}

export interface ActDef {
  name: string;
  boss: string;
  bossName: string;
  nodes: RunNode[];
  /** Escala dos inimigos neste ato. */
  hpMult: number;
  dmgMult: number;
}

export const ACTS: ActDef[] = [
  {
    name: 'Ato I — O Cerco de Valdrec',
    boss: 'boss',
    bossName: 'Colosso da Clareira',
    hpMult: 1,
    dmgMult: 1,
    nodes: [
      { region: 'valdrec', options: ['horde'] },
      { region: 'valdrec', options: ['city', 'event'], city: 'Acampamento dos Refugiados' },
      { region: 'crookedWood', options: ['horde', 'elite', 'survival'] },
      { region: 'whisperWood', options: ['city', 'event'], city: 'Ardenfall' },
      { region: 'ravenGlade', options: ['boss'] },
    ],
  },
  {
    name: 'Ato II — Areias Vermelhas',
    boss: 'boss2',
    bossName: 'Colosso Solar',
    hpMult: 2.0,
    dmgMult: 1.5,
    nodes: [
      { region: 'rootVale', options: ['horde', 'event'] },
      { region: 'dryCrossing', options: ['elite', 'horde'] },
      { region: 'redDunes', options: ['horde', 'event', 'survival'] },
      { region: 'selmara', options: ['city'], city: 'Selmara' },
      { region: 'solarRuins', options: ['boss'] },
    ],
  },
  {
    name: 'Ato III — O Cume das Cinzas',
    boss: 'orcboss',
    bossName: 'Senhor Orc das Cinzas',
    hpMult: 3.8,
    dmgMult: 2.2,
    nodes: [
      { region: 'ashenFields', options: ['horde', 'event'] },
      { region: 'rustGorge', options: ['elite', 'horde', 'survival'] },
      { region: 'frostPass', options: ['city', 'event'], city: 'Kaldrun' },
      { region: 'frostPass', options: ['elite', 'horde'] },
      { region: 'ashPeak', options: ['boss'] },
    ],
  },
];

// ---------------- Eventos ----------------
export type EventEffect =
  | { zeni: number }
  | { souls: number }
  | { exp: number }
  | { item: 'uncommon' | 'rare' | 'epic' | 'legendary' }
  | { attrPoints: number }
  | { skillPoints: number }
  | { reviveFree: true }
  /** Repara a muralha da cidade. */
  | { cityHp: number }
  | { gamble: { chance: number; win: EventEffect[]; lose: EventEffect[]; winText: string; loseText: string } };

export interface EventOption {
  label: string;
  /** Custo em Zeni (o botão fica desativado se não houver). */
  cost?: number;
  effects: EventEffect[];
  result: string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  options: EventOption[];
}

/** Valores em Zeni/almas/EXP são multiplicados pelo ato (1×, 1,6×, 2,4×). */
export const EVENTS: EventDef[] = [
  {
    id: 'cart',
    title: 'Carroça abandonada',
    text: 'Uma carroça de refugiados tombada à beira da estrada. As rodas ainda giram devagar com o vento.',
    options: [
      { label: 'Vasculhar a carga', effects: [{ zeni: 140 }], result: 'Entre panos rasgados, uma bolsa esquecida de Zeni.' },
      { label: 'Recolher as almas presas aqui', effects: [{ souls: 18 }], result: 'Os espectros da carroça se juntam ao seu cortejo.' },
    ],
  },
  {
    id: 'shrine',
    title: 'Santuário esquecido',
    text: 'Um altar de pedra coberto de musgo. Velas apagadas cercam uma estátua sem rosto.',
    options: [
      { label: 'Ofertar Zeni', cost: 120, effects: [{ attrPoints: 1 }], result: 'Uma luz morna percorre a party: +1 ponto de atributo para cada herói.' },
      { label: 'Orar em silêncio', effects: [{ exp: 60 }], result: 'A calma do lugar clareia a mente: EXP para a party.' },
      { label: 'Seguir viagem', effects: [], result: 'Vocês deixam o santuário para trás.' },
    ],
  },
  {
    id: 'refugees',
    title: 'Refugiados feridos',
    text: 'Uma família foge da horda. O pai tem uma perna ferida e pede ajuda para chegar ao próximo abrigo.',
    options: [
      { label: 'Escoltar e pagar um curandeiro', cost: 80, effects: [{ exp: 110 }], result: 'A família agradece com histórias da estrada — a party aprende com elas.' },
      { label: 'Indicar o caminho e seguir', effects: [{ exp: 25 }], result: 'Vocês apontam a trilha segura e continuam.' },
    ],
  },
  {
    id: 'peddler',
    title: 'Mercador ambulante',
    text: 'Um mercador de manto remendado abre a mala no meio da trilha. "Tudo de qualidade, pouco uso!"',
    options: [
      { label: 'Comprar o item da vitrine', cost: 260, effects: [{ item: 'rare' }], result: 'Um equipamento Raro vai para o inventário.' },
      { label: 'Apostar num baú fechado', cost: 150, effects: [{ gamble: { chance: 0.35, win: [{ item: 'epic' }], lose: [{ item: 'uncommon' }], winText: 'Sorte! Um item Épico.', loseText: 'Só um item Incomum...' } }], result: '' },
      { label: 'Recusar', effects: [], result: 'O mercador dá de ombros e some na neblina.' },
    ],
  },
  {
    id: 'soulWell',
    title: 'Poço das almas',
    text: 'Um poço de água escura sussurra nomes. Luzes azuis sobem da superfície.',
    options: [
      { label: 'Beber da água', effects: [{ gamble: { chance: 0.55, win: [{ souls: 45 }], lose: [{ zeni: -80 }], winText: 'As almas do poço se rendem a vocês.', loseText: 'Uma mão gelada puxa a bolsa: vocês perdem Zeni.' } }], result: '' },
      { label: 'Jogar uma moeda', cost: 30, effects: [{ souls: 12 }], result: 'Algumas almas agradecidas seguem a party.' },
      { label: 'Afastar-se', effects: [], result: 'Melhor não mexer com isso.' },
    ],
  },
  {
    id: 'veteran',
    title: 'Treinador veterano',
    text: 'Um velho soldado de uma perna só observa a party. "Posso ensinar um truque ou dois... por um preço."',
    options: [
      { label: 'Treinar com ele', cost: 180, effects: [{ skillPoints: 1 }], result: '+1 ponto de habilidade para cada herói.' },
      { label: 'Ouvir as histórias de guerra', effects: [{ exp: 50 }], result: 'Lições valiosas: EXP para a party.' },
    ],
  },
  {
    id: 'rift',
    title: 'Fenda luminosa',
    text: 'Uma rachadura no ar pulsa com luz dourada. Algo brilha lá dentro.',
    options: [
      { label: 'Enfiar a mão', effects: [{ gamble: { chance: 0.3, win: [{ item: 'epic' }], lose: [{ souls: -10 }], winText: 'Vocês puxam um item Épico!', loseText: 'A fenda morde: algumas almas escapam.' } }], result: '' },
      { label: 'Absorver a luz', effects: [{ souls: 15 }], result: 'A luz vira almas.' },
    ],
  },
  {
    id: 'masons',
    title: 'Pedreiros errantes',
    text: 'Uma turma de pedreiros fugiu da capital com as ferramentas nas costas. Por um punhado de Zeni, eles voltam para remendar a muralha.',
    options: [
      { label: 'Pagar pelo reparo completo', cost: 160, effects: [{ cityHp: 300 }], result: 'Em poucas horas as brechas da muralha estão fechadas.' },
      { label: 'Pedir só um remendo', cost: 60, effects: [{ cityHp: 100 }], result: 'Eles tapam a brecha mais feia e seguem viagem.' },
      { label: 'Dispensar', effects: [], result: 'Os pedreiros seguem para o sul.' },
    ],
  },
  {
    id: 'camp',
    title: 'Acampamento seguro',
    text: 'Uma clareira protegida por rochas, com uma fogueira ainda quente.',
    options: [
      { label: 'Descansar e tratar os feridos', effects: [{ reviveFree: true }, { exp: 30 }], result: 'A party descansa. Heróis caídos se reerguem.' },
      { label: 'Treinar à luz da fogueira', effects: [{ exp: 70 }], result: 'EXP para a party.' },
    ],
  },
];
