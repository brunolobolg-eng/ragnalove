import * as THREE from 'three';
import { ATO3_TEMPESTADE as C } from '../../config/visualConfig';
import { loadTexture } from './naturKit';
import { placeProp } from './props';
import { CENARIO_DIR } from './sceneryTextures';

/**
 * Ato III — Tempestade no Cume das Cinzas (protótipo, só visual; a flag e os números estão em
 * `ATO3_TEMPESTADE`, visualConfig.ts). Acrescenta ao grupo do tabuleiro:
 *   - céu tempestuoso: esfera por dentro com o WebP gerado (além da borda; a câmera o vê com zoom aberto);
 *   - chuva leve: linhas finas em loop, calculadas pelo tempo (sem sorteio por quadro);
 *   - relâmpagos temporizados: clarão frio e fraco no chão, brilho do céu e um traço nas laterais;
 *   - ruínas flutuando fora da grade, com balanço e mancha de contato no chão;
 *   - nevoeiro frio extra, em placas baixas.
 * Não mexe na grade, no Board nem na simulação: só põe objetos a mais na cena.
 */

export interface TempestadeHandle {
  group: THREE.Group;
  update(dt: number): void;
}

/** A tempestade vale só com a flag ligada e para as zonas da lista do config. */
export function tempestadeAtiva(zoneId: string): boolean {
  return C.ativo && C.zonas.includes(zoneId);
}

/** Gerador determinístico (LCG): a mesma semente monta as mesmas gotas, ruínas e raios em toda montagem. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Curva do clarão (0 a 1) a partir do instante `e` do raio: subida rápida, queda, e uma segunda descarga mais fraca
 * 0,22 s depois, com rampa (sem degrau). Fora da janela, zero.
 */
export function curvaClarao(e: number): number {
  if (e < 0 || e > C.relampago.duracao) return 0;
  const a = e < 0.04 ? e / 0.04 : Math.exp(-(e - 0.04) * 9);
  const b = e < 0.22 ? 0 : e < 0.26 ? (e - 0.22) / 0.04 : Math.exp(-(e - 0.26) * 12);
  return Math.min(1, a + 0.6 * b);
}

const SEMENTE = 0x3a7e;

