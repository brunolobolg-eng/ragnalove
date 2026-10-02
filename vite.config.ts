import { defineConfig } from 'vite';

// base relativa: o build abre direto do disco (file://) dentro do Electron.
export default defineConfig({
  base: './',
  // o Game Editor (client) grava o balance.ts com o jogo aberto: não recarregar a página por causa disso
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src/config/balance.ts'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
