// Processo principal do Electron (versão desktop / Steam).
// - O jogo é servido por um protocolo interno "app://" (seguro e padrão): módulos ES,
//   fetch e texturas funcionam igual ao navegador, sem servidor e sem abrir porta.
// - Pasta do jogo: dist/ (build do Vite) ou web/ (pacote pronto, gerado sem Vite).
// - V-Sync: o Chromium só desliga o V-Sync por linha de comando na inicialização,
//   então a escolha do jogador é salva em userData/desktop.json e aplicada ao abrir.
const { app, BrowserWindow, ipcMain, Menu, protocol, net, dialog } = require('electron');
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

// ---------- Splash de abertura: o emblema aparece sozinho (janela transparente) enquanto o jogo carrega ----------
const SPLASH = { width: 420, height: 470, minMs: 2600, fadeMs: 380 };

function createSplash() {
  const splash = new BrowserWindow({
    width: SPLASH.width,
    height: SPLASH.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    center: true,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

function createWindow() {
  // URL de dev só fora do empacotado: no release ignora a variável (anti-hijack).
  const devUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
  const splash = createSplash();
  const shownAt = Date.now();
  const win = new BrowserWindow({
    show: false,
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
      devTools: !app.isPackaged, // sem porta via env no release
    },
  });
  if (app.isPackaged) Menu.setApplicationMenu(null);
  win.loadURL(devUrl || 'app://game/index.html');
  // o jogo aparece quando estiver pronto e o splash já tiver ficado um tempo mínimo na tela
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.webContents.executeJavaScript("document.body.classList.add('out')").catch(() => {});
      setTimeout(() => {
        if (!splash.isDestroyed()) splash.close();
        win.show();
        win.focus();
      }, SPLASH.fadeMs);
    }, Math.max(0, SPLASH.minMs - (Date.now() - shownAt)));
  };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-fail-load', reveal);
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

