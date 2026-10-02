/**
 * Save do jogador: jornada em andamento ('run') e conquistas/recordes ('meta').
 * Executável: arquivos em userData/saves, gravados pelo Electron de forma atômica e com cópia de
 * segurança (.bak). Na primeira abertura desta versão, o save das versões anteriores (localStorage)
 * é copiado para os arquivos — e continua lá, intocado, como mais uma cópia.
 * Fora do executável (só desenvolvimento): localStorage.
 * Leitura vem de um cache em memória; cada gravação vai direto para o disco.
 */
export type SaveKey = 'run' | 'meta';

const LEGACY: Record<SaveKey, string> = { run: 'vanguarda.run.v1', meta: 'vanguarda.meta.v1' };
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
  if (!disk) return (cache = { run: legacyGet('run'), meta: legacyGet('meta') });
  const files = disk.read();
  cache = { run: files.run, meta: files.meta };
  for (const key of ['run', 'meta'] as SaveKey[]) {
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
  set(key: SaveKey, text: string): void {
    load()[key] = text;
    const disk = window.vanguardaDesktop?.save;
    if (disk) {
      if (!disk.write(key, text)) console.warn(`Não foi possível gravar o save "${key}" no disco.`);
      return;
    }
    try {
      localStorage.setItem(LEGACY[key], text);
    } catch {
      /* sem storage: joga sem salvar */
    }
  },
};
