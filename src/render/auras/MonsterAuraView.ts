import * as THREE from 'three';
import type { Unit } from '../../core/sim/types';
import { AURA, AURA_KINDS, AURA_VISUAL, type AuraKind } from '../../config/auras';
import { AURA_MONSTRO_VISUAL, type AuraMonstroTipo } from '../../config/visualConfig';
import { PACK_ELEMENTS } from '../../config/fx/efeitosPack';
import { energyRingTexture } from '../fx/kit/procedural';
import type { PackFx } from '../fx/pack/PackFx';
import { SHADER_AURA } from '../fx/pack/packShaders';
import type { AnyUnitView } from '../units/createUnitView';

const V = AURA_MONSTRO_VISUAL;

/** Cor "#RRGGBB" em valores de cena (sem conversão de cor, como o pacote de VFX). `mult` realça o brilho. */
function rgbDeHex(hex: string, mult = 1): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255 * mult, ((n >> 8) & 255) / 255 * mult, (n & 255) / 255 * mult];
}

/** Materiais e geometrias compartilhados por toda a horda: um material por tipo de aura, criado uma vez. */
interface Kit {
  anel: THREE.PlaneGeometry;
  faixa: THREE.CylinderGeometry;
  aneis: Record<AuraKind, THREE.MeshBasicMaterial>;
  faixas: Record<AuraKind, THREE.ShaderMaterial>;
  /** Cores das brasas da queimação (núcleo e borda). */
  brasa: { core: [number, number, number]; edge: [number, number, number] };
}

let kit: Kit | undefined;

