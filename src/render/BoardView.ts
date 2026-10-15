import * as THREE from 'three';
import type { Board } from '../core/grid/Board';
import type { Vec2 } from '../core/grid/types';
import { tileToWorld, worldToTile } from './coords';
import { buildScenery } from './scenery/Scenery';
import { definirDetalheAgua } from './scenery/groundLayers';
import { buildBridgeScenery, type SceneryHandle } from './scenery/BridgeScenery';
import { parseZone } from '../config/zones';
import { GAME_CONFIG, ZONE_STATE } from '../config/gameConfig';
import { buildBiomeScenery } from './scenery/BiomeScenery';
import { buildPaintedScenery } from './scenery/PaintedScenery';
import type { ParticleLayer } from './fx/Particles';
import { isSharedTexture, sharedTexture, softCircle, tileOutline } from './textures';
import { PathArrows } from './PathArrows';
import { buildActDressing } from './scenery/ActDressing';
import { buildTempestade, tempestadeAtiva, type TempestadeHandle } from './scenery/tempestade';
import { buildCeuIlhas, ceuIlhasAtivo, type CeuIlhasHandle } from './scenery/ceuIlhas';
import { loadTexture, precarregarImagens } from './scenery/naturKit';
import { CENARIO_DIR, TEXTURAS_CENARIO } from './scenery/sceneryTextures';

/** Textura do portal de spawn (círculo rúnico): imagem gerada em public/textures/cenario/runa_portal.webp. */
let portalTex: THREE.Texture | undefined;
function portalTexture(): THREE.Texture {
  return (portalTex ??= sharedTexture(loadTexture(`${CENARIO_DIR}runa_portal.webp`)));
}

// começa a carregar as imagens do cenário já no arranque: a primeira batalha monta o chão com textura pronta
precarregarImagens(TEXTURAS_CENARIO);

/** Cenário + camada de indicadores de grade + picking de tiles. */
export class BoardView {
  readonly group = new THREE.Group();
  private readonly overlay: THREE.InstancedMesh;
  private readonly overlayColors: Float32Array;
  private readonly board: Board;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly scenery: SceneryHandle;
  /** Ato III: chuva, raios e ruínas flutuantes (só com a flag ATO3_TEMPESTADE ligada para a zona). */
  private readonly tempestade?: TempestadeHandle;
  /** Ato IV: arena como ilha sobre o mar de nuvens, com ilhas e peças em volta (só com a flag ATO4_CEU_ILHAS para a zona). */
  private readonly ceuDeIlhas?: CeuIlhasHandle;
  private readonly arrows?: PathArrows;
  /** Luzes reais do cenário (braseiros); desligadas no preset Baixo. */
  static sceneryLights = true;

  setSceneryLights(on: boolean): void {
    BoardView.sceneryLights = on;
    this.scenery.setLights(on);
    definirDetalheAgua(on); // a ondulação da água segue o mesmo interruptor: médio e alto
  }

