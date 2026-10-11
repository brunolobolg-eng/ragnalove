import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ParsedZone } from '../../config/zones';
import { glowTexture, sparkTexture } from '../fx/kit/vfxTextures';
import { loadTexture } from './naturKit';

/**
 * O Emperium (zona com `castle`): o minério do centro do castelo, alvo da horda. Usa o modelo do dono
 * (public/models/roguard_emperium_crystal.glb). O cristal é regularizado (anéis simétricos, para não parecer torto
 * ao girar), ganha um degradê de azul para aqua, brilho translúcido, borda luminosa e núcleo central. A luz (halo,
 * faíscas e raio) fica centrada no eixo. Tudo gira no mesmo lugar. Só visual: o alvo é o tile 'E' do mapa.
 */

const MODELO = 'models/roguard_emperium_crystal.glb';
/** Tamanho do modelo em relação ao que o dono desenhou (1 = o tamanho original, em tiles). */
const ESCALA = 1.25;
/** Giro no lugar (rad/s) e subida e descida suave (tiles). */
const GIRO = 0.5;
const SUBIDA = 0.06;
/** Altura do centro do cristal no modelo (tiles, Z para cima): o núcleo, o halo e as faíscas ficam aqui. */
const CENTRO_Z = 1.9;
/** Degradê do cristal: base azul-safira, topo aqua claro (o brilho sobe pelo cristal). */
const COR_BASE = new THREE.Color(0x12319a);
const COR_TOPO = new THREE.Color(0xb8f7ff);

let carregando: Promise<THREE.Group> | undefined;

/** O arquivo é lido uma vez; cada zona recebe a sua cópia. */
function carregarModelo(): Promise<THREE.Group> {
  carregando ??= new GLTFLoader().loadAsync(MODELO).then((g) => g.scene as THREE.Group);
  return carregando;
}

/**
 * Os anéis do cristal (faixas de 6 vértices) são irregulares no arquivo: o bojo de baixo é cerca de 18% maior que o
 * de cima, e isso faz o cristal parecer torto ao girar. Cada anel vira um hexágono regular, com o mesmo raio médio e a
 * mesma altura. Os pontos sobre o eixo (ponta e centro) ficam exatamente no eixo.
 */
function regularizarAneis(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const xyz = Array.from({ length: pos.count }, (_, i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
  for (const p of xyz) {
    if (Math.hypot(p[0], p[1]) < 0.05) {
      p[0] = 0;
      p[1] = 0;
    }
  }
  const fora = xyz.map((_, i) => i).filter((i) => Math.hypot(xyz[i][0], xyz[i][1]) >= 0.05).sort((a, b) => xyz[a][2] - xyz[b][2]);
  const aneis: number[][] = [];
  for (const i of fora) {
    const ultimo = aneis[aneis.length - 1];
    if (ultimo && Math.abs(xyz[i][2] - xyz[ultimo[ultimo.length - 1]][2]) < 0.1) ultimo.push(i);
    else aneis.push([i]);
  }
  for (const anel of aneis) {
    if (anel.length !== 6) continue; // só mexe nos anéis completos
    const raio = anel.reduce((soma, i) => soma + Math.hypot(xyz[i][0], xyz[i][1]), 0) / 6;
    for (const i of anel) {
      const ang = Math.round((Math.atan2(xyz[i][1], xyz[i][0]) - Math.PI / 6) / (Math.PI / 3)) * (Math.PI / 3) + Math.PI / 6;
      xyz[i][0] = raio * Math.cos(ang);
      xyz[i][1] = raio * Math.sin(ang);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(xyz.flat(), 3));
  return g;
}

/**
 * O modelo vem sem normais (só posição e cor), e um material iluminado falharia. Cada face recebe a normal apontando
 * para fora: o cristal e os fragmentos são sólidos convexos, então o centro do sólido fica dentro. Faces planas.
 */
function comNormaisPlanas(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const centro = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) centro.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  centro.multiplyScalar(1 / pos.count);
  const normais = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const meio = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    meio.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(centro);
    if (n.dot(meio) < 0) n.negate();
    for (let k = 0; k < 3; k++) normais.set([n.x, n.y, n.z], (i + k) * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normais, 3));
  return g;
}

/** Degradê por altura: a base fica azul-safira e o topo, aqua claro, como se o cristal brilhasse por dentro. */
function colorirPorAltura(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const cor = g.getAttribute('color') as THREE.BufferAttribute;
  let zmin = Infinity;
  let zmax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    zmin = Math.min(zmin, pos.getZ(i));
    zmax = Math.max(zmax, pos.getZ(i));
  }
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) - zmin) / (zmax - zmin || 1);
    // cada face recebe um tom um pouco diferente (fixo, sem sorteio): as facetas leem como gema
    const face = Math.floor(i / 3);
    const aleatorio = Math.abs(Math.sin((face + 1) * 12.9898) * 43758.5453) % 1; // em [0, 1), fixo por face
    const tom = 0.9 + 0.2 * aleatorio;
    c.copy(COR_BASE).lerp(COR_TOPO, t * t).multiplyScalar(tom);
    cor.setXYZ(i, c.r, c.g, c.b);
  }
  cor.needsUpdate = true;
  return g;
}

