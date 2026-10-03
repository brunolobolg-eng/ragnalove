// Ponte mínima e segura entre o jogo (renderer) e o Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vanguardaDesktop', {
  isDesktop: true,
  /** Salva a preferência de V-Sync; devolve true se já vale agora, false se vale ao reabrir. */
  setVsync: (on) => ipcRenderer.invoke('vg:set-vsync', !!on),
  /** Game Editor (F10): balanceamento salvo pelo client (projeto ou pasta do usuário). */
  balance: {
    load: () => ipcRenderer.invoke('vg:balance-load'),
    save: (data) => ipcRenderer.invoke('vg:balance-save', data),
    exportFile: (data) => ipcRenderer.invoke('vg:balance-export', data),
    importFile: () => ipcRenderer.invoke('vg:balance-import'),
  },
  /** Save do jogador em arquivo (síncrono: o jogo só segue com o save garantido no disco). */
  save: {
    read: () => ipcRenderer.sendSync('vg:save-read'),
    write: (key, text) => ipcRenderer.sendSync('vg:save-write', key, text),
  },
  /** Dev Lab (F8): cenários de teste salvos pelo client. */
  devlab: {
    loadScenarios: () => ipcRenderer.invoke('vg:devlab-load'),
    saveScenarios: (list) => ipcRenderer.invoke('vg:devlab-save', list),
  },
});
