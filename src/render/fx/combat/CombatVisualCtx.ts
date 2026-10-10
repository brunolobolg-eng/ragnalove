import type * as THREE from 'three';
import type { FxKit, OneShotFx } from '../kit/FxKit';

/** O que um handler de classe precisa de uma unidade visual (ModelUnitView ou equivalente). */
export interface VisualUnit {
  root: THREE.Object3D;
  attack(style?: 'heavy'): void;
  cast(): void;
  hit(): void;
  setFacing(x: number, y: number, instant?: boolean): void;
  /** o herói ganhou nível (só as views de modelo têm a animação) */
  levelUp?(): void;
}

/**
 * Tudo que os efeitos de combate recebem do GameView (ou da vitrine de efeitos).
 * Os handlers só leem eventos da simulação e chamam isto — nunca mexem em regra de jogo.
 */
export interface CombatVisualCtx {
  readonly kit: FxKit;
  /** adiciona o efeito ao mundo; o GameView atualiza e descarta quando `done` */
  add(fx: OneShotFx): void;
  view(id: number): VisualUnit | undefined;
  /** tipo da unidade: 'mage', 'warrior', 'archer', 'assassin', 'grunt'... */
  kindOf(id: number): string | undefined;
  /** posição da base da unidade no mundo */
  pos(id: number): THREE.Vector3 | undefined;
  /** ponto de um tile no mundo (lift = altura acima do chão) */
  tile(x: number, y: number, lift?: number): THREE.Vector3;
  /** ponta do cajado (Mago) */
  staffTip(id: number): THREE.Vector3 | undefined;
  /** ponta do arco (Arqueira), a partir do tile de origem */
  bowTip(id: number, from: { x: number; y: number }): THREE.Vector3;
  /** eco fantasmagórico do personagem que conjura */
  spectre(id: number, dur: number): void;
  /** remove a malha de uma armadilha disparada (o GameView cuida da geometria) */
  trapGone(trapId: number): void;
  /** texto flutuante (dano, status, nomes de habilidade) */
  float(text: string, pos: THREE.Vector3, color: string, size?: number, life?: number, rise?: number): void;
  shake(amount: number): void;
  kick(amount: number): void;
  aberrate(amount: number): void;
}
