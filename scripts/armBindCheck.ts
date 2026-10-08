/**
 * Regressão do bind lateral (zumbis de braço aberto no Passo da Geada):
 * rigs com o segmento upperArm de lado (T-pose) travam os cotovelos para fora,
 * porque os clipes procedurais assumem braço pendente. hangArms pendura o
 * segmento; rigs Mixamo (LeftArm), braços já pendentes e comprimento zero
 * não disparam.
 */
import { hangArms } from '../src/render/units/model/glbMonsters';
import type { BoneDef } from '../src/render/units/model/ModelBuilder';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

const arm = (name: string, pos: [number, number, number]): BoneDef => ({ name, parent: 'shoulder.L', pos });

// T-pose como a do zombie.glb/orc.glb: segmento de lado
const side: BoneDef[] = [arm('upperArm.L', [0.06, 0, 0]), arm('upperArm.R', [-0.06, 0, 0])];
check('bind lateral dispara', hangArms(side) === true);
check('comprimento preservado', Math.abs(Math.hypot(...side[0].pos) - 0.06) < 1e-3, JSON.stringify(side[0].pos));
check('pendurado (aponta para baixo)', side[0].pos[1] < -0.05 && side[1].pos[1] < -0.05, JSON.stringify([side[0].pos, side[1].pos]));
check('mantém desvio lateral parcial', Math.abs(side[0].pos[0]) > 0, JSON.stringify(side[0].pos));

// já pendente: não mexe
const down: BoneDef[] = [arm('upperArm.L', [0.01, -0.1, 0])];
const before = JSON.stringify(down[0].pos);
check('braço pendente não dispara', hangArms(down) === false && JSON.stringify(down[0].pos) === before);

// rig Mixamo (cultista): nomes sem ponto, nunca toca
const mix: BoneDef[] = [{ name: 'LeftArm', parent: 'LeftShoulder', pos: [0.1, -0.3, 0] }];
check('rig Mixamo não dispara', hangArms(mix) === false);

// degenerado: comprimento zero não quebra
const zero: BoneDef[] = [arm('upperArm.L', [0, 0, 0])];
check('comprimento zero não dispara', hangArms(zero) === false);

if (failures) throw new Error(`armBindCheck: ${failures} FALHA(S)`);
console.log('armBindCheck: tudo certo');
