// Flags de ambiente injetadas pelo Vite (DEV = true em `npm run dev`, false no build de produção).
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Ponte da versão desktop (Electron). Ausente no navegador. */
interface Window {
  vanguardaDesktop?: { isDesktop: true; setVsync(on: boolean): Promise<boolean> };
}
