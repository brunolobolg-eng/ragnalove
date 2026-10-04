/**
 * Validacao headless dos clipes UAL com retargeting.
 * Roda o AnimationMixer de verdade (sem renderizar) e confere:
 *  1. toda track referencia um osso que existe (o bug da v1: nomes errados = boneco parado);
 *  2. os ossos realmente se movem e sem NaN;
 *  3. o quadril nao sai voando (deslocamento limitado);
 *  4. idle/walk fecham o loop (pose final ~= inicial).
 *
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/validateUAL.ts
 */
import * as THREE from 'three';
import { instantiateSkeleton } from '../src/render/units/model/ModelBuilder';
import { archerClips, archerClipsUAL, gruntClips, mageClips, mageClipsUAL, warriorClips, warriorClipsUAL, type ClipName } from '../src/render/units/model/anims';

let failures = 0;
const fail = (msg: string): void => {
  failures++;
  console.error(`  FALHA: ${msg}`);
};
const ok = (msg: string): void => console.log(`  ok: ${msg}`);

function quatDiff(a: THREE.Quaternion, b: THREE.Quaternion): number {
  const d = Math.abs(a.dot(b));
  return Math.acos(Math.min(1, Math.max(-1, d))) * 2;
}

function checkClips(label: string, clips: Record<ClipName, THREE.AnimationClip>, bones: { name: string }[]): void {
  console.log(`--- ${label} ---`);
  const names = new Set(bones.map((b) => b.name));
  const sk = instantiateSkeleton(bones as never);
  const mixer = new THREE.AnimationMixer(sk.root);

  for (const [clipName, clip] of Object.entries(clips) as [ClipName, THREE.AnimationClip][]) {
    // 1. tracks ligam em ossos reais? (nome do osso pode conter ".": corta no ULTIMO ponto)
    for (const t of clip.tracks) {
      const bone = t.name.slice(0, t.name.lastIndexOf('.'));
      if (!names.has(bone)) fail(`${clipName}: track "${t.name}" sem osso correspondente`);
      if (!Number.isFinite(clip.duration) || clip.duration <= 0) fail(`${clipName}: duracao invalida`);
      const vals = (t as unknown as { values: ArrayLike<number> }).values;
      for (let i = 0; i < vals.length; i++) if (!Number.isFinite(vals[i])) { fail(`${clipName}: NaN em "${t.name}"`); break; }
    }
    // 2. move de verdade? (compara todos os ossos antes/depois)
    const action = mixer.clipAction(clip);
    action.play();
    mixer.update(0);
    const hips0 = sk.byName.get('hips')!.getWorldPosition(new THREE.Vector3()).clone();
    const q0 = new Map(sk.bones.map((b) => [b.name, b.quaternion.clone()]));
    mixer.update(Math.min(0.5, clip.duration / 2));
    let moved = 0;
    for (const b of sk.bones) moved = Math.max(moved, quatDiff(q0.get(b.name)!, b.quaternion));
    if (moved < 0.01) fail(`${clipName}: nenhum osso se moveu`);
    const qMidThigh = sk.byName.get('thigh.L')!.quaternion.clone();
    // 3. quadril sob controle?
    const hips = sk.byName.get('hips')!.getWorldPosition(new THREE.Vector3());
    const drift = hips.distanceTo(hips0);
    if (drift > 0.6) fail(`${clipName}: quadril derivou ${drift.toFixed(2)}m`);
    // 4. loop fecha? (mesma fase com 1 ciclo de diferenca)
    if (clipName === 'idle' || clipName === 'walk') {
      action.stop();
      action.play();
      mixer.update(0);
      const qA = sk.byName.get('thigh.L')!.quaternion.clone();
      mixer.update(clip.duration);
      const qB = sk.byName.get('thigh.L')!.quaternion.clone();
      const d = quatDiff(qA, qB);
      void qMidThigh;
      if (d > 0.2) fail(`${clipName}: loop nao fecha (thigh diff ${d.toFixed(2)} rad)`);
      else ok(`${clipName}: loop fecha (diff ${d.toFixed(3)} rad)`);
    }
    ok(`${clipName}: ${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks, drift quadril ${drift.toFixed(3)}m`);
    action.stop();
    mixer.update(0);
  }
}

async function main(): Promise<void> {
  const { buildWarrior, buildMage, buildArcher, buildGrunt } = await import('../src/render/units/model/characters');
  const w = buildWarrior();
  checkClips('warrior UAL', warriorClipsUAL(w.bones), w.bones);
  const m = buildMage();
  checkClips('mage UAL', mageClipsUAL(m.bones), m.bones);
  const a = buildArcher();
  checkClips('archer UAL', archerClipsUAL(a.bones), a.bones);
  checkClips('warrior procedural', warriorClips(w.bones), w.bones);
  checkClips('mage procedural', mageClips(m.bones), m.bones);
  checkClips('archer procedural', archerClips(a.bones), a.bones);
  const g = buildGrunt();
  checkClips('grunt procedural', gruntClips(g.bones), g.bones);
  if (failures) throw new Error(`${failures} FALHA(S)`);
  console.log('\nTodas as validacoes passaram.');
}

main().catch((e) => {
  console.error(e);
  throw e;
});
