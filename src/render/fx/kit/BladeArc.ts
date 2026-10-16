import * as THREE from 'three';

/**
 * Lâmina de energia em meia-lua (kit de efeitos). Uma malha pré-alocada segue um rastro de pontos, que o efeito
 * amostra quadro a quadro na ponta real da arma. As amostras são suavizadas (Catmull-Rom); a largura nasce em zero na
 * cauda, chega ao máximo no meio e volta a zero na ponta (pontas afiladas); cada ponto envelhece e some, a cauda
 * primeiro. Três camadas no shader: miolo branco-azulado, corpo azul-ciano e cauda externa azul funda e translúcida.
 *
 * Reaproveitado: os arcos ficam num pool e a geometria é preparada uma vez; nenhum array grande é alocado por golpe.
 * O material é um só, compartilhado (sem textura). Só apresentação: não entra na simulação.
 */

export interface BladeShape {
  /** pontos de amostragem do rastro (máximo) */
  samples: number;
  /** subdivisões suaves entre duas amostras */
  subdiv: number;
  /** expoente do afinamento das pontas: sen(π·u)^k */
  tipExp: number;
  /** raio relativo do miolo (0 a 1 da meia-largura) */
  coreWidth: number;
  /** cores HDR: miolo, camada principal e cauda externa (acima de 1 vira brilho no bloom) */
  coreColor: readonly [number, number, number];
  mainColor: readonly [number, number, number];
  outerColor: readonly [number, number, number];
  /** opacidade relativa da cauda externa (ela fica translúcida) */
  outerAlpha: number;
}

/** Quem é dono de um arco (o efeito). O pool devolve o arco quando o dono termina ou sai da cena. */
export interface BladeOwner {
  readonly done: boolean;
  readonly group: THREE.Group;
}

const UP = new THREE.Vector3(0, 1, 0);
const MIN_STEP2 = 0.0004; // amostras mais próximas que 2 cm reescrevem a última (a ponta segue a arma)
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

const VERT = `
attribute float aAlpha;
attribute float aAlong;
varying float vA;
varying float vU;
varying vec2 vUv;
void main() {
  vA = aAlpha;
  vU = aAlong;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 uCore;
uniform vec3 uMain;
uniform vec3 uOuter;
uniform float uCoreW;
varying float vA;
varying float vU;
varying vec2 vUv;
void main() {
  float d = abs(vUv.y * 2.0 - 1.0);                       // 0 no miolo, 1 na borda
  float core = exp(-(d * d) / (uCoreW * uCoreW));         // miolo branco-azulado, estreito
  float body = 1.0 - smoothstep(0.62, 0.8, d);            // corpo azul-ciano, borda firme
  float rim = smoothstep(0.5, 0.78, d) * (1.0 - smoothstep(0.86, 1.0, d)); // cauda externa, funda e translúcida
  float head = mix(0.55, 1.0, vU);                        // a ponta (atual) é mais clara que a cauda
  vec3 col = (uCore * core + uMain * body + uOuter * rim) * head;
  gl_FragColor = vec4(col * vA, 1.0);                     // mistura aditiva: a opacidade já está na cor
}`;

/** Material compartilhado de um pool de arcos (aditivo, sem profundidade de escrita). */
function createBladeMaterial(s: BladeShape): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: new THREE.Color(s.coreColor[0], s.coreColor[1], s.coreColor[2]) },
      uMain: { value: new THREE.Color(s.mainColor[0], s.mainColor[1], s.mainColor[2]) },
      uOuter: { value: new THREE.Color(s.outerColor[0] * s.outerAlpha, s.outerColor[1] * s.outerAlpha, s.outerColor[2] * s.outerAlpha) },
      uCoreW: { value: s.coreWidth },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Uma coordenada da curva Catmull-Rom entre p1 e p2 (p0 e p3 são vizinhas), no parâmetro s ∈ [0, 1). */
function cr(p0: number, p1: number, p2: number, p3: number, s: number, s2: number, s3: number): number {
  return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
}