// ---------- Game Editor (F10) e Dev Lab (F8): balanceamento ----------
// Pasta do projeto encontrada (desktop:dev, ou o executável dentro dela: Ragnalove\Executavel\Vanguarda):
// grava src/config/balance.ts, que entra no build — as alterações ficam no jogo para sempre.
// Sem projeto (executável distribuído): grava userData/balance.json, aplicado por cima do build.
function findProject() {
  for (const start of [path.join(__dirname, '..'), path.dirname(process.execPath)]) {
    let dir = start;
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src', 'config', 'balance.ts'))) return dir;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}
const PROJECT = findProject();
const PROJECT_BALANCE = PROJECT ? path.join(PROJECT, 'src', 'config', 'balance.ts') : '';
const USER_BALANCE = () => path.join(app.getPath('userData'), 'balance.json');
const projectMode = () => !!PROJECT_BALANCE && fs.existsSync(PROJECT_BALANCE);
const BALANCE_RE = /BALANCE_OVERRIDES[^=]*=\s*(\{[\s\S]*\});\s*$/;

ipcMain.handle('vg:balance-load', () => {
  if (projectMode()) {
    const m = BALANCE_RE.exec(fs.readFileSync(PROJECT_BALANCE, 'utf8'));
    const data = m ? JSON.parse(m[1]) : {};
    // ajustes que o executável gravou antes na pasta do usuário entram junto (e vão para o projeto no próximo salvar)
    let user = null;
    try {
      user = JSON.parse(fs.readFileSync(USER_BALANCE(), 'utf8'));
    } catch {
      /* sem arquivo antigo */
    }
    return { mode: 'project', where: PROJECT_BALANCE, data: user ? { ...data, ...user } : data };
  }
  try {
    return { mode: 'user', where: USER_BALANCE(), data: JSON.parse(fs.readFileSync(USER_BALANCE(), 'utf8')) };
  } catch {
    return { mode: 'user', where: USER_BALANCE(), data: null };
  }
});

ipcMain.handle('vg:balance-save', (_e, data) => {
  const json = JSON.stringify(data ?? {}, null, 2);
  if (projectMode()) {
    const header = fs.readFileSync(PROJECT_BALANCE, 'utf8').split('export const BALANCE_OVERRIDES')[0];
    fs.writeFileSync(PROJECT_BALANCE, `${header}export const BALANCE_OVERRIDES: Record<string, unknown> = ${json};\n`);
    // o arquivo antigo da pasta do usuário já foi incorporado: guarda como cópia e para de aplicar
    if (fs.existsSync(USER_BALANCE())) fs.renameSync(USER_BALANCE(), USER_BALANCE().replace(/\.json$/, '.migrado.json'));
    return PROJECT_BALANCE;
  }
  fs.mkdirSync(path.dirname(USER_BALANCE()), { recursive: true });
  fs.writeFileSync(USER_BALANCE(), json);
  return USER_BALANCE();
});

ipcMain.handle('vg:balance-export', async (e, data) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Exportar balanceamento',
    defaultPath: 'roguard-balance.json',
    filters: [{ name: 'Balanceamento', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(data ?? {}, null, 2));
  return r.filePath;
});

ipcMain.handle('vg:balance-import', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Importar balanceamento',
    properties: ['openFile'],
    filters: [{ name: 'Balanceamento', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

// ---------- Save do jogador (jornada em andamento + conquistas/recordes) ----------
// Arquivos em userData/saves. Gravação atômica: escreve um temporário, força ir para o disco e só
// então troca o arquivo — uma queda de luz no meio nunca deixa o save pela metade. A versão anterior
// fica como cópia de segurança (.bak): se o principal estiver ilegível, o jogo abre pela cópia.
// Síncrono de propósito: arquivos pequenos, e o jogo só segue quando o save está garantido.
const SAVE_KEYS = new Set(['run', 'meta']);
const saveFile = (key, ext = 'json') => path.join(app.getPath('userData'), 'saves', `${key}.${ext}`);

function readSave(key) {
  for (const ext of ['json', 'bak']) {
    try {
      const text = fs.readFileSync(saveFile(key, ext), 'utf8');
      JSON.parse(text);
      return text;
    } catch {
      /* ausente ou corrompido: tenta a cópia */
    }
  }
  return null;
}

ipcMain.on('vg:save-read', (e) => {
  e.returnValue = { run: readSave('run'), meta: readSave('meta') };
});

ipcMain.on('vg:save-write', (e, key, text) => {
  try {
    if (!SAVE_KEYS.has(key) || typeof text !== 'string') throw new Error('save inválido');
    JSON.parse(text);
    const file = saveFile(key);
    const tmp = saveFile(key, 'tmp');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.existsSync(file)) {
      // só promove a cópia se o atual estiver legível: nunca esmaga um .bak bom com lixo
      try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.copyFileSync(file, saveFile(key, 'bak'));
      } catch {
        /* atual ilegível: mantém o .bak que já existe */
      }
    }
    fs.renameSync(tmp, file);
    e.returnValue = true;
  } catch (err) {
    console.error('Falha ao salvar', key, err);
    e.returnValue = false;
  }
});

// ---------- Dev Lab (F8): cenários de teste ----------
// Pasta do projeto (também pelo executável dentro dela): src/dev/devlab-scenarios.json. Sem projeto: userData.
const PROJECT_SCENARIOS = PROJECT ? path.join(PROJECT, 'src', 'dev', 'devlab-scenarios.json') : '';
const USER_SCENARIOS = () => path.join(app.getPath('userData'), 'devlab-scenarios.json');
const scenariosFile = () => (PROJECT_SCENARIOS && fs.existsSync(path.dirname(PROJECT_SCENARIOS)) ? PROJECT_SCENARIOS : USER_SCENARIOS());

ipcMain.handle('vg:devlab-load', () => {
  // cenários salvos antes pelo executável (pasta do usuário) continuam aparecendo até o primeiro salvar no projeto
  for (const file of [scenariosFile(), USER_SCENARIOS()]) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
});

ipcMain.handle('vg:devlab-save', (_e, list) => {
  const file = scenariosFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list ?? [], null, 2));
  return file;
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
