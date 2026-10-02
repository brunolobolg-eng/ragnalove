/**
 * Controle de spawn do Dev Lab: fila de inimigos que entra pelos portais conforme abre
 * espaço — a mesma regra da onda. Cada inimigo é criado por `Simulation.spawnEnemy`
 * (via DevLabApi), nunca por uma cópia da lógica.
 */
import { Rng } from '../../core/sim/rng';
import type { WaveMix } from '../../config/zones';
import { DEV_CONFIG } from '../devConfig';
import type { DevLabApi } from './DevLab';

interface Pending {
  kind: string;
  /** Portal (0/1) ou undefined = sorteado pela simulação. */
  point?: number;
}

export class SpawnController {
  private queue: Pending[] = [];
  private timer = 0;
  private readonly rng = new Rng(Date.now() >>> 0);

  constructor(private readonly api: DevLabApi) {}

  get pending(): number {
    return this.queue.length;
  }

  /** `n` inimigos do tipo `kind` (portal fixo ou sorteado). */
  spawn(kind: string, n: number, point?: number): void {
    for (let i = 0; i < n; i++) this.queue.push({ kind, point });
    this.pump();
  }

  /** Composição de uma onda (tipos sorteados pelo `mix`, na quantidade da fase) + chefe no fim. */
  spawnWave(count: number, mix: WaveMix[], boss?: string): void {
    const total = mix.reduce((s, m) => s + m.weight, 0);
    for (let i = 0; i < count; i++) {
      let r = this.rng.next() * total;
      let kind = mix[mix.length - 1].kind;
      for (const m of mix) {
        r -= m.weight;
        if (r < 0) {
          kind = m.kind;
          break;
        }
      }
      this.queue.push({ kind });
    }
    if (boss) this.queue.push({ kind: boss });
    this.pump();
  }

  clear(): void {
    this.queue = [];
    this.stop();
  }

  private pump(): void {
    this.flush();
    if (this.queue.length && !this.timer) this.timer = window.setInterval(() => this.flush(), DEV_CONFIG.spawnQueueIntervalMs);
  }

  private flush(): void {
    const phase = this.api.base.stats().phase;
    if (phase === 'victory' || phase === 'defeat') return this.clear();
    while (this.queue.length) {
      const p = this.queue[0];
      const ok = p.point === undefined ? this.api.base.spawnKind(p.kind) : this.api.base.spawnAt(p.point, p.kind);
      if (!ok) break; // portais lotados: tenta de novo no próximo pulso
      this.queue.shift();
    }
    if (!this.queue.length) this.stop();
  }

  private stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }
}
