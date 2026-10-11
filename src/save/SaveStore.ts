/**
 * Save do jogador: jornada em andamento ('run'), conquistas/recordes ('meta') e a cidade do
 * Último Bastião ('bastion', arquivo próprio: a cidade persiste entre tentativas e não compartilha nada com a jornada, exceto as cartas, que vêm do 'meta').
 * Executável: arquivos em userData/saves, gravados pelo Electron de forma atômica e com cópia de
 * segurança (.bak). Na primeira abertura desta versão, o save das versões anteriores (localStorage)
 * é copiado para os arquivos — e continua lá, intocado, como mais uma cópia.
 * Fora do executável (só desenvolvimento): localStorage.
 * Leitura vem de um cache em memória; cada gravação vai direto para o disco.
 */
export type SaveKey = 'run' | 'meta' | 'bastion';

const LEGACY: Record<SaveKey, string> = { run: 'vanguarda.run.v1', meta: 'vanguarda.meta.v1', bastion: 'vanguarda.bastion.v1' };
const KEYS: SaveKey[] = ['run', 'meta', 'bastion'];
let cache: Record<SaveKey, string | null> | undefined;

function legacyGet(key: SaveKey): string | null {
  try {
    return localStorage.getItem(LEGACY[key]);
  } catch {
    return null;
  }
}

function load(): Record<SaveKey, string | null> {
  if (cache) return cache;
  const disk = window.vanguardaDesktop?.save;
  if (!disk) return (cache = { run: legacyGet('run'), meta: legacyGet('meta'), bastion: legacyGet('bastion') });
  const files = disk.read();
  cache = { run: files.run, meta: files.meta, bastion: files.bastion ?? null };
  for (const key of KEYS) {
    if (cache[key] !== null) continue;
    const old = legacyGet(key);
    if (old === null) continue;
    cache[key] = old;
    disk.write(key, old);
  }
  return cache;
}

export const SaveStore = {
  get(key: SaveKey): string | null {
    return load()[key];
  },
  /** Grava; devolve false se o disco/storage recusar (o chamador deve avisar o jogador). */
  set(key: SaveKey, text: string): boolean {
    load()[key] = text;
    const disk = window.vanguardaDesktop?.save;
    if (disk) {
      if (!disk.write(key, text)) {
        console.warn(`Não foi possível gravar o save "${key}" no disco.`);
        return false;
      }
      return true;
    }
    try {
      localStorage.setItem(LEGACY[key], text);
      return true;
    } catch {
      /* sem storage: joga sem salvar */
      return false;
    }
  },
};
