import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import type { ClipName } from './anims';
import { ualMixamoClips } from './ualMixamo';
import { mocapKeys } from './mocapDirs';
import { buildRig, poseClip, type PoseKey, type V3 } from './rigPose';
import { warriorRigClips } from './warriorAnims';
import { liftCurve } from './monsterRigAnims';
import { smoothAims, SMOOTH_SIGMA_BODY } from './monsterRigAttackAnims';

/**
 * Animações dos mini-chefes goblin (Krexx retorcido e Líder goblin). Variante própria, derivada do conjunto
 * warriorRig (que segue igual para o Guerreiro, a Feiticeira, a Bruxa e os goblins/dinos comuns).
 *
 * Ataque e magia vêm da captura UAL retargetada para o rig Mixamo (Punch_Jab e Spell_Simple_Shoot, ver
 * ualMixamo.ts). Só a captura crua abria o braço: a espada do Guerreiro (SLASH) puxava o braço direito
 * para fora, e a magia subia as mãos acima da cabeça. Por isso, por cima da captura, os braços ficam numa
 * caixa estreita: a abertura lateral e a altura do braço/antebraço são limitadas. O machado segue a mão
 * (KREXX_AXE, osso RightHand). Dano e o restante seguem o warriorRig. O Krexx retorcido (`krexxWarlordClips`) tem ainda
 * a sola elevada, a passada ampliada e a morte própria (ver as constantes SOLA, PASSADA e QUEDA); o líder não usa isso.
 *
 * Direções no espaço do corpo: X = lado esquerdo do herói, Y = cima, Z = frente.
 */

/** Duração de cada golpe no combate (s), igual à do warriorRig. */
const DURATION = { attack: 0.6, cast: 0.85 } as const;

/**
 * Largura (desvio-padrão, s) do filtro no tempo sobre a captura do golpe e da magia. A captura UAL (Punch_Jab) vira o
 * antebraço esquerdo de trás para a frente em ~0,06 s (62° e 29° em duas chaves, em t = 0,12 a 0,14 s): com 0,035 s o
 * salto ainda era de 43° por quadro. Com 0,09 s o antebraço gira no máximo ~10° por quadro e a mão não passa de 0,15 por quadro.
 */
const SMOOTH_SIGMA_ATTACK = 0.09;

/** Limites da caixa dos braços (componente da direção, sem unidades). */
export const BOSS_ARM_BOX = {
  /** abertura lateral máxima do braço e do antebraço (|X|) */
  side: 0.3,
  /** altura máxima da direção do braço (Y): acima disso o cotovelo sobe para fora do tronco */
  upperTop: 0.35,
  /** altura máxima da direção do antebraço (Y): a mão fica na altura do peito, não acima da cabeça */
  foreTop: 0.45,
};

const ARMS = ['RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm'] as const;

/** Aperta a direção dos braços dentro da caixa (`BOSS_ARM_BOX`). Mexe só em `aim` dos braços. */
function boxArms(keys: PoseKey[], box: typeof BOSS_ARM_BOX): PoseKey[] {
  return keys.map((k) => {
    if (!k.joints) return k;
    const joints = { ...k.joints };
    for (const bone of ARMS) {
      const j = joints[bone];
      if (!j?.aim) continue;
      const [x, y, z] = j.aim;
      const top = bone.endsWith('ForeArm') ? box.foreTop : box.upperTop;
      const v = new THREE.Vector3(Math.max(-box.side, Math.min(box.side, x)), Math.min(y, top), z).normalize();
      joints[bone] = { ...j, aim: [v.x, v.y, v.z] as V3 };
    }
    return { ...k, joints };
  });
}

/** Troca o tempo da captura para a duração de combate (mesma regra do warriorRig). */
function retime(keys: PoseKey[], from: number, to: number): PoseKey[] {
  const f = to / from;
  return keys.map((k) => ({ ...k, t: k.t * f }));
}

