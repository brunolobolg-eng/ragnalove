import type { Vec2 } from './types';

/**
 * Grade SQM pura: paredes (bloqueio absoluto) + camada de custo de perigo
 * (efeitos de área hostis). Não sabe nada de combate nem de renderização.
 */
export class Board {
  readonly width: number;
  readonly height: number;
  private readonly walls: Uint8Array;
  private readonly hazard: Int32Array;
  /** Objeto que ocupa o tile (id, 0 = nenhum) e se ele bloqueia a visão. */
  private readonly obj: Int32Array;
  private readonly objSight: Uint8Array;
  /** Portão da cidade (zona de ameaça). */
  private readonly city: Uint8Array;
  /** Neblina densa (1) e tiles clareados por tocha (2). */
  private readonly fog: Uint8Array;
  /** Chão lento: multiplicador do tempo de passo e custo extra de caminho. */
  private readonly slow: Float32Array;
  private readonly terrain: Int32Array;
  /** Muda sempre que algo que afeta o caminho muda (paredes, objetos, perigos, terreno). */
  version = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.walls = new Uint8Array(n);
    this.hazard = new Int32Array(n);
    this.obj = new Int32Array(n);
    this.objSight = new Uint8Array(n);
    this.city = new Uint8Array(n);
    this.fog = new Uint8Array(n);
    this.slow = new Float32Array(n).fill(1);
    this.terrain = new Int32Array(n);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  setWall(x: number, y: number, v = true): void {
    if (this.inBounds(x, y)) this.walls[this.idx(x, y)] = v ? 1 : 0;
    this.version++;
  }

  /** Coloca (id > 0) ou tira (0) um objeto do tile. */
  setObject(x: number, y: number, id: number, blocksSight: boolean): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.obj[i] = id;
    this.objSight[i] = id && blocksSight ? 1 : 0;
    this.version++;
  }

  objectAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.obj[this.idx(x, y)] : 0;
  }

  /** Chão sem parede (ignora objetos) — para quem atravessa/quebra obstáculos. */
  isOpenGround(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.walls[this.idx(x, y)] === 0;
  }

  setCity(x: number, y: number): void {
    if (this.inBounds(x, y)) this.city[this.idx(x, y)] = 1;
  }

  isCity(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.city[this.idx(x, y)] === 1;
  }

  cityTiles(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < this.city.length; i++) if (this.city[i]) out.push({ x: i % this.width, y: (i / this.width) | 0 });
    return out;
  }

  setFog(x: number, y: number): void {
    if (this.inBounds(x, y)) this.fog[this.idx(x, y)] = 1;
  }

  /** Clareia a neblina (tocha acesa). */
  lightFog(x: number, y: number): void {
    if (this.inBounds(x, y) && this.fog[this.idx(x, y)] === 1) this.fog[this.idx(x, y)] = 2;
  }

  /** Neblina densa que ainda esconde (não clareada). */
  isFogged(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.fog[this.idx(x, y)] === 1;
  }

  hasFog(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.fog[this.idx(x, y)] !== 0;
  }

  /** Terreno lento: `mult` no tempo do passo e `cost` extra no caminho (mantém o mais forte). */
  setSlow(x: number, y: number, mult: number, cost: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.slow[i] = Math.max(this.slow[i], mult);
    this.terrain[i] = Math.max(this.terrain[i], cost);
    this.version++;
  }

  slowAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.slow[this.idx(x, y)] : 1;
  }

  terrainCost(x: number, y: number): number {
    return this.inBounds(x, y) ? this.terrain[this.idx(x, y)] : 0;
  }

  /** Vazio (água, abismo): não dá para andar, mas dá para enxergar/atirar por cima. */
  setVoid(x: number, y: number): void {
    if (this.inBounds(x, y)) this.walls[this.idx(x, y)] = 2;
  }

  /** Paredes de verdade e objetos de cobertura bloqueiam linha de visão. */
  blocksSight(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    const i = this.idx(x, y);
    return this.walls[i] === 1 || this.objSight[i] === 1;
  }

  isWall(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.walls[this.idx(x, y)] !== 0 || this.obj[this.idx(x, y)] !== 0;
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.walls[i] === 0 && this.obj[i] === 0;
  }

  clearHazards(): void {
    this.hazard.fill(0);
    this.version++;
  }

  addHazard(tiles: readonly Vec2[], cost: number): void {
    for (const t of tiles) if (this.inBounds(t.x, t.y)) this.hazard[this.idx(t.x, t.y)] += cost;
    this.version++;
  }

  hazardAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.hazard[this.idx(x, y)] : 0;
  }

  /** Filtra um padrão para tiles válidos (dentro da grade e sem parede). */
  clip(tiles: readonly Vec2[]): Vec2[] {
    return tiles.filter((t) => this.isWalkable(t.x, t.y));
  }
}
