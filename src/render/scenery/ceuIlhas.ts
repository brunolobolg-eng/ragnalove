import * as THREE from 'three';
import { ATO4_COMPOSICAO as COMP, ATO4_CEU_ILHAS as C, VISUAL_CONFIG } from '../../config/visualConfig';
import type { ParsedZone } from '../../config/zones';
import { instanceKit, kitMatrix, loadTexture, precarregarImagens } from './naturKit';

/**
 * Ato IV — Ilhas e nuvens (protótipo, só visual; a flag, os números e as regras de composição estão em visualConfig.ts:
 * `ATO4_CEU_ILHAS` e `ATO4_COMPOSICAO`). Acrescenta ao grupo do tabuleiro (BoardView.ts) e troca o chão e a decoração:
 *   - céu em degradê (esfera por dentro, cores por vértice, sem textura);
 *   - chão da arena com as texturas do dono: pedra clara, azulejo dourado no portão, grama só na borda e rocha no flanco;
 *   - obstáculos da grade com peças das ilhas (rocha escura da ilha e pilares de ruína), no lugar das árvores e pedras de gelo;
 *   - decoração de borda em pares (tocheiros, bandeiras, cercas, pilares), mar de nuvens, ilhas, pontes e nuvens soltas.
 * Não mexe na grade, no Board nem na simulação: só põe objetos a mais na cena. Sem canvas: tudo é WebP do dono ou a rocha
 * do naturKit com a textura do dono. Cada camada só usa as peças da sua lista em ATO4_COMPOSICAO.
 */

export interface CeuIlhasHandle {
  group: THREE.Group;
  update(dt: number): void;
}

/** O céu de ilhas vale só com a flag ligada e para as zonas da lista do config. */
export function ceuIlhasAtivo(zoneId: string): boolean {
  return C.ativo && C.zonas.includes(zoneId);
}

// começa a carregar as texturas do ato no arranque: a primeira batalha monta o chão com textura pronta
if (C.ativo) precarregarImagens([C.chao.pedra, C.chao.azulejo, C.chao.grama, C.chao.rocha, C.mar.textura].map((n) => `${C.dir}${n}`));

/** Billboard: uma peça recortada que sempre encara a câmera; a base (y) fica no ponto dado. */
interface Bill {
  s: THREE.Sprite;
  tex: THREE.Texture;
  altura: number;
  /** Proporção da imagem ainda não conhecida (a textura chega depois): a largura sai dela quando carregar. */
  pronto: boolean;
  anima?: (t: number) => void;
}

/** Número fixo entre 0 e 1 para cada tile: escolhe a peça e a variação. Visual apenas (não é sorteio da lógica). */
function sorte(x: number, y: number, semente = 0): number {
  let h = Math.imul(x + 101 * semente + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** UV escalado: a textura repete a cada `por` tiles, sem repeat global (a mesma textura serve a vários planos). */
function escalaUv(g: THREE.BufferGeometry, sx: number, sy: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return g;
}

/** Plano horizontal de w × h tiles (y = 0, normal para cima), com a textura repetida a cada `por` tiles. */
function piso(w: number, h: number, por: number): THREE.BufferGeometry {
  return escalaUv(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), w / por, h / por);
}

/**
 * Peças de obstáculo em billboard instanciado: uma chamada de desenho por peça. Cada cópia encara a câmera (como um sprite)
 * e tem a base no chão do tile (y = 0). A largura sai da proporção da arte, que pode chegar depois da montagem.
 */
function billboardsInstanciados(tex: THREE.Texture, pontos: { x: number; z: number; altura: number }[]): THREE.InstancedMesh {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, depthWrite: false });
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), mat, pontos.length);
  im.frustumCulled = false;
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const m = new THREE.Matrix4();
  im.onBeforeRender = (_renderer, _scene, camera) => {
    const img = tex.image as { width: number; height: number } | undefined;
    const proporcao = img ? img.width / img.height : 0;
    q.copy(camera.quaternion);
    pontos.forEach((pt, i) => {
      p.set(pt.x, 0, pt.z);
      s.set(pt.altura * proporcao, pt.altura, 1);
      im.setMatrixAt(i, m.compose(p, q, s));
    });
    im.instanceMatrix.needsUpdate = true;
  };
  return im;
}