/** Ponto da curva Catmull-Rom entre as amostras i1 e i2 (i0 e i3 são vizinhas), escrito em `out` (sem alocar). */
function catmull(a: Float32Array, i0: number, i1: number, i2: number, i3: number, s: number, out: THREE.Vector3): void {
  const s2 = s * s;
  const s3 = s2 * s;
  out.set(
    cr(a[i0 * 3], a[i1 * 3], a[i2 * 3], a[i3 * 3], s, s2, s3),
    cr(a[i0 * 3 + 1], a[i1 * 3 + 1], a[i2 * 3 + 1], a[i3 * 3 + 1], s, s2, s3),
    cr(a[i0 * 3 + 2], a[i1 * 3 + 2], a[i2 * 3 + 2], a[i3 * 3 + 2], s, s2, s3),
  );
}

/**
 * Um arco reaproveitável: pontos (ponta da lâmina, com o instante de cada um) e uma malha de fita. Cada `rebuild`
 * reescreve só os buffers já alocados.
 */
export class BladeArc {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  owner?: BladeOwner;
  private n = 0;
  private readonly maxSamples: number;
  private readonly maxCols: number;
  private readonly subdiv: number;
  private readonly tipExp: number;
  private readonly sp: Float32Array; // amostras: x, y, z
  private readonly st: Float32Array; // instante (s) de cada amostra
  private readonly cp: Float32Array; // colunas suavizadas: x, y, z
  private readonly ct: Float32Array; // instante (s) de cada coluna
  private readonly pos: Float32Array; // dois vértices por coluna (um de cada lado)
  private readonly alpha: Float32Array;
  private readonly along: Float32Array;
  private readonly geo: THREE.BufferGeometry;