/** Borda luminosa (efeito de Fresnel): a forma em aditivo, brilhando nas faces de contorno. */
function materialBorda(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { cor: { value: new THREE.Color(0x9ff0ff) }, potencia: { value: 2.2 }, intensidade: { value: 1.8 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vVista = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 cor;
      uniform float potencia;
      uniform float intensidade;
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vVista))), potencia);
        gl_FragColor = vec4(cor * f * intensidade, f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Cópia do modelo para uma zona: o cristal é regularizado, colorido e translúcido, com borda e núcleo no eixo. */
function montarCopia(origem: THREE.Group, mats: { nucleo: THREE.Material; borda: THREE.Material }): THREE.Group {
  const copia = origem.clone(true);
  const malhas: THREE.Mesh[] = [];
  copia.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) malhas.push(o as THREE.Mesh);
  });
  const materialSolido = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0xd6fbff, shininess: 70, emissive: 0x0c3a9c, emissiveIntensity: 0.5 });
  const materialCristal = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0xd6fbff, shininess: 90, emissive: 0x0c3a9c, emissiveIntensity: 0.55, transparent: true, opacity: 0.88, depthWrite: false });
  // fragmentos: espaçados igualmente em volta do eixo (o arquivo os deixa de um lado só), com o raio e a altura do modelo
  const fragmentos = malhas.filter((m) => m.name.includes('Floating_Shard')).sort((a, b) => a.name.localeCompare(b.name));
  fragmentos.forEach((malha, i) => {
    const pos = malha.geometry.getAttribute('position') as THREE.BufferAttribute;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < pos.count; k++) {
      cx += pos.getX(k);
      cy += pos.getY(k);
    }
    cx /= pos.count;
    cy /= pos.count;
    malha.rotation.z = (i * Math.PI * 2) / fragmentos.length - Math.atan2(cy, cx);
  });
  for (const malha of malhas) {
    if (malha.name.includes('Rune_Ring')) {
      malha.visible = false;
      continue;
    }
    if (malha.name.includes('Main_Crystal')) {
      malha.geometry = colorirPorAltura(comNormaisPlanas(regularizarAneis(malha.geometry)));
      malha.material = materialCristal;
      malha.renderOrder = 20;
      const borda = new THREE.Mesh(malha.geometry, mats.borda);
      borda.scale.setScalar(1.03);
      borda.renderOrder = 21;
      malha.add(borda);
      const nucleo = new THREE.Mesh(malha.geometry, mats.nucleo);
      nucleo.scale.setScalar(0.42);
      nucleo.position.set(0, 0, CENTRO_Z * 0.58); // encolhido em volta do centro do cristal
      nucleo.renderOrder = 21;
      malha.add(nucleo);
    } else {
      malha.geometry = comNormaisPlanas(malha.geometry);
      malha.material = materialSolido;
      malha.castShadow = true;
    }
  }
  return copia;
}

