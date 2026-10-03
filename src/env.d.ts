// Flags de ambiente injetadas pelo Vite (DEV = true em `npm run dev`, false no build de produção).
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Ponte da versão desktop (Electron). Ausente no navegador. */
interface Window {
  vanguardaDesktop?: {
    isDesktop: true;
    setVsync(on: boolean): Promise<boolean>;
    /** Game Editor: lê/grava o balanceamento pelo client (src/config/balance.ts no projeto, userData/balance.json no executável). */
    balance: {
      load(): Promise<{ mode: 'project' | 'user'; where: string; data: Record<string, unknown> | null }>;
      save(data: Record<string, unknown>): Promise<string>;
      exportFile(data: Record<string, unknown>): Promise<string | null>;
      importFile(): Promise<Record<string, unknown> | null>;
    };
    /** Save do jogador em userData/saves (gravação atômica + cópia .bak). `null` = ainda não existe. */
    save?: {
      read(): { run: string | null; meta: string | null };
      write(key: 'run' | 'meta', text: string): boolean;
    };
    /** Dev Lab: cenários de teste (src/dev/devlab-scenarios.json no projeto, userData no executável). */
    devlab?: {
      loadScenarios(): Promise<unknown[] | null>;
      saveScenarios(list: unknown[]): Promise<string>;
    };
  };
}
