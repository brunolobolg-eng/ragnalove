import { defineConfig } from 'vite';

// base relativa: o build abre direto do disco (file://) dentro do Electron.
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