/** Monta o céu de ilhas do tabuleiro de W × H casas (centro no zero do mundo, como o cenário). */
export function buildCeuIlhas(zone: ParsedZone): CeuIlhasHandle {
  const W = zone.width;
  const H = zone.height;
  const X = (x: number) => x - W / 2 + 0.5;
  const Z = (y: number) => y - H / 2 + 0.5;
  const group = new THREE.Group();
  /** Texturas por caminho (uma carga por arquivo nesta montagem). */
  const cache = new Map<string, THREE.Texture>();
  const textura = (url: string): THREE.Texture => {
    let t = cache.get(url);
    if (!t) cache.set(url, (t = loadTexture(url)));
    return t;
  };
  const pasta = C.dir;
  /** Só as peças da lista da camada (ATO4_COMPOSICAO); o que não estiver na lista é ignorado. */
  const permitido = (lista: readonly string[], peca: string) => lista.includes(peca);

  // ---------------- Céu: esfera por dentro, degradê de três cores por vértice (sem textura) ----------------
  const R = C.ceu.raio;
  const ceuGeo = new THREE.SphereGeometry(R, 32, 16);
  const pos = ceuGeo.attributes.position as THREE.BufferAttribute;
  const cores = new Float32Array(pos.count * 3);
  const topo = new THREE.Color(C.ceu.topo);
  const meio = new THREE.Color(C.ceu.meio);
  const base = new THREE.Color(C.ceu.base);
  const cor = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) / R; // -1 (base) a 1 (topo)
    if (k >= 0) cor.copy(meio).lerp(topo, k);
    else cor.copy(meio).lerp(base, -k);
    cores[i * 3] = cor.r;
    cores[i * 3 + 1] = cor.g;
    cores[i * 3 + 2] = cor.b;
  }
  ceuGeo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  const ceu = new THREE.Mesh(ceuGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  ceu.renderOrder = -10;
  ceu.frustumCulled = false;
  group.add(ceu);

  // ---------------- Chão da ilha: pedra clara na arena, grama só na borda de grama (plano maior, por baixo) ----------------
  const B = C.chao.borda;
  const por = C.chao.porTextura;
  const grama = new THREE.Mesh(piso(W + 2 * B, H + 2 * B, por), new THREE.MeshLambertMaterial({ map: textura(`${pasta}${C.chao.grama}`) }));
  grama.position.y = -0.03;
  grama.receiveShadow = true;
  group.add(grama);
  const pedra = new THREE.Mesh(piso(W, H, por), new THREE.MeshLambertMaterial({ map: textura(`${pasta}${C.chao.pedra}`) }));
  pedra.receiveShadow = true;
  group.add(pedra);

  // azulejo dourado no portão e na praça (um losango por casa, sobre a pedra)
  const casas = (lista: { x: number; y: number }[], url: string, cor = 0xffffff) => {
    if (!lista.length) return;
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: textura(url), color: cor, polygonOffset: true, polygonOffsetFactor: -1 }), lista.length);
    const mx = new THREE.Matrix4();
    lista.forEach((p, i) => {
      mx.makeTranslation(X(p.x), 0.008, Z(p.y));
      m.setMatrixAt(i, mx);
    });
    m.receiveShadow = true;
    group.add(m);
  };
  casas(
    zone.floor.filter((f) => f.ground === 'gate' || f.plaza),
    `${pasta}${C.chao.azulejo}`,
  );
  // tile de raiz (chão lento): a pedra clara com tom verde; a grama fica só na borda da ilha
  casas(zone.slow, `${pasta}${C.chao.pedra}`, 0x9fbf7a);

  // ---------------- Flanco da ilha: rocha que desce da borda de grama até as nuvens ----------------
  const FL = C.chao.flanco;
  const rochaMat = new THREE.MeshLambertMaterial({ map: textura(`${pasta}${C.chao.rocha}`), side: THREE.DoubleSide });
  // [comprimento, x, z, giro em Y]: norte, sul, oeste e leste (a face de fora de cada um)
  const lados: [number, number, number, number][] = [
    [W + 2 * B, 0, -(H / 2 + B), Math.PI],
    [W + 2 * B, 0, H / 2 + B, 0],
    [H + 2 * B, -(W / 2 + B), 0, -Math.PI / 2],
    [H + 2 * B, W / 2 + B, 0, Math.PI / 2],
  ];
  for (const [len, x, z, giro] of lados) {
    const m = new THREE.Mesh(escalaUv(new THREE.PlaneGeometry(len, FL), len / por, FL / por), rochaMat);
    m.position.set(x, -0.03 - FL / 2, z);
    m.rotation.y = giro;
    m.receiveShadow = true;
    group.add(m);
  }

  // ---------------- Mar de nuvens: duas camadas à deriva (a textura do dono repete; o deslocamento sai do tempo) ----------------
  const camadas: { tex: THREE.Texture; vel: number; por: number }[] = [];
  for (const c of C.mar.camadas) {
    const tex = loadTexture(`${pasta}${C.mar.textura}`);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: c.opacidade, depthWrite: false, fog: true });
    const m = new THREE.Mesh(piso(C.mar.extensao, C.mar.extensao, c.tilesPorImagem), mat);
    m.position.y = c.y;
    m.renderOrder = -2;
    m.frustumCulled = false;
    group.add(m);
    camadas.push({ tex, vel: c.velocidade, por: c.tilesPorImagem });
  }

  // ---------------- Billboards: ilhas, pontes, peças da borda, cristais com brilho e nuvens ----------------
  const bills: Bill[] = [];
  /** Uma peça recortada (arte do dono em `pecas/`), com a base em (x, y, z) e a altura em tiles. */
  const billboard = (peca: string, x: number, y: number, z: number, altura: number, opacidade = 1): Bill => {
    const tex = textura(`${pasta}pecas/${peca}.webp`);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: opacidade }));
    s.center.set(0.5, 0);
    s.position.set(x, y, z);
    s.scale.set(altura, altura, 1);
    group.add(s);
    const b: Bill = { s, tex, altura, pronto: false };
    bills.push(b);
    return b;
  };

  // sombra de cada ilha no mar de nuvens (mancha suave, logo abaixo da primeira camada)
  const sombraMat = new THREE.MeshBasicMaterial({
    map: textura(C.mar.sombra.textura),
    color: C.mar.sombra.cor,
    transparent: true,
    opacity: C.mar.sombra.opacidade,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const yMar = C.mar.camadas[0].y + 0.04;

  C.ilhas.lista.filter((p) => permitido(COMP.ilhas.permitido, p.peca)).forEach((p, i) => {
    const b = billboard(p.peca, p.x, p.y, p.z, p.altura);
    const ph = i * 1.7; // fase própria: cada ilha balança no seu tempo
    b.anima = (t) => {
      b.s.position.y = p.y + Math.sin(t * C.ilhas.velocidade + ph) * C.ilhas.balanco;
    };
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), sombraMat);
    sombra.scale.set(p.altura * C.mar.sombra.escala, 1, p.altura * C.mar.sombra.escala * 0.6);
    sombra.position.set(p.x, yMar, p.z);
    sombra.renderOrder = -1;
    group.add(sombra);
  });

  // Pontes: o billboard encara a câmera, então a linha do tabuleiro fica para trás e acima da base da arte. A base vai
  // para a frente e abaixo do tabuleiro (inclinação da câmera), e o tabuleiro cai no nível do chão (y = 0).
  const inclinacao = Math.atan2(VISUAL_CONFIG.camera.height, VISUAL_CONFIG.camera.distance - VISUAL_CONFIG.camera.lookZ);
  for (const p of C.pontes) {
    if (!permitido(COMP.pontes.permitido, p.peca)) continue;
    const v = (1 - p.tabuleiro) * p.altura; // do pé da arte até a linha do tabuleiro, em tiles de imagem
    billboard(p.peca, p.x, -Math.cos(inclinacao) * v, p.z + Math.sin(inclinacao) * v, p.altura);
  }

  // ---------------- Contato: sombra sob cada peça do chão (obstáculos e borda) numa chamada de desenho ----------------
  const contatoMat = new THREE.MeshBasicMaterial({
    map: textura(C.contato.textura),
    color: C.contato.cor,
    transparent: true,
    opacity: C.contato.opacidade,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const contatos: THREE.Matrix4[] = [];
  const sombraDe = (x: number, z: number, w: number, d: number) => {
    contatos.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.02, z), new THREE.Quaternion(), new THREE.Vector3(w, 1, d)));
  };

  // ---------------- Obstáculos da grade: peças das ilhas no lugar das árvores e pedras de gelo ----------------
  // Só visual: a grade, os tiles bloqueados e a simulação não mudam. O tipo de tile escolhe a peça (ATO4_COMPOSICAO.obstaculos).
  const obst = COMP.obstaculos;
  const porPeca = new Map<string, { x: number; z: number; altura: number }[]>();
  const rochas: THREE.Matrix4[][] = [[], []];
  for (const pr of zone.props) {
    const opcoes = (obst.troca[pr.kind] ?? []).filter((peca) => permitido(obst.permitido, peca));
    if (!opcoes.length) continue; // muro da cidade (cityWall) e tipos sem peça: ficam como estão (CityGate)
    const peca = opcoes[Math.floor(sorte(pr.x, pr.y) * opcoes.length)];
    const x = X(pr.x);
    const z = Z(pr.y);
    if (peca === 'rocha') {
      // rocha achatada (bloco de rocha, não bola): a altura é ~0,55 da largura
      const s = 1 + sorte(pr.x, pr.y, 1) * 0.2;
      rochas[sorte(pr.x, pr.y, 2) < 0.5 ? 0 : 1].push(kitMatrix(x, z, s, sorte(pr.x, pr.y, 3) * Math.PI * 2, s * 0.55));
      sombraDe(x, z, 1.3 * s, 1.2 * s);
    } else {
      const altura = obst.altura[peca] ?? 2;
      const lista = porPeca.get(peca) ?? [];
      lista.push({ x, z, altura });
      porPeca.set(peca, lista);
      sombraDe(x, z, Math.max(0.7, altura * 0.4), Math.max(0.5, altura * 0.22));
    }
  }
  for (const [peca, pontos] of porPeca) group.add(billboardsInstanciados(textura(`${pasta}pecas/${peca}.webp`), pontos));
  // rocha escura da ilha (naturKit, textura rocha_ilha do dono): duas variações, uma chamada de desenho cada
  instanceKit(group, 'ilha_rocha_a', rochas[0]);
  instanceKit(group, 'ilha_rocha_b', rochas[1]);

  // ---------------- Peças da borda: só as da lista (ATO4_COMPOSICAO.borda), fora da grade ----------------
  C.borda
    .filter((p) => permitido(COMP.borda.permitido, p.peca))
    .forEach((p) => {
      billboard(p.peca, p.x, p.y, p.z, p.altura);
      if (p.brilho) {
        const brilhoMat = new THREE.SpriteMaterial({
          map: textura(`${pasta}${C.brilho.textura}`),
          color: new THREE.Color(C.brilho.cor[0], C.brilho.cor[1], C.brilho.cor[2]),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const g = new THREE.Sprite(brilhoMat);
        g.position.set(p.x, p.y + p.altura * 0.45, p.z);
        g.scale.setScalar(C.brilho.tamanho);
        group.add(g);
      }
      sombraDe(p.x, p.z, p.altura * 0.6, p.altura * 0.35);
    });
  if (contatos.length) {
    const sombras = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), contatoMat, contatos.length);
    contatos.forEach((mx, i) => sombras.setMatrixAt(i, mx));
    sombras.renderOrder = 1;
    group.add(sombras);
  }

  // nuvens soltas no alto: deriva lenta em X (só as da lista)
  C.nuvens.lista
    .filter((p) => permitido(COMP.nuvens.permitido, p.peca))
    .forEach((p, i) => {
      const b = billboard(p.peca, p.x, p.y, p.z, p.altura, C.nuvens.opacidade);
      const ph = i * 2.3;
      b.anima = (t) => {
        b.s.position.x = p.x + Math.sin(t * C.nuvens.velocidade + ph) * C.nuvens.balanco;
      };
    });

  // ---------------- Atualização: deriva do mar, balanço das ilhas e a escala de cada peça quando a imagem chega ----------------
  let t = 0;
  const update = (dt: number): void => {
    t += dt;
    for (const c of camadas) c.tex.offset.x += (c.vel * dt) / c.por;
    for (const b of bills) {
      if (!b.pronto && b.tex.image) {
        const img = b.tex.image as { width: number; height: number };
        b.s.scale.set((b.altura * img.width) / img.height, b.altura, 1);
        b.pronto = true;
      }
      b.anima?.(t);
    }
  };

  return { group, update };
}
