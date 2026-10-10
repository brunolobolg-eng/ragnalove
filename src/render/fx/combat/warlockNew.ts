import * as THREE from 'three';
import { GAME_CONFIG } from '../../../config/gameConfig';
import { WARLOCK_NEW_FX as K } from '../../../config/fx/warlockNew';
import type { SimEvent } from '../../../core/sim/types';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry, DemoIds, DemoStep } from './demos';
import { ApexFX, BlackFrostFX, CageFX, ChillFX, EchoFX, FrostMistFX, MarshFX, frostRipple } from './warlockNewFx';

/** Evento da simulação de um tipo específico. */
type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/** Duração do Frio (ticks): cada pulso de gelo renova o contorno por este tempo (a mesma do Frio no jogo). */
const CHILL_REFRESH_TICKS = GAME_CONFIG.archetypes.warlock.chill.durationTicks;

/** Golpes do Eco da Alma ainda não aplicados ("conjurador>alvo"): o dano deles não conta como pulso do enxame. */
const echoPending = new Map<string, number>();
/** Contorno de gelo de cada inimigo gelado (um por inimigo). */
const contours = new Map<number, ChillFX>();

/**
 * Chamado pelo visual da Bruxa a cada dano de sombra: se o golpe é de uma batida do Eco da Alma, consome a
 * marcação e devolve true (o golpe já tem visual próprio no evento da magia).
 */
export function consumeEchoHit(caster: number, target: number): boolean {
  const k = `${caster}>${target}`;
  const n = echoPending.get(k);
  if (!n) return false;
  if (n <= 1) echoPending.delete(k);
  else echoPending.set(k, n - 1);
  return true;
}

/** Dano de gelo (Névoa Gélida, Geada Negra): ondulação no alvo e o contorno de gelo dele é renovado. */
export function frostHit(e: Ev<'damage'>, c: CombatVisualCtx): void {
  const feet = c.pos(e.unitId);
  if (feet) frostRipple(c.kit, feet);
  const cur = contours.get(e.unitId);
  if (cur && !cur.done) cur.refresh(CHILL_REFRESH_TICKS);
}

/** Vira quem conjura para o alvo (mesma regra dos outros handlers: eixos, sem diagonal). */
function faceToward(c: CombatVisualCtx, id: number, to: THREE.Vector3 | undefined): void {
  const view = c.view(id);
  const from = c.pos(id);
  if (!view || !from || !to) return;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  view.setFacing(Math.abs(dx) < 0.5 ? 0 : Math.sign(dx), Math.abs(dz) < 0.5 ? 0 : Math.sign(dz), true);
}

/** Nome da magia sobre a cabeça de quem conjura (ou sobre o ponto de reserva, se a unidade não existe mais). */
function nameOverCaster(c: CombatVisualCtx, id: number, fallback: THREE.Vector3, text: string, color: string): void {
  const p = c.pos(id) ?? fallback;
  c.float(text, p.clone().setY(K.float.height), color, K.float.size, K.float.life, K.float.rise);
}

/** Visual das seis magias novas e do Frio. Retorna true quando assume o evento. */
export function handleWarlockNew(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'etherealCage':
      return cage(e, c);
    case 'soulEcho':
      return echo(e, c);
    case 'frostMist':
      return mist(e, c);
    case 'chill':
      return chill(e, c);
    case 'blackFrost':
      return blackFrost(e, c);
    case 'abyssMarsh':
      return marsh(e, c);
    case 'darkApex':
      return apex(e, c);
    default:
      return false;
  }
}

/** Cárcere Etéreo: pilares de cristal em volta do alvo (ou só o nome, se a chance falhou). */
function cage(e: Ev<'etherealCage'>, c: CombatVisualCtx): boolean {
  const target = c.pos(e.targetId) ?? c.tile(e.x, e.y, 0);
  faceToward(c, e.unitId, target);
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.cage);
  c.add(new CageFX(c.kit, () => c.pos(e.targetId), target, e.ticks, e.ok));
  c.float(e.ok ? 'Cárcere Etéreo!' : 'Resistiu!', target.clone().setY(K.float.height), e.ok ? K.float.cageColor : K.float.cageFailColor, K.float.size, K.float.life, K.float.rise);
  return true;
}