/** Monta a tempestade do tabuleiro de W × H casas (centro no zero do mundo, como o cenário). */
export function buildTempestade(W: number, H: number): TempestadeHandle {
  const r = rng(SEMENTE);
  const sorteia = (a: number, b: number) => a + (b - a) * r();
  const group = new THREE.Group();

  // ---------------- Céu: esfera por dentro, com a textura gerada offline ----------------
  const ceuMat = new THREE.MeshBasicMaterial({ map: loadTexture(`${CENARIO_DIR}${C.ceu.textura}`), side: THREE.BackSide, fog: false, depthWrite: false });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(C.ceu.raio, 48, 24), ceuMat);
  ceu.renderOrder = -10;
  ceu.frustumCulled = false;
  group.add(ceu);

  // ---------------- Clarão do raio no chão: aditivo, cobre o terreno e fica sob as unidades ----------------
  const claraoMat = new THREE.MeshBasicMaterial({ color: C.relampago.cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const clarao = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80).rotateX(-Math.PI / 2), claraoMat);
  clarao.position.y = 0.06;
  clarao.renderOrder = 8;
  clarao.frustumCulled = false;
  group.add(clarao);

  // ---------------- Traço do raio: três cópias finas e deslocadas (linha de 1 px fica fraca) ----------------
  const SEG = 12;
  const COPIAS = 3;
  const raioGeo = new THREE.BufferGeometry();
  const raioPos = new Float32Array(COPIAS * SEG * 2 * 3);
  raioGeo.setAttribute('position', new THREE.BufferAttribute(raioPos, 3));
  const raioMat = new THREE.LineBasicMaterial({ color: C.relampago.cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const raio = new THREE.LineSegments(raioGeo, raioMat);
  raio.frustumCulled = false;
  raio.renderOrder = 9;
  group.add(raio);

  /** Escreve um traço novo em uma das laterais, fora da grade (a câmera o vê na visão aberta). */
  function desenhaRaio(): void {
    const lado = r() < 0.5 ? -1 : 1;
    const bx = lado * (W / 2 + 4 + r() * 4);
    const bz = -6 + r() * 16;
    const fimX = bx + (r() - 0.5) * 1.2;
    const fimZ = bz + (r() - 0.5) * 1.2;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= SEG; i++) {
      const k = i / SEG;
      const ruido = i === 0 || i === SEG ? 0 : 0.5;
      pts.push([bx + (fimX - bx) * k + (r() - 0.5) * ruido, 17 - 17 * k, bz + (fimZ - bz) * k + (r() - 0.5) * ruido]);
    }
    let o = 0;
    for (let c = 0; c < COPIAS; c++) {
      const dx = (c - 1) * 0.05;
      for (let i = 0; i < SEG; i++) {
        for (const p of [pts[i], pts[i + 1]]) {
          raioPos[o++] = p[0] + dx;
          raioPos[o++] = p[1];
          raioPos[o++] = p[2];
        }
      }
    }
    raioGeo.attributes.position.needsUpdate = true;
  }

  // ---------------- Chuva leve: linhas em loop, pela posição do tempo (sem sorteio por quadro) ----------------
  const CH = C.chuva;
  const gotas = CH.gotas;
  const gx0 = new Float32Array(gotas);
  const gz0 = new Float32Array(gotas);
  const gph = new Float32Array(gotas);
  const gvel = new Float32Array(gotas);
  for (let i = 0; i < gotas; i++) {
    gx0[i] = (r() * 2 - 1) * CH.area[0];
    gz0[i] = (r() * 2 - 1) * CH.area[1];
    gph[i] = r() * CH.altura;
    gvel[i] = sorteia(CH.velocidade[0], CH.velocidade[1]);
  }
  const chuvaGeo = new THREE.BufferGeometry();
  const chuvaPos = new Float32Array(gotas * 6);
  chuvaGeo.setAttribute('position', new THREE.BufferAttribute(chuvaPos, 3));
  const chuvaMat = new THREE.LineBasicMaterial({ color: CH.cor, transparent: true, opacity: CH.opacidade, depthWrite: false });
  const chuva = new THREE.LineSegments(chuvaGeo, chuvaMat);
  chuva.frustumCulled = false;
  chuva.renderOrder = 6;
  group.add(chuva);

  function atualizaChuva(t: number): void {
    const len = CH.comprimento;
    for (let i = 0; i < gotas; i++) {
      const caiu = (gph[i] + t * gvel[i]) % CH.altura; // quanto da altura já caiu
      const y = CH.altura - caiu;
      const hx = gx0[i] + CH.inclinacao * caiu;
      const hz = gz0[i] + CH.inclinacao * 0.5 * caiu;
      const o = i * 6;
      // rabo (acima da ponta) e ponta (a gota), na direção do vento
      chuvaPos[o] = hx - CH.inclinacao * len;
      chuvaPos[o + 1] = y + len;
      chuvaPos[o + 2] = hz - CH.inclinacao * 0.5 * len;
      chuvaPos[o + 3] = hx;
      chuvaPos[o + 4] = y;
      chuvaPos[o + 5] = hz;
    }
    chuvaGeo.attributes.position.needsUpdate = true;
  }

  // ---------------- Ruínas flutuando fora da grade, com mancha de contato no chão ----------------
  const RU = C.ruinas;
  const sombraMat = new THREE.MeshBasicMaterial({ map: loadTexture(`${CENARIO_DIR}sombra_contato.webp`), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const ruinas: { g: THREE.Group; y0: number; ph: number }[] = [];
  for (let i = 0; i < RU.quantidade; i++) {
    // uma em cada três é de norte; as outras, das laterais (a visão de jogo quase não mostra o sul)
    const lado = i % 3;
    const d = sorteia(RU.distancia[0], RU.distancia[1]);
    let x: number;
    let z: number;
    if (lado < 2) {
      x = (lado === 0 ? -1 : 1) * (W / 2 + d);
      z = (r() * 2 - 1) * (H / 2 + 6);
    } else {
      z = -(H / 2 + d);
      x = (r() * 2 - 1) * (W / 2 + 6);
    }
    const y = sorteia(RU.altura[0], RU.altura[1]);
    const s = sorteia(RU.escala[0], RU.escala[1]);
    const peca = RU.pecas[Math.floor(r() * RU.pecas.length)];
    const g = placeProp(group, peca, x, z, { y, rot: r() * Math.PI * 2, scale: s, tint: RU.tom });
    ruinas.push({ g, y0: y, ph: r() * Math.PI * 2 });
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), sombraMat);
    sombra.scale.setScalar(RU.sombra * s);
    sombra.position.set(x, 0.035, z);
    sombra.renderOrder = 2;
    group.add(sombra);
  }

  // ---------------- Nevoeiro frio: placas baixas, à deriva ----------------
  const NV = C.nevoa;
  const nevTex = loadTexture(`${CENARIO_DIR}nevoa_suave.webp`);
  const nevoa: { m: THREE.Mesh; x: number; ph: number }[] = [];
  for (let i = 0; i < NV.placas; i++) {
    const nevMat = new THREE.MeshBasicMaterial({ map: nevTex, color: NV.cor, transparent: true, opacity: NV.opacidade + r() * 0.05, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9 + r() * 6, 4 + r() * 2).rotateX(-Math.PI / 2), nevMat);
    const x = (r() * 2 - 1) * (W / 2);
    m.position.set(x, 0.5 + r() * 0.7, (r() * 2 - 1) * (H / 2));
    m.renderOrder = 3;
    group.add(m);
    nevoa.push({ m, x, ph: r() * Math.PI * 2 });
  }

  // ---------------- Relâmpagos: o próximo é sorteado a cada raio (semente fixa, então a sequência é a mesma) ----------------
  let t = 0;
  let proximo = sorteia(C.relampago.intervalo[0], C.relampago.intervalo[1]);
  let disparo = -1e9;

  const update = (dt: number): void => {
    t += dt;
    if (t >= proximo) {
      disparo = t;
      desenhaRaio();
      proximo = t + sorteia(C.relampago.intervalo[0], C.relampago.intervalo[1]);
    }
    const e = t - disparo;
    const k = curvaClarao(e);
    claraoMat.opacity = C.relampago.clarao * k;
    ceuMat.color.setScalar(1 + C.relampago.brilhoCeu * k);
    raioMat.opacity = e < 0 || e >= C.relampago.raio.vida ? 0 : C.relampago.raio.opacidade * Math.exp(-e * 7);

    atualizaChuva(t);
    for (const ru of ruinas) {
      ru.g.position.y = ru.y0 + Math.sin(t * RU.balancoVelocidade + ru.ph) * RU.balancoAltura;
      ru.g.rotation.z = Math.sin(t * RU.balancoVelocidade * 0.6 + ru.ph) * RU.balancoGiro;
    }
    for (const n of nevoa) n.m.position.x = n.x + Math.sin(t * 0.12 + n.ph) * 1.2;
  };

  return { group, update };
}
