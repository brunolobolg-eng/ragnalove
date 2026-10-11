import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ParsedZone } from '../../config/zones';
import { loadTexture } from './naturKit';

/**
 * O Emperium (zona com `castle`): o minério do centro do castelo, alvo da horda. Usa o modelo do dono
 * (public/models/roguard_emperium_crystal.glb: cristal, pé e fragmentos, em cor por vértice; o anel de runas do
 * arquivo fica desligado). Fica no mesmo lugar: o conjunto gira devagar, a runa gira no chão e um raio sobe do
 * centro. Só visual: o alvo é o tile 'E' do mapa.
 */

const MODELO = 'models/roguard_emperium_crystal.glb';
/** Tamanho do modelo em relação ao que o dono desenhou (1 = o tamanho original, em tiles). */
const ESCALA = 1.25;
/** Giro no lugar (rad/s) e subida e descida suave (tiles). */
const GIRO = 0.5;
const SUBIDA = 0.06;

let carregando: Promise<THREE.Group> | undefined;

/** O arquivo é lido uma vez; cada zona recebe a sua cópia. */
function carregarModelo(): Promise<THREE.Group> {
  carregando ??= new GLTFLoader().loadAsync(MODELO).then((g) => g.scene as THREE.Group);
  return carregando;
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

/**
 * Cópia do modelo para uma zona. O cristal é iluminado e ganha uma casca de brilho em aditivo. O anel de runas do
 * modelo fica desligado: a runa do chão vem da arte do dono (ver buildEmperium).
 */
function montarCopia(origem: THREE.Group): THREE.Group {
  const copia = origem.clone(true);
  const malhas: THREE.Mesh[] = [];
  copia.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) malhas.push(o as THREE.Mesh);
  });
  const materialCristal = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1d6fd8, emissiveIntensity: 0.7 });
  for (const malha of malhas) {
    if (malha.name.includes('Rune_Ring')) {
      malha.visible = false;
      continue;
    }
    malha.geometry = comNormaisPlanas(malha.geometry);
    malha.material = materialCristal;
    malha.castShadow = true;
    if (malha.name.includes('Main_Crystal')) {
      const casca = new THREE.Mesh(malha.geometry, new THREE.MeshBasicMaterial({ color: 0x66d6ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      casca.scale.setScalar(1.08);
      casca.renderOrder = 21;
      malha.add(casca);
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
  carregarModelo()
    .then((origem) => orientado.add(montarCopia(origem)))
    .catch(() => {
      /* modelo ausente: o cenário segue sem o minério */
    });
  // runa no chão: arte do dono em modo aditivo (o fundo preto some), girando devagar no lugar
  const runaGrupo = new THREE.Group();
  const runa = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: loadTexture('textures/bastiao/emperium_runa.jpg'), color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  runa.rotation.x = -Math.PI / 2;
  runa.position.y = 0.12;
  runa.renderOrder = 20; // por cima das camadas do chão, que são desenhadas em transparência
  runaGrupo.add(runa);
  group.add(runaGrupo);
  // raio de luz: dois planos cruzados com a arte do dono, em modo aditivo (o fundo preto some)
  const raioMat = new THREE.MeshBasicMaterial({ map: loadTexture('textures/bastiao/emperium_raio.jpg'), color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const giro of [0, Math.PI / 2]) {
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(5, 16), raioMat);
    plano.position.y = 8;
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
      runaGrupo.rotation.y += dt * 0.15;
      girador.position.y = Math.sin(t * 1.3) * SUBIDA;
      raioMat.opacity = 0.85 + Math.sin(t * 2) * 0.1;
    },
  };
}
