/**
 * Paleta do editor de mapas: os 27 caracteres da legenda de zones.ts.
 * Só apresentação (rótulo/cor/categoria) — a regra real (o que bloqueia,
 * o que é chão) continua em parseZone/zones.ts e no Board.
 */
export type CharCategory = 'ground' | 'block' | 'gate' | 'void';

export interface CharInfo {
  label: string;
  color: string;
  bg: string;
  cat: CharCategory;
  hint: string;
}

export const CHAR_INFO: Record<string, CharInfo> = {
  '.': { label: 'Chão', color: '#8a7a5c', bg: '#2a2620', cat: 'ground', hint: 'chão normal' },
  ',': { label: 'Praça', color: '#9a9aa5', bg: '#33333a', cat: 'ground', hint: 'chão de pedra' },
  ':': { label: 'Neblina', color: '#7fa3b8', bg: '#26333b', cat: 'ground', hint: 'esconde inimigos de longe' },
  r: { label: 'Raízes', color: '#7fa35c', bg: '#27331f', cat: 'ground', hint: 'chão lento' },
  w: { label: 'Poça', color: '#5cb8d6', bg: '#1f3038', cat: 'ground', hint: 'visual, reflete a luz' },
  g: { label: 'Portão', color: '#ffd75e', bg: '#3a2f14', cat: 'gate', hint: 'inimigo aqui invade a cidade' },
  '~': { label: 'Vazio', color: '#3a6ea5', bg: '#16202c', cat: 'void', hint: 'não anda, não bloqueia visão' },
  P: { label: 'Parapeito', color: '#b08d4f', bg: '#2c2417', cat: 'block', hint: 'bloqueia' },
  B: { label: 'Braseiro', color: '#ff8a3c', bg: '#33231a', cat: 'block', hint: 'bloqueia' },
  L: { label: 'Lampião', color: '#ffe9a3', bg: '#2e2c1c', cat: 'block', hint: 'bloqueia' },
  c: { label: 'Carroça', color: '#a5713f', bg: '#2c2115', cat: 'block', hint: 'bloqueia' },
  x: { label: 'Escombros', color: '#8d8d96', bg: '#26262b', cat: 'block', hint: 'bloqueia' },
  o: { label: 'Barris', color: '#c49a5c', bg: '#2b2317', cat: 'block', hint: 'bloqueia' },
  '#': { label: 'Muro', color: '#b5b5c0', bg: '#2e2e35', cat: 'block', hint: 'bloqueia' },
  W: { label: 'Muralha', color: '#d6d6e0', bg: '#34343c', cat: 'block', hint: 'bloqueia' },
  T: { label: 'Árvore', color: '#4fae5c', bg: '#1e3324', cat: 'block', hint: 'bloqueia' },
  R: { label: 'Rocha', color: '#9a9aa5', bg: '#2a2a30', cat: 'block', hint: 'bloqueia' },
  K: { label: 'Cacto', color: '#5cc46a', bg: '#1f3324', cat: 'block', hint: 'bloqueia' },
  U: { label: 'Ruína', color: '#c4b08d', bg: '#2e2a20', cat: 'block', hint: 'bloqueia' },
  S: { label: 'Tronco', color: '#8a6a45', bg: '#2b241a', cat: 'block', hint: 'bloqueia' },
  A: { label: 'Tenda', color: '#d68a5c', bg: '#33241a', cat: 'block', hint: 'bloqueia' },
  M: { label: 'Palmeira', color: '#6ad67f', bg: '#1e3326', cat: 'block', hint: 'bloqueia' },
};

/** Todos os caracteres válidos num mapa. */
export const VALID_CHARS = new Set(Object.keys(CHAR_INFO));

/** Objetos interativos reais do jogo (core/sim/objects.ts). */
export const OBJECT_TYPES = [
  { id: 'cart', label: 'Carroça' },
  { id: 'oilBarrel', label: 'Barril de óleo' },
  { id: 'torch', label: 'Tocha' },
  { id: 'roots', label: 'Raízes' },
  { id: 'altar', label: 'Altar' },
  { id: 'sandColumn', label: 'Coluna de areia' },
  { id: 'unstableRuin', label: 'Ruína instável' },
  { id: 'dryOasis', label: 'Oásis seco' },
  { id: 'campfire', label: 'Fogueira' },
  { id: 'shieldWall', label: 'Muralha (guerreiro)' },
] as const;

export const HERO_KINDS = [
  { id: 'warrior', label: 'Guerreiro' },
  { id: 'mage', label: 'Mago' },
  { id: 'archer', label: 'Arqueira' },
  { id: 'sorcerer', label: 'Feiticeira' },
  { id: 'warlock', label: 'Bruxa' },
  { id: 'assassin', label: 'Assassino' },
] as const;

export const THEMES = [
  { id: 'bridge', label: 'Ponte' },
  { id: 'town', label: 'Cidade' },
  { id: 'forest', label: 'Floresta' },
  { id: 'plains', label: 'Planície' },
  { id: 'desert', label: 'Deserto' },
  { id: 'mountain', label: 'Montanha' },
  { id: 'ash', label: 'Cinzas' },
] as const;
