/** PRNG determinístico (mulberry32) — mesma seed, mesma batalha. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Estado interno (uint32). Guardado no save para a sequência continuar depois de uma recarga. */
  get estado(): number {
    return this.s;
  }
  set estado(valor: number) {
    this.s = valor >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
