import * as THREE from 'three';
import type { Board } from '../core/grid/Board';
import type { Vec2 } from '../core/grid/types';
import { tileToWorld, worldToTile } from './coords';
import { buildScenery } from './scenery/Scenery';
import { buildBridgeScenery, type SceneryHandle } from './scenery/BridgeScenery';
import { parseZone } from '../config/zones';
import { GAME_CONFIG, ZONE_STATE } from '../config/gameConfig';
import { buildBiomeScenery } from './scenery/BiomeScenery';
import type { ParticleLayer } from './fx/Particles';
import { softCircle, tileOutline } from './textures';

/** Textura do portal de spawn (círculo rúnico). */
let portalTex: THREE.Texture | undefined;
function portalTexture(): THREE.Texture {
  if (portalTex) return portalTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 56, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 44, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 12; i++) {
    g.save();
    g.rotate((i / 12) * Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(-2, -54, 4, 9);
    g.beginPath();
    g.moveTo(-5, -38);
    g.lineTo(0, -30);
    g.lineTo(5, -38);
    g.stroke();
    g.restore();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 40);
  r.addColorStop(0, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(-40, -40, 80, 80);
  portalTex = new THREE.CanvasTexture(c);
  return portalTex;
}

/** Cenário + camada de indicadores de grade + picking de tiles. */
export class BoardView {
  readonly group = new THREE.Group();
  private readonly overlay: THREE.InstancedMesh;
  private readonly overlayColors: Float32Array;
  private readonly board: Board;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly scenery: SceneryHandle;
  /** Luzes reais do cenário (braseiros); desligadas no preset Baixo. */
  static sceneryLights = true;

  setSceneryLights(on: boolean): void {
    BoardView.sceneryLights = on;
    this.scenery.setLights(on);
  }

  /** Libera a GPU ao trocar de zona. */
  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
        (x as THREE.MeshLambertMaterial).map?.dispose();
        x.dispose();
      });
    });
  }

  /** Portais dos 2 spawns e o brilho da zona de ameaça (portão). */
  private readonly portals: { pos: THREE.Vector3; ring: THREE.Mesh; glow: THREE.Sprite }[] = [];
  private readonly threat: THREE.Mesh[] = [];
  private t = 0;
  private pAcc = 0;

  /** Anima o cenário (fogo, água, corvos, fumaça). */
  update(dt: number, particles: ParticleLayer): void {
    this.scenery.update(dt, particles);
    this.t += dt;
    this.pAcc += dt;
    const emit = this.pAcc > 0.12;
    if (emit) this.pAcc = 0;
    for (const p of this.portals) {
      p.ring.rotation.z += dt * 0.6;
      const k = 0.75 + Math.sin(this.t * 3) * 0.2;
      (p.ring.material as THREE.MeshBasicMaterial).opacity = k;
      p.glow.scale.setScalar(2.2 + Math.sin(this.t * 2.4) * 0.3);
      if (emit)
        particles.glow.emit({ pos: p.pos.clone().setY(0.1), posJitter: 0.45, vel: new THREE.Vector3(0, 0.9, 0), velJitter: 0.2, life: 1.0, size: 0.1, sizeEnd: 0.02, color: new THREE.Color(1.6, 0.25, 1.2), colorEnd: new THREE.Color(0.3, 0.02, 0.2), count: 1 });
    }
    for (const m of this.threat) (m.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(this.t * 2) * 0.06;
  }

  constructor(board: Board) {
    this.board = board;
    const W = board.width;
    const H = board.height;
    const n = W * H;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const c = new THREE.Color();

    // Cenário da zona ativa — só visual (a grade vem do mapa da zona).
    const zone = ZONE_STATE.current;
    this.scenery =
      zone.theme === 'bridge'
        ? buildBridgeScenery(parseZone(zone))
        : zone.theme === 'town'
          ? { group: buildScenery(board), update: () => {}, setLights: () => {} }
          : buildBiomeScenery(parseZone(zone), zone.theme);
    this.scenery.setLights(BoardView.sceneryLights);
    this.group.add(this.scenery.group);

    // Portais dos spawns (fixos por mapa): anel rúnico violeta + brilho
    const ringTex = portalTexture();
    for (const sp of GAME_CONFIG.wave.spawnPoints) {
      const pos = tileToWorld(sp.x, sp.y);
      const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshBasicMaterial({ map: ringTex, color: new THREE.Color(1.4, 0.35, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos).setY(0.03);
      ring.renderOrder = 2;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle(), color: new THREE.Color(0.8, 0.12, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      glow.position.copy(pos).setY(0.6);
      glow.renderOrder = 4;
      this.group.add(ring, glow);
      this.portals.push({ pos, ring, glow });
    }
    // Zona de ameaça: brilho dourado nos tiles do portão da cidade
    for (const c of board.cityTiles()) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.15), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.position.copy(tileToWorld(c.x, c.y)).setY(0.021);
      m.renderOrder = 2;
      this.group.add(m);
      this.threat.push(m);
    }
    let i = 0;

    // Overlay de indicadores (aditivo: preto = invisível)
    this.overlay = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: tileOutline(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      n,
    );
    this.overlayColors = new Float32Array(n * 3);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        tileToWorld(x, y, p, 0.012);
        m.makeTranslation(p.x, p.y, p.z);
        this.overlay.setMatrixAt(i, m);
        this.overlay.setColorAt(i, c.setRGB(0, 0, 0));
        i++;
      }
    this.overlay.renderOrder = 1;
    this.group.add(this.overlay);
  }

  /** Zera o overlay (chamar uma vez por frame antes de marcar tiles). */
  clearOverlay(): void {
    this.overlayColors.fill(0);
  }

  mark(tiles: readonly Vec2[], color: THREE.Color, strength = 1): void {
    for (const t of tiles) {
      if (!this.board.inBounds(t.x, t.y)) continue;
      const i = this.board.idx(t.x, t.y) * 3;
      this.overlayColors[i] += color.r * strength;
      this.overlayColors[i + 1] += color.g * strength;
      this.overlayColors[i + 2] += color.b * strength;
    }
  }

  flushOverlay(): void {
    const c = new THREE.Color();
    for (let i = 0; i < this.board.width * this.board.height; i++) {
      c.setRGB(this.overlayColors[i * 3], this.overlayColors[i * 3 + 1], this.overlayColors[i * 3 + 2]);
      this.overlay.setColorAt(i, c);
    }
    this.overlay.instanceColor!.needsUpdate = true;
  }

  /** Ponto do chão (y = 0) sob a coordenada de tela (NDC), mesmo fora do tabuleiro. */
  groundPoint(ndc: THREE.Vector2, camera: THREE.Camera): THREE.Vector3 | undefined {
    this.ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, hit) ? hit : undefined;
  }

  /** Converte coordenada de tela (NDC) em tile, ou undefined fora do tabuleiro. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): Vec2 | undefined {
    this.ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return undefined;
    const t = worldToTile(hit);
    return this.board.inBounds(t.x, t.y) ? t : undefined;
  }
}