  constructor(shape: BladeShape, material: THREE.ShaderMaterial) {
    this.maxSamples = shape.samples;
    this.subdiv = shape.subdiv;
    this.tipExp = shape.tipExp;
    this.maxCols = (shape.samples - 1) * shape.subdiv + 1;
    this.sp = new Float32Array(this.maxSamples * 3);
    this.st = new Float32Array(this.maxSamples);
    this.cp = new Float32Array(this.maxCols * 3);
    this.ct = new Float32Array(this.maxCols);
    const nv = this.maxCols * 2;
    this.pos = new Float32Array(nv * 3);
    this.alpha = new Float32Array(nv);
    this.along = new Float32Array(nv);
    const uv = new Float32Array(nv * 2);
    for (let i = 0; i < nv; i++) uv[i * 2 + 1] = i % 2; // 0 de um lado da fita, 1 do outro (fixo)
    const idx: number[] = [];
    for (let j = 0; j < this.maxCols - 1; j++) {
      const a = j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlong', new THREE.BufferAttribute(this.along, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }

  /** Esvazia o rastro (o arco volta ao pool com a mesma geometria). */
  reset(): void {
    this.n = 0;
    this.mesh.visible = false;
  }

  /** Solta o arco: sai da cena do dono e fica livre no pool. */
  release(): void {
    this.owner = undefined;
    this.mesh.removeFromParent();
    this.reset();
  }

  /** Acrescenta a ponta atual, com o instante `t` (s). Quase parada, só atualiza a última amostra. */
  push(p: THREE.Vector3, t: number): void {
    const sp = this.sp;
    let n = this.n;
    if (n > 0) {
      const k = (n - 1) * 3;
      const dx = p.x - sp[k];
      const dy = p.y - sp[k + 1];
      const dz = p.z - sp[k + 2];
      if (dx * dx + dy * dy + dz * dz < MIN_STEP2) {
        sp[k] = p.x;
        sp[k + 1] = p.y;
        sp[k + 2] = p.z;
        this.st[n - 1] = t;
        return;
      }
    }
    if (n === this.maxSamples) {
      sp.copyWithin(0, 3);
      this.st.copyWithin(0, 1);
      n--;
    }
    const k = n * 3;
    sp[k] = p.x;
    sp[k + 1] = p.y;
    sp[k + 2] = p.z;
    this.st[n] = t;
    this.n = n + 1;
  }

  /**
   * Reescreve a fita. `now`: instante atual (s); `cam`: câmera (a fita fica de frente para ela); `halfWidth`: meia-largura
   * já com a fase (m); `gain`: opacidade da fase (0 a ~1,3); `trailLife`: idade em que um ponto some (s).
   */
  rebuild(now: number, cam: THREE.Vector3, halfWidth: number, gain: number, trailLife: number): void {
    const n = this.n;
    if (n < 2 || gain <= 0 || halfWidth <= 0) {
      this.mesh.visible = false;
      return;
    }
    const sp = this.sp;
    const st = this.st;
    const cp = this.cp;
    const ct = this.ct;
    // 1) colunas suavizadas entre as amostras (a última amostra fecha a fita)
    let m = 0;
    for (let k = 0; k < n - 1; k++) {
      const i0 = Math.max(0, k - 1);
      const i2 = k + 1;
      const i3 = Math.min(n - 1, k + 2);
      for (let j = 0; j < this.subdiv; j++) {
        const s = j / this.subdiv;
        catmull(sp, i0, k, i2, i3, s, _p);
        cp[m * 3] = _p.x;
        cp[m * 3 + 1] = _p.y;
        cp[m * 3 + 2] = _p.z;
        ct[m] = st[k] + (st[i2] - st[k]) * s;
        m++;
      }
    }
    const last = (n - 1) * 3;
    cp[m * 3] = sp[last];
    cp[m * 3 + 1] = sp[last + 1];
    cp[m * 3 + 2] = sp[last + 2];
    ct[m] = st[n - 1];
    m++;
    // 2) lados perpendiculares ao rastro e à câmera; largura em meia-lua; cauda envelhece e some
    const pos = this.pos;
    const alpha = this.alpha;
    const along = this.along;
    for (let j = 0; j < m; j++) {
      const a = Math.max(0, j - 1) * 3;
      const b = Math.min(m - 1, j + 1) * 3;
      const q = j * 3;
      _t.set(cp[b] - cp[a], cp[b + 1] - cp[a + 1], cp[b + 2] - cp[a + 2]);
      _v.set(cam.x - cp[q], cam.y - cp[q + 1], cam.z - cp[q + 2]);
      _s.crossVectors(_t, _v);
      if (_s.lengthSq() < 1e-10) _s.crossVectors(_t, UP);
      if (_s.lengthSq() < 1e-10) _s.set(0, 0, 1);
      _s.normalize();
      const u = m > 1 ? j / (m - 1) : 0;
      const w = halfWidth * Math.pow(Math.sin(Math.PI * u), this.tipExp);
      const age = Math.max(0, now - ct[j]);
      const fade = Math.pow(Math.max(0, 1 - age / trailLife), 1.4) * gain;
      const L = j * 2;
      const R = L + 1;
      pos[L * 3] = cp[q] + _s.x * w;
      pos[L * 3 + 1] = cp[q + 1] + _s.y * w;
      pos[L * 3 + 2] = cp[q + 2] + _s.z * w;
      pos[R * 3] = cp[q] - _s.x * w;
      pos[R * 3 + 1] = cp[q + 1] - _s.y * w;
      pos[R * 3 + 2] = cp[q + 2] - _s.z * w;
      alpha[L] = fade;
      alpha[R] = fade;
      along[L] = u;
      along[R] = u;
    }
    this.geo.setDrawRange(0, (m - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aAlong.needsUpdate = true;
    this.mesh.visible = true;
  }
}

/** Pool de arcos com um material compartilhado: criado uma vez e reaproveitado por todos os golpes. */
export class BladePool {
  private readonly arcs: BladeArc[] = [];

  constructor(count: number, shape: BladeShape) {
    const mat = createBladeMaterial(shape);
    for (let i = 0; i < count; i++) this.arcs.push(new BladeArc(shape, mat));
  }

  /** Arco livre para `owner` (ou undefined se o pool esgotou). Arcos de donos encerrados voltam antes. */
  acquire(owner: BladeOwner): BladeArc | undefined {
    for (const a of this.arcs) if (a.owner && (a.owner.done || !a.owner.group.parent)) a.release();
    const a = this.arcs.find((x) => !x.owner);
    if (!a) return undefined;
    a.owner = owner;
    a.reset();
    owner.group.add(a.mesh);
    return a;
  }

  /** Arcos em uso (para checagens de memória). */
  inUse(): number {
    return this.arcs.filter((a) => a.owner).length;
  }
}