  /** Libera a GPU ao trocar de zona (texturas vitalícias compartilhadas não são tocadas). */
  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
        const map = (x as THREE.MeshLambertMaterial).map;
        if (map && !isSharedTexture(map)) map.dispose();
        x.dispose();
      });
    });
  }

  /** Portais dos 2 spawns e o brilho da zona de ameaça (portão). */
  private readonly portals: { pos: THREE.Vector3; ring: THREE.Mesh; glow: THREE.Sprite; open: boolean; t0: number }[] = [];
  /** Cenário de cada portal (índice = spawn); só aparece com o portal aberto. */
  private dressing: THREE.Group[] = [];
  private readonly threat: THREE.Mesh[] = [];
  private t = 0;
  private pAcc = 0;

  /** Anima o cenário (fogo, água, corvos, fumaça). */
  update(dt: number, particles: ParticleLayer): void {
    this.scenery.update(dt, particles);
    this.tempestade?.update(dt);
    this.ceuDeIlhas?.update(dt);
    this.arrows?.update(dt);
    this.t += dt;
    this.pAcc += dt;
    const emit = this.pAcc > 0.12;
    if (emit) this.pAcc = 0;
    for (const p of this.portals) {
      if (!p.open) continue;
      // portal que acabou de abrir cresce em ~1 s (o inicial já nasce no tamanho cheio)
      const g = p.t0 === -Infinity ? 1 : Math.min(1, (this.t - p.t0) / 1.2);
      p.ring.scale.setScalar(0.3 + 0.7 * g);
      p.ring.rotation.z += dt * 0.6;
      const k = 0.75 + Math.sin(this.t * 3) * 0.2;
      (p.ring.material as THREE.MeshBasicMaterial).opacity = k;
      p.glow.scale.setScalar((2.2 + Math.sin(this.t * 2.4) * 0.3) * g);
      if (emit)
        particles.glow.emit({ pos: p.pos.clone().setY(0.1), posJitter: 0.45, vel: new THREE.Vector3(0, 0.9, 0), velJitter: 0.2, life: 1.0, size: 0.1, sizeEnd: 0.02, color: new THREE.Color(1.6, 0.25, 1.2), colorEnd: new THREE.Color(0.3, 0.02, 0.2), count: 1 });
    }
    for (const m of this.threat) (m.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(this.t * 2) * 0.06;
  }

  /** Mostra só os portais abertos (`abertos`: índices de GAME_CONFIG.wave.spawnPoints): ao vincular a batalha. */
  sincronizarPortais(abertos: number[]): void {
    this.portals.forEach((p, i) => {
      const on = abertos.includes(i);
      if (on && !p.open) this.abrirPortal(i);
      else if (!on && p.open) this.fecharPortal(i);
    });
  }

  /** Um portal abriu (evento 'portal'): aparece com um crescimento curto; cenário e setas acompanham. */
  abrirPortal(i: number): void {
    const p = this.portals[i];
    if (!p || p.open) return;
    p.open = true;
    p.t0 = this.t;
    p.ring.visible = p.glow.visible = true;
    if (this.dressing[i]) this.dressing[i].visible = true;
    this.arrows?.setPortal(i, true);
  }

  private fecharPortal(i: number): void {
    const p = this.portals[i];
    p.open = false;
    p.ring.visible = p.glow.visible = false;
    if (this.dressing[i]) this.dressing[i].visible = false;
    this.arrows?.setPortal(i, false);
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
    // Ato IV: a arena vira ilha (chão e decoração externa trocados; os obstáculos da grade continuam). Só zonas de bioma.
    const ilhas = !zone.painted && zone.theme !== 'bridge' && zone.theme !== 'town' && ceuIlhasAtivo(zone.id);
    this.scenery = zone.painted
      ? buildPaintedScenery(zone)
      : zone.theme === 'bridge'
        ? buildBridgeScenery(parseZone(zone))
        : zone.theme === 'town'
          ? { group: buildScenery(board), update: () => {}, setLights: () => {} }
          : buildBiomeScenery(parseZone(zone), zone.theme, { ceuIlhas: ilhas });
    this.scenery.setLights(BoardView.sceneryLights);
    definirDetalheAgua(BoardView.sceneryLights);
    this.group.add(this.scenery.group);
    if (tempestadeAtiva(zone.id)) {
      this.tempestade = buildTempestade(board.width, board.height);
      this.group.add(this.tempestade.group);
    }
    if (ilhas) {
      this.ceuDeIlhas = buildCeuIlhas(parseZone(zone));
      this.group.add(this.ceuDeIlhas.group);
    }
    // Cenário temático dos monstros do ato + setas discretas do caminho da horda.
    // Ato IV (ilhas): sai — o acampamento do ato era peça solta no meio da arena; a composição de ilhas não usa.
    // cenário do portal (mapa pintado já traz o cenário): cada grupo aparece quando o portal abre
    this.dressing = !zone.painted && !ilhas ? buildActDressing(board) : [];
    for (const g of this.dressing) this.group.add(g);
    this.arrows = new PathArrows(board);
    for (const m of this.arrows.meshes) if (m) this.group.add(m);

    // Portais dos spawns (fixos por mapa): anel rúnico violeta + brilho
    const ringTex = portalTexture();
    GAME_CONFIG.wave.spawnPoints.forEach((sp) => {
      const aberto = sp.ativaEm === undefined || sp.ativaEm <= 0;
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
      ring.visible = glow.visible = aberto;
      this.group.add(ring, glow);
      this.portals.push({ pos, ring, glow, open: aberto, t0: aberto ? -Infinity : 0 });
    });
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

  /** Há marcas novas desde o último flush (evita upload de 1755 cores por frame à toa). */
  private overlayTouched = false;

  mark(tiles: readonly Vec2[], color: THREE.Color, strength = 1): void {
    for (const t of tiles) {
      if (!this.board.inBounds(t.x, t.y)) continue;
      this.overlayTouched = true;
      const i = this.board.idx(t.x, t.y) * 3;
      this.overlayColors[i] += color.r * strength;
      this.overlayColors[i + 1] += color.g * strength;
      this.overlayColors[i + 2] += color.b * strength;
    }
  }

  flushOverlay(): void {
    if (!this.overlayTouched) return;
    this.overlayTouched = false;
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
