// Auditoria de um .glb novo (regra do projeto: antes de usar qualquer modelo, conferir cor, animações,
// tamanho e fluidez das animações). Só lê o arquivo; não altera nada.
// Uso: node scripts/auditar_glb.cjs <arquivo.glb> [mais arquivos...]
const fs = require('fs');

const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const DEG = 180 / Math.PI;

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('não é GLB');
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
  const binStart = 20 + jl + 8;
  const bin = buf.slice(binStart, binStart + buf.readUInt32LE(20 + jl));
  return { buf, json, bin };
}

// lê um accessor como array de números (com stride de bufferView, se houver)
function readAccessor(json, bin, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const nc = NCOMP[a.type];
  const cs = COMP[a.componentType];
  const stride = bv.byteStride || nc * cs;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Array(a.count * nc);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < nc; c++) {
      const off = base + i * stride + c * cs;
      let v;
      if (a.componentType === 5126) v = bin.readFloatLE(off);
      else if (a.componentType === 5123) v = bin.readUInt16LE(off);
      else if (a.componentType === 5121) v = bin.readUInt8(off);
      else if (a.componentType === 5125) v = bin.readUInt32LE(off);
      else if (a.componentType === 5122) v = bin.readInt16LE(off);
      else v = bin.readInt8(off);
      if (a.normalized && a.componentType !== 5126) v = v / (a.componentType === 5121 ? 255 : a.componentType === 5123 ? 65535 : 1);
      out[i * nc + c] = v;
    }
  }
  return out;
}

