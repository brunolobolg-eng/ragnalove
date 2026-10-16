/**
 * Save do jogador: jornada em andamento ('run'), conquistas/recordes ('meta') e a cidade do
 * Último Bastião ('bastion', arquivo próprio: a cidade persiste entre tentativas e não compartilha nada com a jornada, exceto as cartas, que vêm do 'meta').
 * Executável: arquivos em userData/saves, gravados pelo Electron de forma atômica e com cópia de
 * segurança (.bak). Na primeira abertura desta versão, o save das versões anteriores (localStorage)
 * é copiado para os arquivos — e continua lá, intocado, como mais uma cópia.
 * Fora do executável (só desenvolvimento): localStorage.
 * Leitura vem de um cache em memória. Duas formas de gravar:
 * - set: espera o disco. É a da jornada e das conquistas, que definem o selo de batalha (a onda recomeça igual).
 * - setLazy: o cache muda na hora e o disco é gravado em segundo plano, uma escrita por vez, sempre com a versão
 *   mais nova. É a do Último Bastião, para construir não travar a tela. Ao fechar a janela, flush() grava o pendente.
 */
import type { DiscoSave } from '../core/progression/banco';

export type SaveKey = 'run' | 'meta' | 'bastion' | 'bastionBackup' | 'runBackup';

/**
 * 'bastionBackup' e 'runBackup': cópias do Bastião ou da jornada que não abriram (ilegíveis ou de versão nova).
 * Só gravadas, nunca lidas de volta pelo jogo: são para o dono recuperar o progresso à mão.
 */
const LEGACY: Record<SaveKey, string> = {
  run: 'vanguarda.run.v1',
  meta: 'vanguarda.meta.v1',
  bastion: 'vanguarda.bastion.v1',
  bastionBackup: 'vanguarda.bastionBackup.v1',
  runBackup: 'vanguarda.runBackup.v1',
};
const KEYS: SaveKey[] = ['run', 'meta', 'bastion', 'bastionBackup', 'runBackup'];
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
  if (!disk) return (cache = { run: legacyGet('run'), meta: legacyGet('meta'), bastion: legacyGet('bastion'), bastionBackup: legacyGet('bastionBackup'), runBackup: legacyGet('runBackup') });
  const files = disk.read();
  cache = { run: files.run, meta: files.meta, bastion: files.bastion ?? null, bastionBackup: null, runBackup: null };
  for (const key of KEYS) {
    if (cache[key] !== null) continue;
    const old = legacyGet(key);
    if (old === null) continue;
    cache[key] = old;
    disk.write(key, old);
  }
  return cache;
}

type OuvinteFalha = (key: SaveKey) => void;
const ouvintesFalha: OuvinteFalha[] = [];
/** Versão mais nova de cada chave ainda não enviada ao disco (gravação em segundo plano). */
const fila = new Map<SaveKey, string>();
/** Chaves com envio em curso: só um por chave, para o disco receber as versões na ordem da edição. */
const enviando = new Set<SaveKey>();

async function enviar(key: SaveKey): Promise<void> {
  const disk = window.vanguardaDesktop?.save;
  const texto = fila.get(key);
  if (!disk || texto === undefined) return;
  fila.delete(key);
  enviando.add(key);
  let ok = false;
  try {
    ok = await disk.writeAsync(key, texto);
  } catch {
    ok = false;
  }
  enviando.delete(key);
  if (!ok) {
    console.warn(`Não foi possível gravar o save "${key}" no disco.`);
    for (const ouvinte of ouvintesFalha) ouvinte(key);
  }
  // se a chave mudou enquanto o envio andava, manda a versão mais nova
  if (fila.has(key)) void enviar(key);
}

/** O disco do jogo para o banco de Zen (core/progression/banco.ts): as chaves do meta, da jornada e do Bastião. */
export const discoDoJogo: DiscoSave = {
  get: (chave) => SaveStore.get(chave),
  set: (chave, texto) => (chave === 'bastion' ? SaveStore.setLazy(chave, texto) : SaveStore.set(chave, texto)),
};

export const SaveStore = {
  get(key: SaveKey): string | null {
    return load()[key];
  },
  /** Grava e espera o disco; devolve false se o disco/storage recusar (o chamador deve avisar o jogador). */
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
  /**
   * Grava em segundo plano: a tela não espera o disco. No navegador é a mesma gravação do `set` (localStorage, rápida).
   * No executável devolve true na hora; se o disco recusar depois, o aviso chega por `onWriteError`.
   */
  setLazy(key: SaveKey, text: string): boolean {
    if (!window.vanguardaDesktop?.save) return SaveStore.set(key, text);
    load()[key] = text;
    fila.set(key, text);
    if (!enviando.has(key)) void enviar(key);
    return true;
  },
  /** Avisa quando uma gravação em segundo plano falha (disco cheio, sem permissão). */
  onWriteError(ouvinte: OuvinteFalha): void {
    ouvintesFalha.push(ouvinte);
  },
  /** Ao fechar a janela: grava de imediato o que ainda estiver na fila (espera o disco, uma vez). */
  flush(): void {
    const disk = window.vanguardaDesktop?.save;
    if (!disk) return;
    for (const [key, texto] of fila) {
      if (!disk.write(key, texto)) console.warn(`Não foi possível gravar o save "${key}" no disco.`);
    }
    fila.clear();
  },
};
