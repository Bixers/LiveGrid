const { app, BrowserWindow, Menu, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 8123;
const smokeTest = process.env.LIVEOPS_SMOKE_TEST === '1';
const userDataOverride = process.env.LIVEOPS_USER_DATA_DIR;

if (userDataOverride) {
  const userDataPath = path.resolve(userDataOverride);
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
}

const apiPaths = new Set([
  '/streams.json',
  '/status',
  '/add',
  '/remove',
  '/refresh',
  '/quality',
  '/danmaku',
]);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

let backendProcess = null;
let localServer = null;
let localOrigin = '';
let logPath = '';
let mainWindow = null;

function log(message) {
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    // Logging must never prevent the desktop shell from starting.
  }
}

function isApiRequest(pathname) {
  return apiPaths.has(pathname) || pathname.startsWith('/api/');
}

function proxyRequest(request, response) {
  const upstream = http.request({
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: request.url,
    method: request.method,
    headers: {
      accept: request.headers.accept || '*/*',
      'accept-language': request.headers['accept-language'] || 'zh-CN',
      'cache-control': 'no-cache',
      'user-agent': request.headers['user-agent'] || 'LiveGrid',
    },
  }, (upstreamResponse) => {
    const headers = { ...upstreamResponse.headers };
    delete headers.connection;
    response.writeHead(upstreamResponse.statusCode || 502, headers);
    upstreamResponse.pipe(response);
  });
  response.on('close', () => upstream.destroy());

  upstream.on('error', (error) => {
    log(`backend proxy error: ${error.message}`);
    if (response.headersSent) {
      response.end();
      return;
    }
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: '本地直播服务未启动' }));
  });

  request.pipe(upstream);
}

function serveStatic(webRoot, request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }

  if (isApiRequest(pathname)) {
    proxyRequest(request, response);
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(webRoot, relativePath);
  const rootPrefix = `${path.resolve(webRoot)}${path.sep}`;
  if (filePath !== path.resolve(webRoot, 'index.html') && !filePath.startsWith(rootPrefix)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404).end('Not Found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': mimeTypes[extension] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob: data: http: https:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    };
    if (extension !== '.html') headers['cache-control'] = 'public, max-age=31536000, immutable';
    response.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(response);
  });
}

function startLocalServer() {
  const webRoot = path.resolve(__dirname, '..', 'dist');
  return new Promise((resolve, reject) => {
    localServer = http.createServer((request, response) => serveStatic(webRoot, request, response));
    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', () => {
      const address = localServer.address();
      localOrigin = `http://127.0.0.1:${address.port}`;
      log(`desktop server ready at ${localOrigin}`);
      resolve();
    });
  });
}

function backendHealthy() {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: `/status?t=${Date.now()}`,
      timeout: 1000,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 4096) body += chunk;
      });
      response.on('end', () => {
        try {
          const status = JSON.parse(body);
          resolve(response.statusCode === 200 && status.service === 'ok');
        } catch {
          resolve(false);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

function runCommand(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout || '') });
    });
  });
}

async function findBackendListenerPid() {
  const result = await runCommand('netstat.exe', ['-ano', '-p', 'tcp']);
  if (!result.ok) return null;
  for (const line of result.stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0]?.toUpperCase() !== 'TCP') continue;
    if (!columns[1]?.endsWith(`:${BACKEND_PORT}`) || columns[3]?.toUpperCase() !== 'LISTENING') continue;
    const pid = Number(columns[4]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

async function stopConflictingBackend() {
  if (!await backendHealthy()) return true;
  const pid = await findBackendListenerPid();
  if (!pid) {
    log('compatible service found on port 8123, but its process could not be identified');
    return false;
  }
  log(`stopping stale backend process tree ${pid}`);
  await runCommand('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!await backendHealthy()) return true;
  }
  log(`backend process ${pid} still owns port 8123`);
  return false;
}

function prepareBackend() {
  const sourceDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.resolve(__dirname, '..', 'desktop-backend');
  let runtimeDir = app.isPackaged
    ? path.join(path.dirname(process.execPath), 'runtime', 'backend')
    : path.join(app.getPath('userData'), 'backend');
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.accessSync(runtimeDir, fs.constants.W_OK);
  } catch {
    runtimeDir = path.join(app.getPath('userData'), 'backend');
  }
  fs.mkdirSync(runtimeDir, { recursive: true });

  for (const fileName of ['DouyuViewer.exe', 'dm_bridge.exe', 'dm_bridge.cs']) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(runtimeDir, fileName));
  }
  for (const fileName of ['proxy.txt', 'streams.json']) {
    const destination = path.join(runtimeDir, fileName);
    if (fs.existsSync(destination)) continue;

    const legacyConfig = path.join(app.getPath('appData'), '直播工作台', 'backend', fileName);
    const configSource = fs.existsSync(legacyConfig) ? legacyConfig : path.join(sourceDir, fileName);
    fs.copyFileSync(configSource, destination);
    if (configSource === legacyConfig) log(`migrated legacy backend config: ${fileName}`);
  }
  return runtimeDir;
}