/** Conjunto dos dois mini-chefes goblin (líder e Krexx retorcido): golpe e magia com a captura suavizada no tempo. */
export function goblinBossRigClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const rig = buildRig(bones);
  const raw = ualMixamoClips();
  const boxed = (name: string, clip: THREE.AnimationClip, duration: number): THREE.AnimationClip =>
    poseClip(name, duration, boxArms(smoothAims(retime(mocapKeys(clip), clip.duration, duration), SMOOTH_SIGMA_ATTACK), BOSS_ARM_BOX), rig);
  return {
    ...warriorRigClips(bones),
    attack: boxed('attack', raw.attack, DURATION.attack),
    cast: boxed('cast', raw.cast, DURATION.cast),
  };
}

/**
 * Altura da sola do Krexx retorcido (mesma escala do modelo): parado, a malha desce ~0,19 abaixo do tornozelo (medido), e a
 * sola afundava. Por isso os clipes de pé sobem SOLA (0,14: o parado fica a +0,02 do chão, sem flutuar). Na morte, o corpo
 * sobe SOLA no início e a elevação sai na queda, na fase da virada das pernas (QUEDA), para o corpo deitado ficar no chão.
 */
const SOLA = 0.14;

/**
 * Passada: o desvio da coxa vai PASSADA vezes em torno da direção média (1 = a captura UAL). Com 2,5 e `walkRate` 1,75
 * (visualConfig.ts), a deriva média do pé apoiado cai a +0,27 m/s (era +1,18 m/s); a mediana do módulo fica em 0,36 m/s
 * sem a inclinação do modelo (0,47 m/s com ela, que é o que o jogador vê).
 */
const PASSADA = 2.5;

/** Fase da queda (0..1 da duração) em que a elevação da sola sai: a mesma virada das pernas de monsterRigAnims.ts. */
const QUEDA = { de: 0.3, ate: 0.55 } as const;

/** Coxas: a passada do andar. */
const COXAS = ['LeftUpLeg', 'RightUpLeg'] as const;

/** Pernas da morte: coxa e canela, dos dois lados. */
const PERNAS = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'] as const;

/** Rampa suave (0 → 1) entre dois pontos da queda. */
function suave(x: number): number {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
}

/**
 * Inclinação do modelo inteiro (ModelUnitView.ts, MODEL_LEAN = -0,38 rad em X): o corpo fica 22° para a frente no mundo.
 * A pose deitada é escrita no mundo (horizontal, no chão) e convertida para o espaço do modelo, desfazendo a inclinação.
 */
const INCLINACAO = 0.38;

/** Direção do mundo para o espaço do modelo (desfaz a inclinação: rotação em X de +INCLINACAO). */
function paraModelo(g: V3): V3 {
  const c = Math.cos(INCLINACAO);
  const s = Math.sin(INCLINACAO);
  const [x, y, z] = g;
  return [x, y * c - z * s, y * s + z * c];
}

/** Coluna e cabeça: deitadas para a cabeça (−Z no mundo). Pernas: no prolongamento do corpo, para os pés (+Z). */
const TORSO_DEITADO = paraModelo([0, 0, -1]);
const PERNAS_DEITADAS = paraModelo([0, 0, 1]);
const COLUNA = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Head'] as const;

/**
 * Morte do Krexx retorcido: na queda, a coluna e a cabeça deitam no chão e as pernas viram para o prolongamento do corpo
 * (fase da virada, QUEDA, a mesma rampa de monsterRigDeath). Não usa a direção fixa de monsterRigAnims.ts (pernas para
 * baixo no espaço do modelo): com a inclinação do modelo, essa deixava o Krexx de pé sobre as pernas.
 */
