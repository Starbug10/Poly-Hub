const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getTailscaleStatus, getTailscaleIP } = require('./tailscale');
const { getProfile, saveProfile, getPeers, addPeer } = require('./store');

let mainWindow;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Window controls
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow.close());

// Tailscale
ipcMain.handle('tailscale:status', async () => {
  return await getTailscaleStatus();
});

ipcMain.handle('tailscale:ip', async () => {
  return await getTailscaleIP();
});

// Profile
ipcMain.handle('profile:get', () => {
  return getProfile();
});

ipcMain.handle('profile:save', (event, profile) => {
  return saveProfile(profile);
});

// Peers
ipcMain.handle('peers:get', () => {
  return getPeers();
});

ipcMain.handle('peers:add', (event, peer) => {
  return addPeer(peer);
});

// Generate pairing link
ipcMain.handle('pairing:generate', () => {
  const profile = getProfile();
  if (!profile) return null;
  
  const pairingData = {
    name: profile.name,
    ip: profile.ip,
    timestamp: Date.now(),
  };
  
  const encoded = Buffer.from(JSON.stringify(pairingData)).toString('base64url');
  return `polyhub://pair/${encoded}`;
});

// Parse pairing link
ipcMain.handle('pairing:parse', (event, link) => {
  try {
    const match = link.match(/polyhub:\/\/pair\/(.+)/);
    if (!match) return null;
    
    const decoded = Buffer.from(match[1], 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
});