function getKit(): Kit {
  if (kit) return kit;
  const textura = energyRingTexture();
  const aneis = {} as Record<AuraKind, THREE.MeshBasicMaterial>;
  const faixas = {} as Record<AuraKind, THREE.ShaderMaterial>;
  for (const tipo of AURA_KINDS) {
    const cor = AURA_VISUAL[tipo];
    const t: AuraMonstroTipo = V.tipos[tipo];
    aneis[tipo] = new THREE.MeshBasicMaterial({
      map: textura,
      color: new THREE.Color(cor.cor),
      opacity: V.anelAlfa,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    faixas[tipo] = new THREE.ShaderMaterial({
      vertexShader: SHADER_AURA.vertex,
      fragmentShader: SHADER_AURA.fragment,
      uniforms: {
        uPrimary: { value: new THREE.Vector3(...rgbDeHex(cor.corClara)) },
        uSecondary: { value: new THREE.Vector3(...rgbDeHex(cor.cor)) },
        uTertiary: { value: new THREE.Vector3(...rgbDeHex(cor.cor, 0.5)) },
        uEmission: { value: t.emissao },
        uTime: { value: 0 },
        uTwist: { value: t.torcao },
        uScroll: { value: new THREE.Vector2(t.rolagem[0], t.rolagem[1]) },
        uWaviness: { value: t.ondulacao },
        uAlpha: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }
  const brasa = AURA_VISUAL.queimacao;
  kit = {
    anel: new THREE.PlaneGeometry(1, 1),
    faixa: new THREE.CylinderGeometry(V.faixaRaio, V.faixaRaio, V.faixaAltura, 24, 1, true),
    aneis,
    faixas,
    brasa: { core: rgbDeHex(brasa.corClara, V.brasaBrilho), edge: rgbDeHex(brasa.cor, V.brasaBrilho) },
  };
  return kit;
}

/** Um monstro portador. O anel e a faixa são filhos da raiz da unidade: seguem o passo e somem com ela. */
class Portador {
  readonly anel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly faixa: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  id = -1;
  tipo: AuraKind = 'velocidade';
  raiz!: THREE.Object3D;
  /** Casa (lógica) do portador: o alcance da queimação é medido em tiles. */
  tx = 0;
  ty = 0;
  /** Tempo desde que nasceu (s): a faixa cresce até o tamanho cheio. */
  idade = 0;
  /** Brasas acumuladas (fração de uma brasa). */
  acc = 0;
  /** Distância ao quadrado até a câmera (escolhe as faixas que aparecem). */
  dist2 = 0;
  visto = false;

  constructor(k: Kit) {
    this.anel = new THREE.Mesh(k.anel, k.aneis.velocidade);
    this.anel.rotation.x = -Math.PI / 2;
    this.anel.position.y = V.anelAltura;
    this.anel.renderOrder = 4;
    this.faixa = new THREE.Mesh(k.faixa, k.faixas.velocidade);
    this.faixa.renderOrder = 2;
  }

  prender(id: number, tipo: AuraKind, raiz: THREE.Object3D, k: Kit): void {
    this.id = id;
    this.raiz = raiz;
    this.idade = 0;
    this.acc = 0;
    this.visto = true;
    this.setTipo(tipo, k);
    raiz.add(this.anel, this.faixa);
  }

  setTipo(tipo: AuraKind, k: Kit): void {
    this.tipo = tipo;
    this.anel.material = k.aneis[tipo];
    this.faixa.material = k.faixas[tipo];
  }

  soltar(): void {
    this.anel.removeFromParent();
    this.faixa.removeFromParent();
  }
}

/** Monstro e herói no alcance da aura (distância de Chebyshev em tiles, como na regra). */
function emAlcance(p: Portador, h: Unit): boolean {
  return Math.max(Math.abs(h.x - p.tx), Math.abs(h.y - p.ty)) <= AURA.raio;
}

function porDistancia(a: Portador, b: Portador): number {
  return a.dist2 - b.dist2;
}

/**
 * Auras dos monstros portadores (a regra está em config/auras.ts): cada portador ganha um anel no chão e uma
 * faixa na cor do tipo, e a queimação solta brasas nos heróis em alcance. Um material por tipo é compartilhado
 * pela horda, e só as faixas mais perto da câmera aparecem. Nada é criado por quadro: os portadores saem de
 * uma reserva, e o monstro morto (ou que saiu da cena) perde a aura na hora.
 */
export class MonsterAuras {
  private readonly portadores = new Map<number, Portador>();
  /** Portadores vivos neste quadro (a ordem muda ao escolher as faixas da frente). */
  private readonly lista: Portador[] = [];
  private readonly reserva: Portador[] = [];
  /** Heróis vivos neste quadro, e a raiz de cada um (mesma posição no array). */
  private readonly herois: Unit[] = [];
  private readonly raizesHerois: THREE.Object3D[] = [];
  private readonly ponto = new THREE.Vector3();
  private tempo = 0;

  constructor(private readonly pack: PackFx) {}

  /** Compila os materiais das auras antes da primeira batalha: sem isso, o primeiro portador trava um quadro. */
  warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const k = getKit();
    const tmp = new THREE.Scene();
    for (const tipo of AURA_KINDS) tmp.add(new THREE.Mesh(k.anel, k.aneis[tipo]), new THREE.Mesh(k.faixa, k.faixas[tipo]));
    renderer.compile(tmp, camera);
  }

  /**
   * Atualiza as auras. `views` são as unidades vivas na cena (o mesmo mapa do GameView): quem não está nele
   * (morreu, saiu) perde a aura. Chamar depois de mover as unidades, a cada quadro.
   */
  update(dt: number, sim: { units: Map<number, Unit> }, views: Map<number, AnyUnitView>, camera: THREE.Camera): void {
    const k = getKit();
    this.tempo += dt;
    for (const p of this.lista) p.visto = false;
    this.herois.length = 0;
    this.raizesHerois.length = 0;
    for (const [id, v] of views) {
      const u = sim.units.get(id);
      if (!u || !u.alive || v.dying) continue;
      if (u.team === 'party') {
        this.herois.push(u);
        this.raizesHerois.push(v.root);
      } else if (u.aura && AURA_KINDS.includes(u.aura)) {
        this.marcar(id, u.aura, u, v.root, k);
      }
    }
    for (let i = this.lista.length - 1; i >= 0; i--) {
      if (!this.lista[i].visto) this.soltar(this.lista[i]);
    }

    // faixas: só as `faixasMax` mais perto da câmera (o resto fica com o anel). A densidade do preset mexe só nas brasas
    const dens = this.pack.density();
    const maxFaixas = V.faixasMax;
    for (const p of this.lista) {
      p.idade += dt;
      p.raiz.getWorldPosition(this.ponto);
      p.dist2 = this.ponto.distanceToSquared(camera.position);
    }
    if (this.lista.length > maxFaixas) this.lista.sort(porDistancia);
    for (let i = 0; i < this.lista.length; i++) {
      const p = this.lista[i];
      const s = Math.min(1, p.idade / V.faixaEntrada);
      const e = s * s * (3 - 2 * s);
      p.faixa.visible = i < maxFaixas;
      p.faixa.scale.set(1, e, 1);
      p.faixa.position.y = (V.faixaAltura * e) / 2;
      p.anel.rotation.set(-Math.PI / 2, 0, this.tempo * V.anelGiro);
      p.anel.scale.set(V.anelLargura, V.anelLargura, 1);
    }

    // um material por tipo: tempo, brilho e opacidade do anel são globais do tipo (o mesmo pulso em toda a horda)
    for (const tipo of AURA_KINDS) {
      const t = V.tipos[tipo];
      k.faixas[tipo].uniforms.uTime.value = this.tempo;
      k.faixas[tipo].uniforms.uEmission.value = t.emissao * (1 + t.pisca * Math.sin(this.tempo * t.piscaVel));
      k.aneis[tipo].opacity = V.anelAlfa * (1 + V.anelPulso * Math.sin(this.tempo * V.anelPulsoVel));
    }

    for (const p of this.lista) {
      if (p.tipo !== 'queimacao') continue;
      p.acc = Math.min(p.acc + dt * V.brasasPorSeg * dens, 4);
      while (p.acc >= 1) {
        p.acc -= 1;
        this.brasa(p, k);
      }
    }
  }

  /** Tira todas as auras (fim da batalha ou troca de cena): os portadores voltam para a reserva. */
  reset(): void {
    while (this.lista.length) this.soltar(this.lista[this.lista.length - 1]);
  }

  dispose(): void {
    this.reset();
  }

  private marcar(id: number, tipo: AuraKind, u: Unit, raiz: THREE.Object3D, k: Kit): void {
    let p = this.portadores.get(id);
    if (p && p.raiz !== raiz) {
      // a unidade ganhou outra raiz (refeita na montagem): começa de novo
      this.soltar(p);
      p = undefined;
    }
    if (!p) {
      p = this.reserva.pop() ?? new Portador(k);
      p.prender(id, tipo, raiz, k);
      this.portadores.set(id, p);
      this.lista.push(p);
    } else if (p.tipo !== tipo) {
      p.setTipo(tipo, k);
    }
    p.visto = true;
    p.tx = u.x;
    p.ty = u.y;
  }

  private soltar(p: Portador): void {
    p.soltar();
    this.portadores.delete(p.id);
    const i = this.lista.indexOf(p);
    if (i >= 0) {
      const ultimo = this.lista.pop()!;
      if (ultimo !== p) this.lista[i] = ultimo;
    }
    this.reserva.push(p);
  }

  /** Solta uma brasa num herói em alcance do portador (sorteado entre os que estão em alcance). */
  private brasa(p: Portador, k: Kit): void {
    if (this.pack.sparks.room <= 0) return;
    let n = 0;
    for (const h of this.herois) if (emAlcance(p, h)) n++;
    if (!n) return;
    let escolhido = Math.floor(Math.random() * n);
    for (let j = 0; j < this.herois.length; j++) {
      if (!emAlcance(p, this.herois[j])) continue;
      if (escolhido-- > 0) continue;
      const r = this.raizesHerois[j].position;
      const f = PACK_ELEMENTS.fire;
      this.pack.sparks.emit({
        x: r.x + (Math.random() - 0.5) * 0.7,
        y: 0.35 + Math.random() * 0.9,
        z: r.z + (Math.random() - 0.5) * 0.7,
        vx: 0,
        vy: f.rise * (0.6 + 0.8 * Math.random()),
        vz: 0,
        lift: f.lift,
        life: V.brasaVida,
        size: f.sparkSize * (0.8 + 0.4 * Math.random()),
        shape: f.sparkShape,
        core: k.brasa.core,
        edge: k.brasa.edge,
        seed: Math.random(),
      });
      return;
    }
  }
}