function deitaNoChao(keys: PoseKey[], duration: number): PoseKey[] {
  return keys.map((k) => {
    const w = suave((k.t / duration - QUEDA.de) / (QUEDA.ate - QUEDA.de));
    if (w <= 0 || !k.joints) return k;
    const joints = { ...k.joints };
    const puxa = (bones: readonly string[], alvo: V3): void => {
      for (const bone of bones) {
        const j = joints[bone];
        if (!j?.aim) continue;
        const v = new THREE.Vector3(...j.aim).normalize().lerp(new THREE.Vector3(...alvo).normalize(), w).normalize();
        joints[bone] = { ...j, aim: [v.x, v.y, v.z] as V3 };
      }
    };
    puxa(COLUNA, TORSO_DEITADO);
    puxa(PERNAS, PERNAS_DEITADAS);
    return { ...k, joints };
  });
}

/** Folga do chão do corpo deitado (mesmo valor de rigPose.ts e monsterRigAnims.ts). */
const FOLGA_DEITADO = 0.1;

/**
 * Corpo deitado: a cabeça bate no chão em ~1,1 s e afunda ~0,17 no impacto, depois assenta. O corpo sobe LEVANTA_DEITADO
 * (folga do crânio, medida) a partir de LEVANTA.ate (1,08 s), quando a cabeça já toca o chão.
 */
const LEVANTA_DEITADO = 0.1;
const LEVANTA = { ate: 0.45 } as const;

/**
 * Passada do Krexx retorcido: a coxa vai `k` vezes mais longe em torno da direção média do ciclo (só `aim` das coxas).
 * A captura UAL dá passos curtos para a velocidade do jogo (1 tile a cada 0,6 s): sem isso, o pé apoiado ia para a frente
 * junto com o corpo (+1,18 m/s de deriva).
 */
function passadaAmpla(keys: PoseKey[], k: number): PoseKey[] {
  const media = new Map<string, THREE.Vector3>();
  for (const bone of COXAS) {
    const soma = new THREE.Vector3();
    for (const key of keys) {
      const a = key.joints?.[bone]?.aim;
      if (a) soma.add(new THREE.Vector3(...a).normalize());
    }
    media.set(bone, soma.normalize());
  }
  return keys.map((key) => {
    if (!key.joints) return key;
    const joints = { ...key.joints };
    for (const bone of COXAS) {
      const j = joints[bone];
      const m = media.get(bone);
      if (!j?.aim || !m) continue;
      const v = m.clone().add(new THREE.Vector3(...j.aim).normalize().sub(m).multiplyScalar(k)).normalize();
      joints[bone] = { ...j, aim: [v.x, v.y, v.z] as V3 };
    }
    return { ...key, joints };
  });
}

/**
 * Krexx retorcido (goblinWarlord): o conjunto do líder goblin, com a sola elevada (SOLA) nos clipes de pé, a passada
 * ampliada no andar e a morte própria (deitaNoChao), com a elevação da sola saindo na queda. Só este mini-chefe usa o
 * conjunto `krexxWarlord` (visualConfig.ts): o líder goblin não muda.
 */
export function krexxWarlordClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const rig = buildRig(bones);
  const raw = ualMixamoClips();
  const base = goblinBossRigClips(bones);
  const walk = poseClip('walk', raw.walk.duration, passadaAmpla(mocapKeys(raw.walk), PASSADA), rig);
  const emPe = (c: THREE.AnimationClip): THREE.AnimationClip => liftCurve(c, [[0, SOLA], [c.duration, SOLA]]);
  // morte: ground 'body' põe o corpo no chão com folga (FOLGA_DEITADO); de pé, a folga sai, e a sola fica a SOLA do chão
  const d = raw.death.duration;
  const queda = poseClip('death', d, smoothAims(deitaNoChao(mocapKeys(raw.death), d), SMOOTH_SIGMA_BODY), rig, {}, { ground: 'body' });
  const dob = (x: number): number => x * d;
  return {
    idle: emPe(base.idle),
    walk: emPe(walk),
    attack: emPe(base.attack),
    heavy: emPe(base.heavy),
    cast: emPe(base.cast),
    hit: emPe(base.hit),
    death: liftCurve(queda, [[0, SOLA - FOLGA_DEITADO], [dob(QUEDA.de), SOLA - FOLGA_DEITADO], [dob(LEVANTA.ate), LEVANTA_DEITADO]]),
  };
}