/**
 * Monta o Emperium no centro dos tiles 'E' da zona. `X` e `Z` convertem tile em mundo (mesmo sistema do cenário).
 * Se o modelo não carregar, o cenário segue sem o minério (o alvo da horda continua no mapa).
 */
export function buildEmperium(zone: ParsedZone, X: (x: number) => number, Z: (y: number) => number): { group: THREE.Group; update: (dt: number) => void } {
  const group = new THREE.Group();
  const alvo = zone.city;
  const cx = alvo.reduce((soma, t) => soma + t.x, 0) / Math.max(1, alvo.length);
  const cy = alvo.reduce((soma, t) => soma + t.y, 0) / Math.max(1, alvo.length);
  group.position.set(X(cx), 0, Z(cy));
  // o conjunto gira e sobe e desce no lugar; o modelo vem com o eixo Z para cima, então é girado para Y
  const girador = new THREE.Group();
  const orientado = new THREE.Group();
  orientado.rotation.x = -Math.PI / 2;
  orientado.scale.setScalar(ESCALA);
  girador.add(orientado);
  group.add(girador);
  const mats = {
    nucleo: new THREE.MeshBasicMaterial({ color: 0xd8f8ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
    borda: materialBorda(),
  };
  carregarModelo()
    .then((origem) => orientado.add(montarCopia(origem, mats)))
    .catch(() => {
      /* modelo ausente: o cenário segue sem o minério */
    });
  // halo: brilho suave centrado no cristal, em aditivo
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x6fe6ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(0, CENTRO_Z * ESCALA, 0);
  halo.scale.setScalar(5);
  halo.renderOrder = 22;
  girador.add(halo);
  // faíscas em volta, que giram com o conjunto e piscam
  const faiscas: { sprite: THREE.Sprite; fase: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), color: 0xbff4ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(Math.cos(ang) * (1.5 + (i % 3) * 0.35), 1.2 + (i % 4) * 0.8, Math.sin(ang) * (1.5 + (i % 3) * 0.35));
    sp.scale.setScalar(0.35 + (i % 2) * 0.15);
    sp.renderOrder = 23;
    girador.add(sp);
    faiscas.push({ sprite: sp, fase: i * 0.8 });
  }
  // runa no chão: arte do dono em modo aditivo (o fundo preto some), girando devagar no lugar
  const runaGrupo = new THREE.Group();
  const runa = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: loadTexture('textures/bastiao/emperium_runa.jpg'), color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  runa.rotation.x = -Math.PI / 2;
  runa.position.y = 0.12;
  runa.renderOrder = 20; // por cima das camadas do chão, que são desenhadas em transparência
  runaGrupo.add(runa);
  group.add(runaGrupo);
  // raio de luz: dois planos cruzados no eixo do cristal, com a arte do dono, em modo aditivo
  // a coluna de luz da arte fica 3,8% à esquerda do centro da imagem: a textura é deslocada para ela cair no eixo
  const raioTex = loadTexture('textures/bastiao/emperium_raio.jpg');
  raioTex.offset.x = -0.038;
  const raioMat = new THREE.MeshBasicMaterial({ map: raioTex, color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const giro of [0, Math.PI / 2]) {
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(5, 16), raioMat);
    plano.position.y = CENTRO_Z * ESCALA + 8; // a base do raio fica no centro do cristal
    plano.rotation.y = giro;
    plano.renderOrder = 21;
    group.add(plano);
  }
  let t = 0;
  return {
    group,
    update(dt: number) {
      t += dt;
      girador.rotation.y += dt * GIRO;
      girador.position.y = Math.sin(t * 1.3) * SUBIDA;
      runaGrupo.rotation.y += dt * 0.15;
      raioMat.opacity = 0.85 + Math.sin(t * 2) * 0.1;
      mats.nucleo.opacity = 0.42 + Math.sin(t * 2.4) * 0.1;
      (halo.material as THREE.SpriteMaterial).opacity = 0.42 + Math.sin(t * 1.6) * 0.08;
      for (const f of faiscas) (f.sprite.material as THREE.SpriteMaterial).opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3 + f.fase));
    },
  };
}