/** Eco da Alma: duas silhuetas e batidas no alvo e na área; registra os golpes para o dano não virar pulso do enxame. */
function echo(e: Ev<'soulEcho'>, c: CombatVisualCtx): boolean {
  const center = c.pos(e.targetId) ?? c.tile(e.x, e.y, 0);
  const from = c.pos(e.unitId) ?? center;
  faceToward(c, e.unitId, center);
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.echo);
  for (const id of e.targetIds) echoPending.set(`${e.unitId}>${id}`, K.echo.blows);
  const area = e.targetIds.map((id) => c.pos(id)).filter((p): p is THREE.Vector3 => p !== undefined);
  c.add(new EchoFX(c.kit, () => c.pos(e.targetId), center, from, e.radius, e.doubled, area));
  c.float('Eco da Alma!', center.clone().setY(K.float.height), K.float.echoColor, K.float.size, K.float.life, K.float.rise);
  return true;
}

/** Névoa Gélida: área no chão que dura o evento, com cristais, nuvem e luz azul-gelo. */
function mist(e: Ev<'frostMist'>, c: CombatVisualCtx): boolean {
  const center = c.tile(e.x, e.y, 0);
  faceToward(c, e.unitId, center);
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.mist);
  c.add(new FrostMistFX(c.kit, center, e.radius, e.ticks));
  nameOverCaster(c, e.unitId, center, 'Névoa Gélida!', K.float.mistColor);
  return true;
}

/** Frio: o inimigo ganha o contorno de gelo (ou tem o que já tem renovado). */
function chill(e: Ev<'chill'>, c: CombatVisualCtx): boolean {
  const at = c.pos(e.unitId);
  if (!at) return true;
  const cur = contours.get(e.unitId);
  if (cur && !cur.done) {
    cur.refresh(e.ticks);
    return true;
  }
  // limite de contornos ao mesmo tempo: o mais antigo some
  const live = [...contours.entries()].filter(([, f]) => !f.done);
  if (live.length >= K.chill.maxContours) live[0][1].end();
  contours.delete(e.unitId);
  const fx = new ChillFX(c.kit, () => c.pos(e.unitId), at, e.ticks);
  contours.set(e.unitId, fx);
  c.add(fx);
  return true;
}

/** Geada Negra: núcleo azul-negro, espinhos até a borda da área e estouros nos alvos. */
function blackFrost(e: Ev<'blackFrost'>, c: CombatVisualCtx): boolean {
  const center = c.tile(e.x, e.y, 0);
  faceToward(c, e.unitId, center);
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.blackFrost);
  const targets = e.targetIds.map((id) => c.pos(id)).filter((p): p is THREE.Vector3 => p !== undefined);
  c.add(new BlackFrostFX(c.kit, center, e.radius, targets, e.chilled > 0));
  nameOverCaster(c, e.unitId, center, 'Geada Negra!', K.float.blackFrostColor);
  return true;
}

/** Lodaçal Abissal: raízes que sobem dos pés do alvo e um disco de lodo que o segue. */
function marsh(e: Ev<'abyssMarsh'>, c: CombatVisualCtx): boolean {
  const target = c.pos(e.targetId);
  if (!target) return true;
  faceToward(c, e.unitId, target);
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.marsh);
  c.add(new MarshFX(c.kit, () => c.pos(e.targetId), target, e.ticks));
  c.float('Lodaçal Abissal!', target.clone().setY(K.float.height), K.float.marshColor, K.float.size, K.float.life, K.float.rise);
  return true;
}

/** Ápice Sombrio: pilar, anel de runas e aura de motes em volta da Bruxa, que voltam ao peito no fim. */
function apex(e: Ev<'darkApex'>, c: CombatVisualCtx): boolean {
  const base = c.pos(e.unitId);
  if (!base) return true;
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.apex);
  c.add(new ApexFX(c.kit, () => c.pos(e.unitId), base, e.ticks));
  c.float('Ápice Sombrio!', base.clone().setY(K.float.height), K.float.apexColor, K.float.size, K.float.life, K.float.rise);
  return true;
}

