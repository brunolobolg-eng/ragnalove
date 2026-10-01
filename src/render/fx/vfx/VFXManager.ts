import * as THREE from 'three';
import { BatchedRenderer, ParticleSystem as QSystem, QuarksLoader, QuarksUtil, type ParticleSystemParameters } from 'three.quarks';
import { GAME_CONFIG } from '../../../config/gameConfig';

/**
 * Gerenciador central de efeitos visuais (three.quarks).
 *
 *   simulação → evento → GameView → VFXManager.play('nome', { position }) → Quarks
 *
 * Só apresentação: nada aqui lê ou altera dano, HP, drops ou IA. Cada efeito é registrado
 * uma vez (em código, ver `library/`, ou JSON exportado do editor do Quarks em
 * `public/vfx/<categoria>/<nome>.json`) e reproduzido por nome. As instâncias ficam num
 * pool: montadas uma vez, pausadas quando acabam e reusadas no próximo `play`.
 */
export type VfxCategory = 'skills' | 'monsters' | 'characters' | 'environment' | 'items' | 'effects';

export interface VfxPlayOptions {
  position: THREE.Vector3;
  /** Direção no plano do chão (o efeito gira para olhar para ela). */
  direction?: THREE.Vector3;
  scale?: number;
  /** Segue um ponto (ex.: herói) enquanto o efeito estiver vivo. */
  follow?: () => THREE.Vector3 | undefined;
  /** Efeitos em loop: para de emitir depois disso (segundos). Sem isso, só para com `stop()`. */
  duration?: number;
}

export interface VfxHandle {
  readonly alive: boolean;
  /** Para de emitir; as partículas já lançadas terminam a vida normalmente. */
  stop(): void;
  setPosition(p: THREE.Vector3): void;
}

/** O que uma definição recebe para montar uma instância. */
export interface VfxBuildKit {
  /** Cria um sistema de partículas já ligado ao renderizador em lote. */
  system(params: ParticleSystemParameters): QSystem;
  /** Material compartilhado (sistemas com o mesmo material são desenhados juntos). */
  material<M extends THREE.Material>(key: string, make: () => M): M;
  /** Contagem ajustada pela densidade do preset de qualidade (mínimo 1). */
  count(n: number): number;
}

export interface VfxDefinition {
  category: VfxCategory;
  /** Monta UMA instância (grupo com os emissores). Chamado só quando o pool precisa crescer. */
  build(k: VfxBuildKit): THREE.Group;
}

interface Instance {
  root: THREE.Group;
  systems: QSystem[];
  busy: boolean;
  gen: number;
  started: number;
  follow?: () => THREE.Vector3 | undefined;
  stopAt?: number;
  stopped: boolean;
  /** Sistemas que já pararam de emitir (evento `emitEnd` do Quarks). */
  ended: Set<QSystem>;
}

interface Pool {
  def?: VfxDefinition;
  /** Efeito carregado de JSON (Quarks editor): instâncias são clones dele. */
  template?: THREE.Object3D;
  items: Instance[];
}

const NULL_HANDLE: VfxHandle = { alive: false, stop: () => {}, setPosition: () => {} };
const UP = new THREE.Vector3(0, 1, 0);

export class VFXManager {
  /** Densidade do preset de qualidade (0.1..1); trocar refaz os pools. */
  static density = 1;
  private static readonly defs = new Map<string, VfxDefinition>();
  private static readonly json = new Map<string, { url: string; category: VfxCategory }>();

  /** Registra um efeito feito em código. */
  static register(name: string, def: VfxDefinition): void {
    VFXManager.defs.set(name, def);
  }

  /** Registra um efeito exportado do editor do Quarks (carregado na primeira vez que o jogo abre). */
  static registerJson(name: string, url: string, category: VfxCategory): void {
    VFXManager.json.set(name, { url, category });
  }

  static names(): string[] {
    return [...VFXManager.defs.keys(), ...VFXManager.json.keys()];
  }

  readonly batch = new BatchedRenderer();
  /** Raiz de todas as instâncias: precisa ficar na cena (o Quarks descarta emissores fora dela). */
  private readonly root = new THREE.Group();
  private readonly pools = new Map<string, Pool>();
  private readonly materials = new Map<string, THREE.Material>();
  private density = VFXManager.density;
  private time = 0;
  private warned = new Set<string>();

  constructor(scene: THREE.Scene) {
    this.root.name = 'vfx';
    scene.add(this.batch, this.root);
    for (const [name, j] of VFXManager.json) this.loadJson(name, j.url);
  }

  private loadJson(name: string, url: string): void {
    new QuarksLoader().load(
      url,
      (obj) => {
        const pool = this.pool(name);
        pool.template = obj;
      },
      undefined,
      () => this.warn(name, `VFX "${name}": não carregou ${url}`),
    );
  }

  private pool(name: string): Pool {
    let p = this.pools.get(name);
    if (!p) {
      p = { def: VFXManager.defs.get(name), items: [] };
      this.pools.set(name, p);
    }
    return p;
  }

