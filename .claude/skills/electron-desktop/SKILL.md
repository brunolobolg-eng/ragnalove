---
name: electron-desktop
description: Versão desktop do ROguard em Electron — main.cjs, preload.cjs com contextBridge, IPC (save, balance, devlab, vsync), segurança (sandbox, contextIsolation), protocolo app://, splash, ícone, build para Steam e os .bat do dono. Use ao mexer em electron/, empacotamento, arquivos no disco ou janela.
---

# Electron

## Estrutura
```
Renderer (jogo, src/)  →  window.vanguardaDesktop (preload.cjs, contextBridge)  →  ipcMain (main.cjs)  →  disco
```
- Janela com `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. **Nunca** `require('fs')` no renderer
  nem expor `ipcRenderer` cru: cada capacidade nova = função específica no preload + handler validado no main.
- API atual: `setVsync`, `balance.load/save/exportFile/importFile` (Game Editor), `save.read/write` (síncrono),
  `devlab.loadScenarios/saveScenarios`.
- Conteúdo servido de `dist/` (ou `web/`) pelo protocolo interno `app://` — sem servidor, sem porta aberta.
- Splash (`splash.html` + `splash_logo.png`), F11 tela cheia, V-Sync salvo em `desktop.json`.
- Ícone: `electron/icon.ico` (package.json `build.win.icon`).

## Build
- `npm run desktop:dev` (Vite + Electron), `desktop:start`, `desktop:build` (pasta em `release/win-unpacked`).
- O dono usa `ATUALIZAR_JOGO.bat`: compila e copia `dist/` + `electron/` para `Executavel\Vanguarda\resources\app`
  e aplica o ícone com rcedit (baixado sozinho em `tools/`, ignorado no git).
- `BAIXAR_DO_GITHUB.bat` / `ENVIAR_PARA_GITHUB.bat` sincronizam a pasta (ver CLAUDE.md). `.bat` sempre CRLF (`.gitattributes`).
- O build de produção não pode conter ferramentas de dev (`import.meta.env.DEV`): confira com grep em `dist/`.
