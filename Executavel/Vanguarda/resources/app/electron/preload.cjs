// Ponte mínima e segura entre o jogo (renderer) e o Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vanguardaDesktop', {
  isDesktop: true,
  /** Salva a preferência de V-Sync; devolve true se já vale agora, false se vale ao reabrir. */
  setVsync: (on) => ipcRenderer.invoke('vg:set-vsync', !!on),
});
