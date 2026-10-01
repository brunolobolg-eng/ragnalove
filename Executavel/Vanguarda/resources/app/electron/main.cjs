// Processo principal do Electron (versão desktop / Steam).
// - O jogo é servido por um protocolo interno "app://" (seguro e padrão): módulos ES,
//   fetch e texturas funcionam igual ao navegador, sem servidor e sem abrir porta.
// - Pasta do jogo: dist/ (build do Vite) ou web/ (pacote pronto, gerado sem Vite).
// - V-Sync: o Chromium só desliga o V-Sync por linha de comando na inicialização,
//   então a escolha do jogador é salva em userData/desktop.json e aplicada ao abrir.
const { app, BrowserWindow, ipcMain, Menu, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const DESKTOP_CFG = () => path.join(app.getPath('userData'), 'desktop.json');

function readCfg() {
  try {
    return JSON.parse(fs.readFileSync(DESKTOP_CFG(), 'utf8'));
  } catch {
    return { vsync: true };
  }
}

const cfg = readCfg();
if (cfg.vsync === false) {
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}

function gameRoot() {
  for (const dir of ['dist', 'web']) {
    const p = path.join(__dirname, '..', dir);
    if (fs.existsSync(path.join(p, 'index.html'))) return p;
  }
  return path.join(__dirname, '..', 'dist');
}

function createWindow() {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#000000',
    title: 'ROguard',
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // música do menu toca ao abrir o jogo
      devTools: !app.isPackaged || process.env.VANGUARDA_DEVTOOLS === '1',
    },
  });
  if (app.isPackaged) Menu.setApplicationMenu(null);
  win.loadURL(devUrl || 'app://game/index.html');
  // F11 alterna tela cheia
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

ipcMain.handle('vg:set-vsync', (_e, on) => {
  const next = { ...readCfg(), vsync: !!on };
  fs.mkdirSync(path.dirname(DESKTOP_CFG()), { recursive: true });
  fs.writeFileSync(DESKTOP_CFG(), JSON.stringify(next, null, 2));
  return next.vsync === (cfg.vsync !== false); // true = já está valendo; false = vale ao reabrir
});

app.whenReady().then(() => {
  const root = gameRoot();
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    // nunca sai da pasta do jogo
    if (!file.startsWith(root)) return new Response('proibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
