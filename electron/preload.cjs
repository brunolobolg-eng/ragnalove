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
  /**
   * Save do jogador em arquivo. `write` espera o disco (jornada e conquistas: o selo de batalha depende disso);
   * `writeAsync` não espera (Último Bastião, ver SaveStore.setLazy). Ambos gravam do mesmo jeito.
   */
  save: {
    read: () => ipcRenderer.sendSync('vg:save-read'),
    write: (key, text) => ipcRenderer.sendSync('vg:save-write', key, text),
    writeAsync: (key, text) => ipcRenderer.invoke('vg:save-write-async', key, text),
  },
  /** Dev Lab (F8): cenários de teste salvos pelo client. */
  devlab: {
    loadScenarios: () => ipcRenderer.invoke('vg:devlab-load'),
    saveScenarios: (list) => ipcRenderer.invoke('vg:devlab-save', list),
  },
  /** Menus de desenvolvimento (F6/F8/F10): ligados se existir devtools.txt (projeto ou pasta do usuário). */
  devtools: () => ipcRenderer.invoke('vg:devtools'),
});
