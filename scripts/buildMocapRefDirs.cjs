/**
 * Gera src/render/units/model/mocapRefDirs.ts: para cada osso que aponta para um filho (coxa→canela, braço→
 * antebraço...), a direção desse filho dentro do próprio osso, na pose de bind do rig de referência (bongun,
 * mesmo esqueleto Mixamo do cultista). Com isso, a captura da UAL (que traz a rotação de cada osso) vira a
 * direção de cada membro no corpo, e a direção é copiada para o Guerreiro (retarget por direção).
 *
 * Uso: node scripts/buildMocapRefDirs.cjs
 */
const THREE = require('three');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'public/models/bongun.glb');
const OUT = join(ROOT, 'src/render/units/model/mocapRefDirs.ts');

/** Osso → filho cuja direção ele define (mesma tabela do solver de pose). */
const CHILD = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'Head_top',
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot',
  LeftFoot: null, RightFoot: null,
};
/** Pés: sem filho no rig; a direção de referência é a frente (+Z). */
const FORWARD_BONES = ['LeftFoot', 'RightFoot'];

const buf = readFileSync(SRC);
const jl = buf.readUInt32LE(12);
const doc = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
const bin = buf.slice(20 + jl + 8);
const skin = doc.skins[0];
const names = skin.joints.map((ni) => doc.nodes[ni].name);
const acc = doc.accessors[skin.inverseBindMatrices];
const bv = doc.bufferViews[acc.bufferView];
const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

// matriz de bind de cada osso no mundo = inversa da IBM (a IBM é column-major, como o three)
const bindWorld = names.map((_, k) =>
  new THREE.Matrix4().fromArray(Array.from({ length: 16 }, (_, i) => dv.getFloat32(base + k * 64 + i * 4, true))).invert(),
);
const idx = (n) => names.indexOf(n);
const bindPos = (n) => new THREE.Vector3().setFromMatrixPosition(bindWorld[idx(n)]);
const bindQ = (n) => new THREE.Quaternion().setFromRotationMatrix(bindWorld[idx(n)]);

const out = {};
for (const [bone, child] of Object.entries(CHILD)) {
  if (idx(bone) < 0) continue;
  const restQ = bindQ(bone);
  let dirW;
  if (FORWARD_BONES.includes(bone)) dirW = new THREE.Vector3(0, 0, 1);
  else if (child && idx(child) >= 0) dirW = bindPos(child).sub(bindPos(bone)).normalize();
  else continue;
  // direção no espaço local do osso: u = inv(rotação de bind) × direção no mundo
  const u = dirW.clone().applyQuaternion(restQ.clone().invert()).normalize();
  out[bone] = [+u.x.toFixed(4), +u.y.toFixed(4), +u.z.toFixed(4)];
}
// cabeça sem filho no rig: usa o "cima" do osso como direção
if (idx('Head') >= 0 && !out.Head) {
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(bindQ('Head').invert()).normalize();
  out.Head = [+u.x.toFixed(4), +u.y.toFixed(4), +u.z.toFixed(4)];
}

const lines = Object.entries(out).map(([k, v]) => `  ${k}: [${v.join(', ')}],`);
const txt = `// Gerado por scripts/buildMocapRefDirs.cjs a partir de public/models/bongun.glb — NÃO editar.
// Direção de cada membro dentro do próprio osso (pose de bind T do rig Mixamo do cultista).
export const MOCAP_REF_DIR: Record<string, [number, number, number]> = {
${lines.join('\n')}
};
`;
writeFileSync(OUT, txt);
console.log('ok', Object.keys(out).length, 'ossos ->', OUT);
