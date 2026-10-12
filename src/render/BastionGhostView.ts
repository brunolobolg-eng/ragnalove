import * as THREE from 'three';
import { STRUCTURES, type StructureKind } from '../config/bastion';
import { VISUAL_CONFIG } from '../config/visualConfig';
import type { Vec2 } from '../core/grid/types';
import { tileToWorld } from './coords';
import { fortMesh } from './ObjectView';

/** O que a prévia mostra: a construção, o tile e se dá para construir (ou mover) ali. Quem decide é o núcleo. */
export interface GhostPreview {
  kind: StructureKind;
  at: Vec2;
  valid: boolean;
}

const OBJECT_OF: Record<StructureKind, 'bastionWall' | 'bastionTower'> = { wall: 'bastionWall', tower: 'bastionTower' };
const KINDS: StructureKind[] = ['wall', 'tower'];

/** Tem alguma malha de verdade? (Enquanto o kit de muralhas carrega, as peças vêm vazias.) */
function temMalha(g: THREE.Object3D): boolean {
  let achou = false;
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) achou = true;
  });
  return achou;
}

/**
 * Prévia da construção do Último Bastião: um só objeto, movido e recolorido a cada mudança do mouse. Mostra a
 * peça real em translúcido (verde = dá, vermelho = não), com contorno vetorial brilhante, o tile e, na torre,
 * o anel do alcance. Só desenha: nunca altera a simulação. Modelos em cache; mudar de tile só troca a posição.
 */
export class BastionGhostView {
  readonly group = new THREE.Group();
  private readonly models = new Map<StructureKind, THREE.Group>();
  private readonly range = new THREE.Group();
  private key = '';
  /** Geometrias e materiais criados aqui (o modelo das peças é cache do kit e não é descartado). */
  private readonly disposables: { dispose(): void }[] = [];

  private readonly fillMat: THREE.MeshBasicMaterial;
  private readonly edgeMat: THREE.LineBasicMaterial;
  private readonly tileMat: THREE.MeshBasicMaterial;
  private readonly tileEdgeMat: THREE.LineBasicMaterial;
  private readonly rangeFillMat: THREE.MeshBasicMaterial;
  private readonly rangeEdgeMat: THREE.LineBasicMaterial;
  private readonly tile: THREE.Mesh;
  private readonly tileEdge: THREE.LineLoop;
  private readonly rangeDisc: THREE.Mesh;
  private readonly rangeRing: THREE.LineLoop;

  constructor(scene: THREE.Scene) {
    const C = VISUAL_CONFIG.bastionGhost;
    const mat = <T extends THREE.Material>(m: T): T => {
      this.disposables.push(m);
      return m;
    };
    this.fillMat = mat(new THREE.MeshBasicMaterial({ transparent: true, opacity: C.fillOpacity, depthWrite: false }));
    this.edgeMat = mat(new THREE.LineBasicMaterial({ transparent: true, opacity: C.edgeOpacity, depthWrite: false }));
    this.tileMat = mat(new THREE.MeshBasicMaterial({ transparent: true, opacity: C.tileFill, depthWrite: false }));
    this.tileEdgeMat = mat(new THREE.LineBasicMaterial({ transparent: true, opacity: C.tileEdgeOpacity, depthWrite: false }));
    this.rangeFillMat = mat(new THREE.MeshBasicMaterial({ transparent: true, opacity: C.rangeFill, depthWrite: false }));
    this.rangeEdgeMat = mat(new THREE.LineBasicMaterial({ transparent: true, opacity: C.rangeEdgeOpacity, depthWrite: false }));

    // contorno do tile (quadrado de 1 tile, um pouco para dentro para não encostar no vizinho)
    const h = C.tileSize / 2;
    const tileGeo = this.geo(new THREE.PlaneGeometry(2 * h, 2 * h).rotateX(-Math.PI / 2).translate(0, C.lift, 0));
    this.tile = new THREE.Mesh(tileGeo, this.tileMat);
    const tileEdgeGeo = this.geo(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-h, C.lift, -h),
        new THREE.Vector3(h, C.lift, -h),
        new THREE.Vector3(h, C.lift, h),
        new THREE.Vector3(-h, C.lift, h),
      ]),
    );
    this.tileEdge = new THREE.LineLoop(tileEdgeGeo, this.tileEdgeMat);

    // alcance da torre: disco translúcido e anel, do raio da própria torre (config, nunca fixo aqui)
    const r = STRUCTURES.tower.shot?.range ?? 0;
    const discGeo = this.geo(new THREE.CircleGeometry(r, C.rangeSegments).rotateX(-Math.PI / 2).translate(0, C.lift, 0));
    this.rangeDisc = new THREE.Mesh(discGeo, this.rangeFillMat);
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i < C.rangeSegments; i++) {
      const a = (i / C.rangeSegments) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * r, C.lift, Math.sin(a) * r));
    }
    this.rangeRing = new THREE.LineLoop(this.geo(new THREE.BufferGeometry().setFromPoints(ringPts)), this.rangeEdgeMat);
    this.range.add(this.rangeDisc, this.rangeRing);

    this.group.add(this.tile, this.tileEdge, this.range);
    this.group.visible = false;
    this.group.renderOrder = 6;
    scene.add(this.group);
  }

  /** Mostra a prévia no tile (ou esconde, com undefined). Só troca posição e cor: nada é criado a cada mouse. */
  show(p: GhostPreview | undefined): void {
    if (!p) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    tileToWorld(p.at.x, p.at.y, this.group.position);
    const key = `${p.kind}|${p.valid ? 1 : 0}`;
    if (key === this.key) return;
    const C = VISUAL_CONFIG.bastionGhost;
    const fill = p.valid ? C.validFill : C.invalidFill;
    const edge = p.valid ? C.validEdge : C.invalidEdge;
    this.fillMat.color.setHex(fill);
    this.tileMat.color.setHex(fill);
    this.rangeFillMat.color.setHex(fill);
    this.edgeMat.color.setHex(edge);
    this.tileEdgeMat.color.setHex(edge);
    this.rangeEdgeMat.color.setHex(edge);
    for (const k of KINDS) this.model(k).visible = k === p.kind;
    this.range.visible = p.kind === 'tower';
    // com o kit ainda carregando, o modelo não existe: a chave só vale quando ele está montado
    this.key = this.models.has(p.kind) ? key : '';
  }

  /** Remove a prévia da cena e descarta o que ela criou. */
  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.models.clear();
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  /**
   * Modelo translúcido da construção: a mesma peça do campo (fortMesh), com o material da prévia e um contorno
   * vetorial (arestas) por malha. Só as malhas visíveis entram (a barricada quebrada fica escondida).
   */
  private model(kind: StructureKind): THREE.Group {
    const cached = this.models.get(kind);
    if (cached) return cached;
    const m = fortMesh(OBJECT_OF[kind]);
    // o kit ainda carregando devolve peças vazias: não guarda nem mostra, tenta de novo na próxima prévia
    if (!temMalha(m)) return m;
    m.traverseVisible((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      if (!(o instanceof THREE.Mesh)) return;
      o.material = this.fillMat;
      const arestas = this.geo(new THREE.EdgesGeometry(o.geometry, VISUAL_CONFIG.bastionGhost.edgeAngle));
      o.add(new THREE.LineSegments(arestas, this.edgeMat));
    });
    this.group.add(m);
    this.models.set(kind, m);
    return m;
  }
}