// dimensões de imagem (PNG, JPEG, WebP) a partir do cabeçalho
function imageSize(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const tag = b.toString('ascii', 12, 16);
    if (tag === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (tag === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    if (tag === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  return null;
}

// ângulo (graus) entre dois quaternions
function quatAngle(a, b) {
  const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(d) * DEG;
}

function audit(file) {
  const { buf, json, bin } = readGlb(file);
  const out = [];
  const warn = [];
  const info = (s) => out.push(s);
  const bad = (s) => warn.push(s);
  const mb = (n) => (n / 1048576).toFixed(2);

  info(`== ${file}`);
  info(`tamanho: ${mb(buf.length)} MB | gerador: ${json.asset?.generator ?? '?'} | extensões: ${(json.extensionsUsed || []).join(', ') || '-'}`);
  if (buf.length > 8 * 1048576) bad(`arquivo grande (${mb(buf.length)} MB): otimizar (meta de personagem: 1,5 a 4 MB)`);

  // ---- cor: vértices, texturas, cor chapada
  const prims = (json.meshes || []).flatMap((m) => m.primitives);
  const withColor = prims.filter((p) => p.attributes.COLOR_0 !== undefined).length;
  const withUv = prims.filter((p) => p.attributes.TEXCOORD_0 !== undefined).length;
  let verts = 0, tris = 0;
  for (const p of prims) {
    const n = json.accessors[p.attributes.POSITION].count;
    verts += n;
    tris += p.indices !== undefined ? json.accessors[p.indices].count / 3 : n / 3;
  }
  info(`malhas: ${(json.meshes || []).length} (${prims.length} primitivas) | vértices ${verts} | triângulos ${Math.round(tris)}`);
  const maxInfl = prims.reduce((m, p) => Math.max(m, p.attributes.JOINTS_1 !== undefined ? 8 : p.attributes.JOINTS_0 !== undefined ? 4 : 0), 0);
  if (maxInfl > 4) bad(`mais de 4 ossos por vértice (JOINTS_1 presente): o jogo usa só os 4 primeiros; limpar`);
  if (verts > 60000) bad(`malha densa (${verts} vértices): reduzir (alvo de personagem: 15 a 40 mil)`);

  const images = json.images || [];
  const texInfo = images.map((im, i) => {
    const bv = im.bufferView !== undefined ? json.bufferViews[im.bufferView] : null;
    const bytes = bv ? bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength) : null;
    const dim = bytes ? imageSize(bytes) : null;
    return { i, mime: im.mimeType ?? im.uri ?? '?', kb: bv ? (bv.byteLength / 1024).toFixed(0) : '-', dim };
  });
  for (const t of texInfo) info(`textura ${t.i}: ${t.mime} ${t.kb} KB ${t.dim ? `${t.dim[0]}x${t.dim[1]}` : '(dimensão desconhecida)'}`);
  const bigTex = texInfo.find((t) => t.dim && Math.max(t.dim[0], t.dim[1]) > 1024);
  if (bigTex) bad(`textura ${bigTex.dim[0]}x${bigTex.dim[1]}: personagens usam até 1024 px (WebP)`);
  if (texInfo.some((t) => /png|jpeg|jpg/.test(t.mime) && t.dim && Math.max(...t.dim) >= 1024)) bad(`textura PNG/JPG de 1024 px ou mais: converter para WebP`);
  const colorMats = (json.materials || []).map((m) => m.pbrMetallicRoughness?.baseColorFactor).filter(Boolean);
  const hasTex = texInfo.length > 0;
  const colorMode = withColor ? 'cor por vértice' : hasTex ? 'textura' : colorMats.length ? 'cor chapada no material' : 'sem cor (cinza)';
  info(`COR: ${colorMode}${withColor ? ` (COLOR_0 em ${withColor}/${prims.length} primitivas)` : ''}${hasTex && withUv === 0 ? ' | ATENÇÃO: textura sem UV' : ''}`);
  if (!withColor && !hasTex && colorMats.length === 0) bad('sem cor: o modelo sairá cinza; confirmar com o dono');

  // ---- esqueleto: nomes e pose de bind
  const skin = (json.skins || [])[0];
  if (!skin) {
    info('esqueleto: NENHUM (malha sem ossos: não anima)');
    bad('sem esqueleto: não anima no jogo');
  } else {
    const names = skin.joints.map((j) => json.nodes[j].name ?? `#${j}`);
    const std = names.some((n) => /^upperArm\.[LR]$/.test(n)) ? 'padrão do jogo (upperArm.L)' : names.some((n) => /^(Left|Right)Arm$/.test(n)) ? 'Mixamo/cultista (LeftArm)' : 'outro';
    info(`esqueleto: ${names.length} ossos, nomes ${std} | ex.: ${names.slice(0, 8).join(', ')}`);
    // bind (matrizes inversas) x pose dos nós: se divergirem, a malha sai deslocada
    if (skin.inverseBindMatrices !== undefined) {
      const ibm = readAccessor(json, bin, skin.inverseBindMatrices);
      const parent = new Map();
      json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
      const local = (n) => {
        const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
        const [x, y, z, w] = q;
        const r = [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y)];
        return [r[0]*s[0], r[1]*s[0], r[2]*s[0], 0, r[3]*s[1], r[4]*s[1], r[5]*s[1], 0, r[6]*s[2], r[7]*s[2], r[8]*s[2], 0, t[0], t[1], t[2], 1];
      };
      const mul = (a, c) => { const o = new Array(16).fill(0); for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) o[col*4+row] += a[k*4+row]*c[col*4+k]; return o; };
      const memo = new Map();
      const world = (i) => { if (memo.has(i)) return memo.get(i); const p = parent.get(i); const W = p === undefined ? local(json.nodes[i]) : mul(world(p), local(json.nodes[i])); memo.set(i, W); return W; };
      let worst = 0;
      skin.joints.forEach((j, k) => {
        const m = ibm.slice(k * 16, k * 16 + 16);
        // posição do osso no bind = inversa da matriz inversa (rígida): -R^T t
        const t = [m[12], m[13], m[14]];
        const bindPos = [0, 1, 2].map((r) => -(m[r * 4] * t[0] + m[r * 4 + 1] * t[1] + m[r * 4 + 2] * t[2]));
        const w = world(j);
        const d = Math.hypot(bindPos[0] - w[12], bindPos[1] - w[13], bindPos[2] - w[14]);
        worst = Math.max(worst, d);
      });
      info(`bind x nós: maior diferença de posição de osso = ${worst.toFixed(3)} (unidades do modelo)`);
      if (worst > 0.05) bad(`pose de descanso dos nós diverge do bind (${worst.toFixed(2)}): a malha sai deslocada/torta. Usar bind 'ibm' no registro do modelo`);
    }
  }

  // ---- pele presa a osso errado: o osso que mais pesa num vértice deve ser um dos mais próximos dele
  // (rigagem ruim faz o tronco/braços seguirem a cabeça e a malha se rasga no golpe)
  if (skin && prims.length && skin.inverseBindMatrices !== undefined) {
    const ibmArr = readAccessor(json, bin, skin.inverseBindMatrices);
    const jointOf = new Map(skin.joints.map((n, k) => [n, k]));
    const bp = skin.joints.map((_, k) => {
      const m = ibmArr.slice(k * 16, k * 16 + 16);
      const t = [m[12], m[13], m[14]];
      return [0, 1, 2].map((r) => -(m[r * 4] * t[0] + m[r * 4 + 1] * t[1] + m[r * 4 + 2] * t[2]));
    });
    // cada osso vira um segmento: até o filho (ou, na ponta, do pai até ele)
    const segs = skin.joints.map((n, k) => {
      const kid = (json.nodes[n].children || []).find((c) => jointOf.has(c));
      if (kid !== undefined) return [k, jointOf.get(kid)];
      const par = skin.joints.findIndex((pn) => (json.nodes[pn].children || []).includes(n));
      return par >= 0 ? [par, k] : [k, k];
    });
    const distSeg = (p, a, b) => {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const u = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len2)) : 0;
      return Math.hypot(p[0] - (a[0] + ab[0] * u), p[1] - (a[1] + ab[1] * u), p[2] - (a[2] + ab[2] * u));
    };
    let total = 0, far = 0, worstGap = 0;
    for (const p of prims) {
      if (p.attributes.JOINTS_0 === undefined || p.attributes.WEIGHTS_0 === undefined) continue;
      const P = readAccessor(json, bin, p.attributes.POSITION);
      const sets = [0, 1, 2].map((k) => [p.attributes[`JOINTS_${k}`], p.attributes[`WEIGHTS_${k}`]]).filter(([j, w]) => j !== undefined && w !== undefined)
        .map(([j, w]) => [readAccessor(json, bin, j), readAccessor(json, bin, w)]);
      const n = P.length / 3;
      for (let v = 0; v < n; v++) {
        let dom = 0, domW = -1;
        for (const [J, W] of sets) for (let c = 0; c < 4; c++) if (W[v * 4 + c] > domW) { domW = W[v * 4 + c]; dom = J[v * 4 + c]; }
        const pt = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
        let near = Infinity;
        for (const [a, b] of segs) near = Math.min(near, distSeg(pt, bp[a], bp[b]));
        const [a, b] = segs[dom] ?? [dom, dom];
        const gap = distSeg(pt, bp[a], bp[b]) - near;
        total++;
        if (gap > 0.1) far++;
        if (gap > worstGap) worstGap = gap;
      }
    }
    if (total) {
      const pct = (100 * far) / total;
      info(`pele: ${pct.toFixed(1)}% dos vértices presos a osso distante (o osso mais pesado fica >0,1 m mais longe que o osso mais próximo; pior ${worstGap.toFixed(2)} m). Modelos que já funcionam no jogo: 0 a 15%`);
      if (pct > 20) bad(`pele presa a osso errado em ${pct.toFixed(0)}% dos vértices (acima dos modelos que já funcionam): o movimento rasga/deforma a malha. Refazer os pesos da rigagem`);
    }
  }

  // ---- animações: quantidade, nomes, densidade de chaves, emenda do loop, passo (trava)
  const anims = json.animations || [];
  info(`animações: ${anims.length}`);
  if (anims.length === 0) bad('sem animações embutidas: o jogo precisa de clipes de outro conjunto (clips no registro)');
  const REQUIRED = ['idle', 'walk', 'attack', 'hit', 'death'];
  if (anims.length) {
    const names = anims.map((a) => (a.name ?? '').toLowerCase());
    const miss = REQUIRED.filter((r) => !names.includes(r));
    info(`nomes: ${anims.map((a) => a.name ?? '-').join(', ')}`);
    if (miss.length) info(`faltam nomes para o jogo: ${miss.join(', ')} (o jogo cai no clipe mais próximo ou usa clips do registro)`);
  }
  for (const a of anims) {
    let dur = 0, keys = 0, stepCh = 0, seamWorst = 0, seamKind = '';
    const kpsList = [];
    for (const c of a.channels) {
      const s = a.samplers[c.sampler];
      const times = readAccessor(json, bin, s.input);
      const vals = readAccessor(json, bin, s.output);
      const d = times[times.length - 1] - times[0];
      dur = Math.max(dur, times[times.length - 1]);
      keys += times.length;
      if (d > 0) kpsList.push(times.length / d);
      if (s.interpolation === 'STEP') stepCh++;
      if (c.target.path === 'rotation' && times.length > 1) {
        const n = 4;
        const first = vals.slice(0, n), last = vals.slice(vals.length - n);
        const ang = quatAngle(first, last);
        if (ang > seamWorst) { seamWorst = ang; seamKind = json.nodes[c.target.node]?.name ?? c.target.node; }
      }
    }
    kpsList.sort((x, y) => x - y);
    const medKps = kpsList.length ? kpsList[Math.floor(kpsList.length / 2)] : 0;
    info(`  - "${a.name ?? '-'}": ${a.channels.length} canais, ${dur.toFixed(2)} s, ${keys} chaves, mediana ${medKps.toFixed(1)} chaves/s por canal, passos (STEP) em ${stepCh} canais, emenda da rotação ${seamWorst.toFixed(1)}° (${seamKind || '-'})`);
    if (medKps > 0 && medKps < 24) bad(`"${a.name}": só ${medKps.toFixed(0)} chaves/s: pode parecer travado (reamostrar a 30 fps)`);
    if (stepCh > 0) bad(`"${a.name}": ${stepCh} canais com interpolação em degrau (STEP): trava o movimento`);
    if (/idle|walk/i.test(a.name ?? '') && seamWorst > 8) bad(`"${a.name}": a emenda do loop salta ${seamWorst.toFixed(0)}° (${seamKind}): o movimento dá um tranco no ciclo`);
  }

  // ---- peso por categoria (o que mais pesa no arquivo)
  const cat = new Map();
  const kindOf = new Map();
  for (const p of prims) {
    if (p.indices !== undefined) kindOf.set(json.accessors[p.indices].bufferView, 'índices');
    for (const ai of Object.values(p.attributes)) kindOf.set(json.accessors[ai].bufferView, 'atributos da malha');
  }
  for (const s of json.skins || []) kindOf.set(json.accessors[s.inverseBindMatrices].bufferView, 'bind (ossos)');
  for (const a of anims) for (const s of a.samplers) { kindOf.set(json.accessors[s.input].bufferView, 'animações'); kindOf.set(json.accessors[s.output].bufferView, 'animações'); }
  for (const im of images) if (im.bufferView !== undefined) kindOf.set(im.bufferView, 'texturas');
  json.bufferViews.forEach((bv, i) => { const k = kindOf.get(i) ?? 'outros'; cat.set(k, (cat.get(k) || 0) + bv.byteLength); });
  info('peso: ' + [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${mb(v)} MB`).join(' | '));

  info(warn.length ? `PRECISA DE AJUSTE (${warn.length}):\n  - ${warn.join('\n  - ')}` : 'OK: nada a ajustar nas checagens automáticas (confira a fluidez no navegador).');
  return out.join('\n');
}

const files = process.argv.slice(2);
if (!files.length) { console.error('uso: node scripts/auditar_glb.cjs <arquivo.glb> [...]'); process.exit(1); }
for (const f of files) {
  try { console.log(audit(f)); } catch (err) { console.log(`== ${f}\nerro na auditoria: ${err.message}`); }
  console.log('');
}
