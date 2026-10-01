import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { MAX_HEAT, createVfxPass } from './fx/kit/VfxPostPass';
import { VFX } from './fx/kit/vfxSettings';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VISUAL_CONFIG, VISUAL_THEMES } from '../config/visualConfig';
import { ACTIVE_ZONE, type ZoneTheme } from '../config/zones';
import { GAME_CONFIG } from '../config/gameConfig';

export interface GraphicsOptions {
  pixelRatio: number; // multiplica a resolução nativa (0.5..1)
  bloom: boolean;
  bloomStrength: number; // multiplica o bloom base
  shadows: boolean;
  shadowMapSize: number;
  shakeScale: number; // 0 = sem tremor
  maxLights: number;
}

/** Renderer, câmera 2.5D, luzes, pós-processamento e pool de luzes dinâmicas. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private bloomBase = 0;
  private readonly vfxPass: ShaderPass;
  private kickT = 0;
  private aberr = 0;
  private time = 0;
  private readonly heat: { pos: THREE.Vector3; radius: number; strength: number }[] = [];
  private readonly baseCamPos = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private shake = 0;
  /** Opções gráficas vindas das Configurações (aplicadas na hora, sem reiniciar). */
  private gfx: GraphicsOptions = { pixelRatio: 1, bloom: true, bloomStrength: 1, shadows: true, shadowMapSize: 2048, shakeScale: 1, maxLights: GAME_CONFIG.vfx.maxDynamicLights };
  private readonly moon: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly lightPool: THREE.PointLight[] = [];
  private readonly lightUsed: boolean[] = [];
  onResize?: (projScale: number) => void;
  /** Cinemática: câmera se aproxima de um alvo (chefe) e volta suavemente. */
  private cineTarget?: THREE.Vector3;
  private cineK = 0;
  private readonly cinePos = new THREE.Vector3();
  private readonly cineLook = new THREE.Vector3();
  /** Câmera tática: ponto do chão em foco, zoom, alvo de "seguir" e limites do mapa. */
  private readonly focus = new THREE.Vector3();
  private readonly camOffset = new THREE.Vector3();
  private followTarget?: THREE.Vector3;
  private manualT = 0;
  private zoom = 1;
  private boardHalf = new THREE.Vector2(8, 7);
  private fogBase = { near: 24, far: 44 };
  private readonly sunDir = new THREE.Vector3(-7, 18, 9);

  constructor(container: HTMLElement, boardW: number, boardH: number) {
    const V = themeOf(ACTIVE_ZONE.theme);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // cores de "pintura", sem contraste cinematográfico
    this.renderer.toneMappingExposure = V.exposure;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(V.background);
    // Sem céu: como nos MMOs isométricos clássicos, o mapa termina no vazio escuro.
    this.scene.fog = new THREE.Fog(V.background, V.fog.near, V.fog.far);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = V.envIntensity;

    this.camera = new THREE.PerspectiveCamera(V.camera.fov, 1, 0.1, 160);
    this.camOffset.set(0, V.camera.height, V.camera.distance - V.camera.lookZ);
    this.fogBase = { ...V.fog };
    this.baseCamPos.copy(this.camOffset);
    this.lookAt.set(0, 0, 0);
    this.camera.position.copy(this.baseCamPos);
    this.camera.lookAt(this.lookAt);

    // Luz de dia suave e chapada (sombras leves, pouco contraste)
    this.hemi = new THREE.HemisphereLight(V.light.sky, V.light.ground, V.hemiIntensity);
    this.scene.add(this.hemi);
    const moon = (this.moon = new THREE.DirectionalLight(V.light.sun, V.moonIntensity));
    this.sunDir.set(...((V as { sun?: [number, number, number] }).sun ?? VISUAL_CONFIG.sun));
    moon.position.copy(this.sunDir);
    moon.shadow.radius = 4;
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    this.scene.add(moon.target);
    const sc = moon.shadow.camera;
    // a sombra acompanha o foco da câmera (mapas grandes): área fixa em volta do que está na tela
    const half = Math.min(Math.max(boardW, boardH) * 0.75, VISUAL_CONFIG.cameraControl.shadowHalf);
    this.setBoardSize(boardW, boardH);
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 50;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.02;
    this.scene.add(moon);

    // Pool de luzes pontuais: pré-alocadas para não recompilar shaders quando fogo aparece.
    for (let i = 0; i < GAME_CONFIG.vfx.maxDynamicLights; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 6, 1.6);
      l.position.set(0, -10, 0);
      this.scene.add(l);
      this.lightPool.push(l);
      this.lightUsed.push(false);
    }

    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.vfxPass = createVfxPass();
    this.composer.addPass(this.vfxPass);
    this.bloomBase = V.bloom.strength;
    this.bloom = new UnrealBloomPass(size, V.bloom.strength, V.bloom.radius, V.bloom.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Troca a atmosfera (luz, névoa, câmera, bloom) para o tema da zona. */
  applyTheme(theme: ZoneTheme): void {
    const V = themeOf(theme);
    this.renderer.toneMappingExposure = V.exposure;
    (this.scene.background as THREE.Color).set(V.background);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(V.background);
    this.fogBase = { ...V.fog };
    fog.near = V.fog.near * this.zoom;
    fog.far = V.fog.far * this.zoom;
    this.scene.environmentIntensity = V.envIntensity;
    this.hemi.color.set(V.light.sky);
    this.hemi.groundColor.set(V.light.ground);
    this.hemi.intensity = V.hemiIntensity;
    this.moon.color.set(V.light.sun);
    this.moon.intensity = V.moonIntensity;
    this.camOffset.set(0, V.camera.height, V.camera.distance - V.camera.lookZ);
    this.sunDir.set(...((V as { sun?: [number, number, number] }).sun ?? VISUAL_CONFIG.sun));
    this.bloomBase = V.bloom.strength;
    this.bloom.strength = this.bloomBase * this.gfx.bloomStrength;
    this.bloom.radius = V.bloom.radius;
    this.bloom.threshold = V.bloom.threshold;
  }

  // ---------------- Câmera tática (mapas grandes) ----------------

  /** Limites do mapa em mundo (a câmera não sai dele). */
  setBoardSize(w: number, h: number): void {
    this.boardHalf.set(w / 2, h / 2);
    this.clampFocus();
  }

  /** Centraliza no ponto (imediato = sem suavizar). */
  setFocus(p: THREE.Vector3, immediate = false): void {
    this.followTarget = p.clone().setY(0);
    if (immediate) {
      this.focus.copy(this.followTarget);
      this.clampFocus();
    }
  }

  /** Segue um alvo (a onda chama a cada frame); ignorado enquanto o jogador controla a câmera. */
  follow(p: THREE.Vector3): void {
    if (this.manualT > 0) return;
    this.followTarget = p.clone().setY(0);
  }

  /** Movimento manual da câmera (teclado/arrasto): suspende o "seguir" por alguns segundos. */
  panBy(dx: number, dz: number): void {
    this.focus.x += dx;
    this.focus.z += dz;
    this.clampFocus();
    this.followTarget = undefined;
    this.manualT = VISUAL_CONFIG.cameraControl.manualHold;
  }

  zoomBy(steps: number): void {
    const C = VISUAL_CONFIG.cameraControl;
    this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + C.zoomStep * steps), C.zoomMin, C.zoomMax);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.fogBase.near * this.zoom;
    fog.far = this.fogBase.far * this.zoom;
  }

  /** Volta a seguir a ação imediatamente. */
  resumeFollow(): void {
    this.manualT = 0;
  }

  get following(): boolean {
    return this.manualT <= 0;
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  private clampFocus(): void {
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, -this.boardHalf.x, this.boardHalf.x);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, -this.boardHalf.y, this.boardHalf.y + 2);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // Garante que o tabuleiro inteiro caiba em telas estreitas.
    this.camera.fov = w / h < 1.2 ? VISUAL_CONFIG.camera.fov * 1.35 : VISUAL_CONFIG.camera.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const projScale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.onResize?.(projScale);
  }

  projScale(): number {
    const h = window.innerHeight;
    return (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  /** Empurrão de câmera (lançamento de magia / golpe pesado): aproxima e volta. */
  kick(amount: number): void {
    this.kickT = Math.min(0.6, this.kickT + amount * this.gfx.shakeScale);
  }

  /** Liga (alvo) ou desliga (undefined) o enquadramento cinematográfico. */
  setCinematic(target?: THREE.Vector3, height = 2.2): void {
    if (target) {
      this.cineTarget = target.clone();
      this.cineLook.copy(target).add(new THREE.Vector3(0, height * 0.7, 0));
      this.cinePos.copy(target).add(new THREE.Vector3(1.4, height * 1.75, height * 2.9));
    } else this.cineTarget = undefined;
  }

  get cinematicActive(): boolean {
    return this.cineK > 0.001;
  }

  /** Pulso breve de aberração cromática (impactos fortes). */
  aberrate(amount: number): void {
    if (VFX.aberration) this.aberr = Math.min(0.02, this.aberr + amount);
  }

  /** Fonte de calor deste frame (chamadas a cada frame pelo efeito de fogo). */
  addHeat(pos: THREE.Vector3, radius: number, strength = 1): void {
    if (VFX.heat && this.heat.length < MAX_HEAT) this.heat.push({ pos: pos.clone(), radius, strength });
  }

  addShake(amount: number): void {
    if (this.gfx.shakeScale <= 0) return;
    this.shake = Math.min(0.35 * this.gfx.shakeScale, this.shake + amount * this.gfx.shakeScale);
  }

  /** Aplica preset/ajustes gráficos imediatamente. */
  applyGraphics(o: GraphicsOptions): void {
    const prev = this.gfx;
    this.gfx = o;
    const pr = Math.min(window.devicePixelRatio, 2) * o.pixelRatio;
    if (Math.abs(pr - this.renderer.getPixelRatio()) > 0.01) {
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
      this.resize();
    }
    this.bloom.enabled = o.bloom;
    this.bloom.strength = this.bloomBase * o.bloomStrength;
    // Sombras: o material não precisa recompilar se só o tamanho do mapa mudar.
    if (o.shadows !== prev.shadows) {
      this.moon.castShadow = o.shadows;
      this.scene.traverse((obj) => {
        const m = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
      });
    }
    if (o.shadowMapSize !== this.moon.shadow.mapSize.x) {
      this.moon.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
      this.moon.shadow.map?.dispose();
      this.moon.shadow.map = null;
    }
    // Luzes acima do limite do preset são desligadas (efeitos seguem com o brilho aditivo).
    for (let i = 0; i < this.lightPool.length; i++) this.lightPool[i].visible = i < o.maxLights;
  }

  lightsInUse(): number {
    let n = 0;
    for (let i = 0; i < this.lightPool.length; i++) if (this.lightUsed[i] && this.lightPool[i].visible) n++;
    return n;
  }

  /** Luz pontual do pool (cor/intensidade definidas por quem pega). */
  acquireLight(color?: THREE.ColorRepresentation): THREE.PointLight | undefined {
    const l = this.acquireLightRaw();
    if (l && color !== undefined) l.color.set(color);
    return l;
  }

  private acquireLightRaw(): THREE.PointLight | undefined {
    const i = this.lightUsed.findIndex((u, k) => !u && k < this.gfx.maxLights);
    if (i < 0) return undefined;
    this.lightUsed[i] = true;
    return this.lightPool[i];
  }

  releaseLight(l: THREE.PointLight): void {
    const i = this.lightPool.indexOf(l);
    if (i >= 0) {
      this.lightUsed[i] = false;
      l.intensity = 0;
      l.position.set(0, -10, 0);
    }
  }

  render(dt: number): void {
    this.time += dt;
    // câmera tática: suaviza até o alvo de seguir e posiciona câmera + sombra em volta do foco
    this.manualT = Math.max(0, this.manualT - dt);
    if (this.followTarget) {
      const k = 1 - Math.exp(-dt * VISUAL_CONFIG.cameraControl.follow);
      this.focus.lerp(this.followTarget, k);
      this.clampFocus();
    }
    this.lookAt.copy(this.focus);
    this.baseCamPos.copy(this.focus).addScaledVector(this.camOffset, this.zoom);
    this.moon.target.position.copy(this.focus);
    this.moon.position.copy(this.focus).add(this.sunDir);
    this.moon.target.updateMatrixWorld();
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.kickT = Math.max(0, this.kickT - dt * 2.2);
    this.aberr = Math.max(0, this.aberr - dt * 0.05);
    const s = this.shake * this.shake;
    // empurrão: desliza a câmera em direção ao alvo (curva suave de ida e volta)
    const k = Math.sin(Math.min(1, this.kickT / 0.6) * Math.PI * 0.5) * 0.9;
    const toTarget = new THREE.Vector3().subVectors(this.lookAt, this.baseCamPos).normalize().multiplyScalar(k);
    this.camera.position.set(
      this.baseCamPos.x + toTarget.x + (Math.random() * 2 - 1) * s,
      this.baseCamPos.y + toTarget.y + (Math.random() * 2 - 1) * s,
      this.baseCamPos.z + toTarget.z + (Math.random() * 2 - 1) * s,
    );
    this.camera.lookAt(this.lookAt);
    // cinemática: mistura suave entre a câmera tática e o close no chefe (com leve órbita)
    this.cineK = this.cineTarget ? Math.min(1, this.cineK + dt * 0.9) : Math.max(0, this.cineK - dt * 1.4);
    if (this.cineK > 0) {
      const e = this.cineK * this.cineK * (3 - 2 * this.cineK);
      const orbit = Math.sin(this.time * 0.35) * 0.6;
      const p = this.cinePos.clone().add(new THREE.Vector3(orbit, 0, 0));
      this.camera.position.lerp(p, e);
      const look = this.lookAt.clone().lerp(this.cineLook, e);
      this.camera.lookAt(look);
    }
    this.camera.updateMatrixWorld();
    // fontes de calor → espaço de tela
    const U = this.vfxPass.uniforms;
    U.uTime.value = this.time;
    U.uAspect.value = this.camera.aspect;
    U.uAberr.value = this.aberr;
    const v = new THREE.Vector3();
    let n = 0;
    for (const h of this.heat) {
      v.copy(h.pos).project(this.camera);
      if (Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) continue;
      // raio em tela: projeta um ponto deslocado
      const edge = h.pos.clone().add(new THREE.Vector3(h.radius, 0, 0)).project(this.camera);
      const r = Math.abs(edge.x - v.x) * 0.5;
      U.uHeat.value[n++].set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, Math.max(0.01, r), h.strength);
      if (n >= MAX_HEAT) break;
    }
    U.uHeatN.value = n;
    this.heat.length = 0;
    this.composer.render(dt);
  }
}

function themeOf(theme: ZoneTheme) {
  const t = (VISUAL_THEMES as Record<string, Partial<typeof VISUAL_CONFIG>>)[theme] ?? {};
  return { ...VISUAL_CONFIG, ...t } as typeof VISUAL_CONFIG;
}
