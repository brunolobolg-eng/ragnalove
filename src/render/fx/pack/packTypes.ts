import type { OneShotFx } from '../kit/FxKit';
import type { MagicSparks } from './MagicSparks';

/** Efeito do pacote: entra na fila de efeitos "de uma vez" e devolve o material ao terminar. */
export interface PackEffect extends OneShotFx {
  /** Solta o material (volta ao pool) e tira o grupo da cena. Pode ser chamado mais de uma vez. */
  dispose(): void;
}

/** O que cada efeito recebe do sistema: faíscas, densidade do preset e o registro dos efeitos vivos. */
export interface PackHost {
  readonly sparks: MagicSparks;
  /** Multiplicador de densidade do preset de qualidade (o mesmo das partículas do kit). */
  density(): number;
  track(e: PackEffect): void;
  untrack(e: PackEffect): void;
}