  private warn(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  private build(pool: Pool): Instance | undefined {
    const systems: QSystem[] = [];
    let root: THREE.Group;
    if (pool.def) {
      const kit: VfxBuildKit = {
        system: (params) => {
          const s = new QSystem(params);
          this.batch.addSystem(s);
          systems.push(s);
          return s;
        },
        material: (key, make) => {
          let m = this.materials.get(key);
          if (!m) {
            m = make();
            this.materials.set(key, m);
          }
          return m as ReturnType<typeof make>;
        },
        count: (n) => Math.max(1, Math.round(n * this.density)),
      };
      root = pool.def.build(kit);
    } else if (pool.template) {
      root = new THREE.Group();
      const clone = pool.template.clone(true);
      root.add(clone);
      QuarksUtil.addToBatchRenderer(clone, this.batch);
      QuarksUtil.runOnAllParticleEmitters(clone, (e) => systems.push(e.system as QSystem));
    } else return undefined;
    this.root.add(root);
    root.visible = false;
    const inst: Instance = { root, systems, busy: false, gen: 0, started: 0, stopped: false, ended: new Set() };
    for (const s of systems) {
      s.pause();
      s.addEventListener('emitEnd', () => inst.ended.add(s));
    }
    pool.items.push(inst);
    return inst;
  }

  /** Toca um efeito pelo nome. Se o limite daquele efeito já estiver tocando, é ignorado. */
  play(name: string, o: VfxPlayOptions): VfxHandle {
    const pool = this.pool(name);
    if (!pool.def && !pool.template) {
      if (!VFXManager.json.has(name)) this.warn(name, `VFX desconhecido: "${name}"`);
      return NULL_HANDLE;
    }
    const M = GAME_CONFIG.vfx.manager;
    const maxActive = M.maxActive[name] ?? M.defaultMaxActive;
    let busy = 0;
    let free: Instance | undefined;
    for (const it of pool.items) {
      if (it.busy) busy++;
      else free ??= it;
    }
    if (busy >= maxActive) return NULL_HANDLE;
    const inst = free ?? (pool.items.length < M.poolMax ? this.build(pool) : undefined);
    if (!inst) return NULL_HANDLE;

    inst.root.position.copy(o.position);
    if (o.direction && (o.direction.x || o.direction.z)) inst.root.quaternion.setFromAxisAngle(UP, Math.atan2(o.direction.x, o.direction.z));
    else inst.root.quaternion.identity();
    inst.root.scale.setScalar(o.scale ?? 1);
    inst.root.visible = true;
    inst.root.updateMatrixWorld(true);
    inst.ended.clear();
    for (const s of inst.systems) {
      s.restart();
      // o emissor "pulou" de lugar no reuso: não conta como distância percorrida
      s.emissionState.previousWorldPos = undefined;
    }
    inst.busy = true;
    inst.stopped = false;
    inst.gen++;
    inst.started = this.time;
    inst.follow = o.follow;
    inst.stopAt = o.duration !== undefined ? this.time + o.duration : undefined;
    const gen = inst.gen;
    const valid = () => inst.busy && inst.gen === gen;
    return {
      get alive() {
        return valid();
      },
      stop: () => {
        if (valid()) this.endEmit(inst);
      },
      setPosition: (p) => {
        if (valid()) inst.root.position.copy(p);
      },
    };
  }

  private endEmit(inst: Instance): void {
    if (inst.stopped) return;
    inst.stopped = true;
    for (const s of inst.systems) if (!inst.ended.has(s)) s.endEmit();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.density !== VFXManager.density) this.rebuild();
    for (const pool of this.pools.values())
      for (const it of pool.items) {
        if (!it.busy) continue;
        if (it.follow) {
          const p = it.follow();
          if (p) it.root.position.copy(p);
          else this.endEmit(it);
        }
        if (it.stopAt !== undefined && this.time >= it.stopAt) this.endEmit(it);
        let done = it.ended.size >= it.systems.length;
        if (done) for (const s of it.systems) if (s.particleNum > 0) done = false;
        if (done) this.release(it);
      }
    this.batch.update(dt);
  }

  private release(it: Instance): void {
    it.busy = false;
    it.follow = undefined;
    for (const s of it.systems) s.stop();
    it.root.visible = false;
  }

  /** Corta tudo na hora (troca de fase/reinício). */
  clear(): void {
    for (const pool of this.pools.values()) for (const it of pool.items) if (it.busy) this.release(it);
  }

  aliveCount(): number {
    let n = 0;
    for (const pool of this.pools.values()) for (const it of pool.items) if (it.busy) for (const s of it.systems) n += s.particleNum;
    return n;
  }

  /** Densidade mudou nas Configurações: descarta as instâncias (são remontadas sob demanda). */
  private rebuild(): void {
    this.density = VFXManager.density;
    for (const pool of this.pools.values()) {
      for (const it of pool.items) {
        for (const s of it.systems) s.dispose();
        it.root.removeFromParent();
      }
      pool.items = [];
    }
  }
}
