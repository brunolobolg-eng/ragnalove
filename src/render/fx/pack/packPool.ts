import * as THREE from 'three';

/** Geometrias compartilhadas por todos os efeitos do pacote (criadas uma vez, nunca por efeito). */
export const CIRCLE_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
export const QUAD_GEO = new THREE.PlaneGeometry(1, 1);

/**
 * Pool de materiais: cada efeito pega um pronto e devolve ao terminar, sem criar material por frame.
 * O teto é o orçamento do pacote: sem material livre, o efeito novo simplesmente não aparece.
 */
export class MaterialPool {
  private readonly free: THREE.ShaderMaterial[] = [];
  private made = 0;
  constructor(
    private readonly make: () => THREE.ShaderMaterial,
    private readonly max: number,
  ) {}
  take(): THREE.ShaderMaterial | undefined {
    const m = this.free.pop();
    if (m) return m;
    if (this.made >= this.max) return undefined;
    this.made++;
    return this.make();
  }
  give(m: THREE.ShaderMaterial): void {
    this.free.push(m);
  }
}

const TEXTURAS = new Map<string, THREE.Texture>();

/** Textura do pacote (WebP em public/fx/efeitos). Os valores são usados como estão, sem conversão de cor. */
export function packTexture(nome: string): THREE.Texture {
  let t = TEXTURAS.get(nome);
  if (!t) {
    t = new THREE.TextureLoader().load(`fx/efeitos/${nome}.webp`);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    TEXTURAS.set(nome, t);
  }
  return t;
}