/** Pulsos de dano de uma fonte num grupo de alvos, no mesmo instante. */
function hits(at: number, ids: number[], source: 'shadow' | 'frost', caster: number, amount: number): DemoStep[] {
  return ids.map((id): DemoStep => ({ at, e: { type: 'damage', unitId: id, amount, source, sourceId: caster } }));
}

/**
 * Vitrine das seis magias novas. Os alvos são os da vitrine: t1 em (3,0), t2 em (3,1), t3 em (4,-1).
 * Onde a duração do jogo seria longa (Cárcere, Lodaçal, Ápice), a demonstração usa o mesmo evento com um tempo curto
 * para mostrar racha e quebra; o resto é igual ao que a simulação emite.
 */
export const WARLOCK_NEW_DEMOS: DemoEntry[] = [
  {
    cls: 'warlock',
    id: 'cage',
    label: 'Cárcere Etéreo (um inimigo: racha e quebra)',
    span: 4.6,
    steps: ({ caster, t1 }: DemoIds) => [{ at: 0, e: { type: 'etherealCage', unitId: caster, targetId: t1, x: 3, y: 0, ticks: 40, ok: true } }],
  },
  {
    cls: 'warlock',
    id: 'echo',
    label: 'Eco da Alma (duas batidas, dobrado por alvo preso)',
    span: 1.6,
    steps: ({ caster, t1, t2, t3 }: DemoIds) => [
      { at: 0, e: { type: 'soulEcho', unitId: caster, targetId: t1, x: 3, y: 0, radius: 1, targetIds: [t1, t2, t3], doubled: true } },
      ...hits(K.echo.blowAt, [t1, t2, t3], 'shadow', caster, 16),
      ...hits(K.echo.blowAt + K.echo.blowGap, [t1, t2, t3], 'shadow', caster, 16),
    ],
  },
  {
    cls: 'warlock',
    id: 'mist',
    label: 'Névoa Gélida (área, pulsos de gelo e Frio)',
    span: 6.4,
    steps: ({ caster, t1, t2, t3 }: DemoIds) => [
      { at: 0, e: { type: 'frostMist', unitId: caster, x: 3, y: 0, radius: 3, ticks: 60 } },
      ...[1, 2, 3, 4, 5].flatMap((k) => hits(k, [t1, t2, t3], 'frost', caster, 4)),
      { at: 1, e: { type: 'chill', unitId: t1, ticks: 20 } },
      { at: 1, e: { type: 'chill', unitId: t2, ticks: 20 } },
      { at: 1, e: { type: 'chill', unitId: t3, ticks: 20 } },
    ],
  },
  {
    cls: 'warlock',
    id: 'blackfrost',
    label: 'Geada Negra (área, mais dano nos gelados)',
    span: 1.6,
    steps: ({ caster, t1, t2, t3 }: DemoIds) => [
      { at: 0, e: { type: 'blackFrost', unitId: caster, x: 3, y: 0, radius: 3, targetIds: [t1, t2, t3], chilled: 2 } },
      ...hits(K.blackFrost.spikeAt, [t1, t2, t3], 'frost', caster, 18),
    ],
  },
  {
    cls: 'warlock',
    id: 'marsh',
    label: 'Lodaçal Abissal (raízes, lentidão e vulnerabilidade)',
    span: 3,
    steps: ({ caster, t1 }: DemoIds) => [{ at: 0, e: { type: 'abyssMarsh', unitId: caster, targetId: t1, ticks: 300, slowMult: 2.25, curseAmp: 0.2 } }],
  },
  {
    cls: 'warlock',
    id: 'apex',
    label: 'Ápice Sombrio (buff da própria Bruxa)',
    span: 3,
    steps: ({ caster }: DemoIds) => [{ at: 0, e: { type: 'darkApex', unitId: caster, ticks: 300, amp: 0.15 } }],
  },
];
