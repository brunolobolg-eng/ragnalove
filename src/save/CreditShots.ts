/**
 * Fotos da jornada para os créditos finais. Ficam no IndexedDB, à parte do save da run: são grandes e não
 * mudam nenhuma regra, então não entram no RunState (não exigem migração). Uma jornada por vez:
 * escolher o herói de uma nova jornada apaga as fotos anteriores.
 */
import { CREDITS_CONFIG } from '../config/credits';

export interface CreditShot {
  caption: string;
  dataUrl: string;
}

const DB_NAME = 'roguard-creditos';
const STORE = 'fotos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Faz uma operação na loja e resolve com o resultado dela quando a transação termina. */
function inStore<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export async function addCreditShot(shot: CreditShot): Promise<void> {
  const n = await inStore('readonly', (s) => s.count());
  if (n >= CREDITS_CONFIG.maxShots) return;
  await inStore('readwrite', (s) => s.add(shot));
}

export function listCreditShots(): Promise<CreditShot[]> {
  return inStore('readonly', (s) => s.getAll()) as Promise<CreditShot[]>;
}

export async function clearCreditShots(): Promise<void> {
  await inStore('readwrite', (s) => s.clear());
}
