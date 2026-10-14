import * as THREE from 'three';
import { UAL_IMPACT, ualRawClips, type UALClipName } from './ualClips';

/**
 * Golpes e magias dos heróis com a captura da Universal Animation Library, cortados para o impacto cair no instante
 * que o jogo já usa (o dano e o efeito visual esperam esse instante). Assim o clipe fica natural sem mexer no FX.
 */

export interface UALShot {
  /** clipe da UAL (ver ualClips.ts) */
  clip: UALClipName;
  /** instante (s) em que o golpe cai no jogo; o começo do clipe é cortado para o impacto cair aqui */
  impactAt: number;
  /** 1 = velocidade normal; abaixo de 1 = mais lento e mais pesado */
  speed?: number;
  /** 1 = movimento normal; acima de 1 = o corpo vai mais longe do descanso */
  amp?: number;
}

let rawCache: Record<UALClipName, THREE.AnimationClip> | undefined;

/**
 * Recorte da captura UAL: o clipe começa `impactAt * speed` antes do impacto, para que o impacto caia no instante
 * pedido (com `speed` < 1 o movimento fica mais lento). Amostra cada trilha a 60 quadros por segundo.
 * O quadril sai em espaço UAL: `fitHips` (anims.ts) faz a escala para o boneco.
 */
export function heroShot({ clip, impactAt, speed = 1, amp = 1 }: UALShot): THREE.AnimationClip {
  rawCache ??= ualRawClips();
  const src = rawCache[clip];
  const impact = UAL_IMPACT[clip];
  if (impact === undefined) throw new Error(`heroUAL: sem impacto medido para o clipe UAL "${clip}"`);
  const start = impact - impactAt * speed;
  if (start < 0) throw new Error(`heroUAL: o impacto de "${clip}" em ${impactAt}s não cabe no clipe (começo ${start.toFixed(3)}s)`);
  const dur = (src.duration - start) / speed;
  const N = Math.max(2, Math.round(dur * 60));
  const times = Array.from({ length: N + 1 }, (_, i) => (i / N) * dur);
  const identity = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const out = new THREE.Quaternion();
  const tracks = src.tracks.map((tr) => {
    const interp = tr.createInterpolant();
    const last = tr.times[tr.times.length - 1];
    const values: number[] = [];
    const isQuat = tr instanceof THREE.QuaternionKeyframeTrack;
    for (const tau of times) {
      const v = interp.evaluate(Math.min(last, start + tau * speed));
      if (isQuat) {
        // amplitude: a rotação de cada osso vai `amp` vezes além do descanso (interpolação esférica a partir da identidade)
        q.set(v[0], v[1], v[2], v[3]);
        out.copy(identity).slerp(q, amp);
        values.push(out.x, out.y, out.z, out.w);
      } else values.push(v[0], v[1], v[2]);
    }
    return isQuat ? new THREE.QuaternionKeyframeTrack(tr.name, times, values) : new THREE.VectorKeyframeTrack(tr.name, times, values);
  });
  return new THREE.AnimationClip(`${clip}@${impactAt}`, dur, tracks);
}