async function ensureBackend() {
  if (!await stopConflictingBackend()) {
    log('cannot start the packaged backend while port 8123 remains occupied');
    return;
  }

  const runtimeDir = prepareBackend();
  const pythonTempDir = path.resolve(runtimeDir, '..', 'pyi-temp');
  fs.mkdirSync(pythonTempDir, { recursive: true });
  const executable = path.join(runtimeDir, 'DouyuViewer.exe');
  const backendLog = fs.openSync(path.join(runtimeDir, 'backend.log'), 'a');
  backendProcess = spawn(executable, ['server.py', '--no-browser'], {
    cwd: runtimeDir,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', backendLog, backendLog],
    env: {
      ...process.env,
      TEMP: pythonTempDir,
      TMP: pythonTempDir,
    },
  });
  fs.closeSync(backendLog);
  backendProcess.once('exit', (code) => {
    log(`owned backend exited with code ${code}`);
    backendProcess = null;
  });
  backendProcess.once('error', (error) => log(`backend start failed: ${error.message}`));

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await backendHealthy()) {
      log('owned backend is ready');
      return;
    }
  }
  log('backend did not become ready within 7.5 seconds');
}

function createWindow() {
  Menu.setApplicationMenu(null);
  let revealTimer = null;
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: '监控室',
    backgroundColor: '#f4f7fb',
    autoHideMenuBar: true,
    icon: path.resolve(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = window;

  const revealWindow = (reason) => {
    if (smokeTest || window.isDestroyed() || window.isVisible()) return;
    log(`showing window (${reason})`);
    window.show();
  };

  window.once('ready-to-show', () => revealWindow('ready-to-show'));
  revealTimer = setTimeout(() => revealWindow('3 second startup fallback'), 3000);
  window.once('closed', () => {
    clearTimeout(revealTimer);
    if (mainWindow === window) mainWindow = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin)) event.preventDefault();
  });
  window.webContents.once('did-fail-load', (_event, code, description) => {
    log(`renderer failed to load (${code}): ${description}`);
    clearTimeout(revealTimer);
    if (smokeTest) {
      app.exit(1);
      return;
    }
    revealWindow('renderer load failure');
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log(`renderer process exited (${details.reason}, code ${details.exitCode})`);
  });
  window.on('unresponsive', () => log('window became unresponsive'));
  window.webContents.once('did-finish-load', () => {
    clearTimeout(revealTimer);
    log('renderer loaded');
    if (smokeTest) {
      setTimeout(() => app.quit(), 1200);
      return;
    }
    revealWindow('renderer loaded');
  });
  void window.loadURL(localOrigin);
}

function stopOwnedBackend() {
  if (backendProcess && !backendProcess.killed) {
    const pid = backendProcess.pid;
    if (pid) {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.unref();
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = mainWindow || BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    logPath = path.join(app.getPath('userData'), 'desktop.log');
    await startLocalServer();
    createWindow();
    void ensureBackend();
  }).catch((error) => {
    log(`startup failed: ${error instanceof Error ? error.stack : String(error)}`);
    app.exit(1);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && localOrigin) createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    stopOwnedBackend();
    localServer?.close();
  });
}
