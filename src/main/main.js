const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getTailscaleStatus, getTailscaleIP } = require('./tailscale');
const { getProfile, saveProfile, getPeers, addPeer, getSettings, updateSettings, addSharedFile, getSharedFiles, removeSharedFile } = require('./store');
const { PeerServer, sendPairRequest, announceFile, announceFileDelete } = require('./peerServer');

let mainWindow;
let peerServer;

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

// Start peer server for incoming connections
async function startPeerServer() {
  peerServer = new PeerServer();

  // Handle incoming pair requests (reverse-add)
  peerServer.on('pair-request', (peerData) => {
    console.log('Received pair request from:', peerData.name);
    const result = addPeer(peerData);
    if (result.success) {
      // Notify renderer about new peer
      mainWindow.webContents.send('peer:added', peerData);
    }
  });

  // Handle incoming file announcements
  peerServer.on('file-announce', (data) => {
    console.log('Received file announcement:', data.file.name);
    const file = {
      ...data.file,
      from: data.from,
      receivedAt: Date.now(),
    };
    addSharedFile(file);
    mainWindow.webContents.send('file:received', file);
  });

  // Handle incoming file deletion
  peerServer.on('file-delete', (data) => {
    console.log('Received file deletion:', data.fileId);
    removeSharedFile(data.fileId);
    mainWindow.webContents.send('file:deleted', data.fileId);
  });

  try {
    await peerServer.start();
  } catch (err) {
    console.error('Failed to start peer server:', err);
  }
}

app.whenReady().then(async () => {
  createWindow();
  await startPeerServer();
});

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

// Connect to peer and send our profile (reverse-add)
ipcMain.handle('pairing:connect', async (event, peerIP) => {
  const profile = getProfile();
  if (!profile) return { success: false, error: 'No profile set' };

  const result = await sendPairRequest(peerIP, profile);
  return result;
});

// File dialog - select files
ipcMain.handle('dialog:selectFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Files to Share',
  });

  if (result.canceled) return [];

  return result.filePaths.map((filePath) => {
    const stats = fs.statSync(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      type: path.extname(filePath).slice(1) || 'file',
    };
  });
});

// File dialog - select folder
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder to Share',
  });

  if (result.canceled) return null;

  const folderPath = result.filePaths[0];
  const stats = fs.statSync(folderPath);

  return {
    path: folderPath,
    name: path.basename(folderPath),
    size: getFolderSize(folderPath),
    type: 'folder',
  };
});

// Helper to get folder size
function getFolderSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getFolderSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (e) {
    // Permission errors, etc.
  }
  return size;
}

// Share files with peers
ipcMain.handle('files:share', async (event, files) => {
  const profile = getProfile();
  const peers = getPeers();
  const results = [];

  for (const file of files) {
    // Add to our shared files
    const sharedFile = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      path: file.path,
      size: file.size,
      type: file.type,
      sharedBy: profile.name,
      sharedAt: Date.now(),
    };
    addSharedFile(sharedFile);

    // Announce to all peers
    for (const peer of peers) {
      await announceFile(peer.ip, sharedFile, profile);
    }

    results.push(sharedFile);
  }

  return results;
});

// Get shared files
ipcMain.handle('files:get', () => {
  return getSharedFiles();
});

// Delete a shared file
ipcMain.handle('files:delete', async (event, fileId) => {
  const profile = getProfile();
  const peers = getPeers();

  // Remove from local storage
  const result = removeSharedFile(fileId);

  // Notify all peers about deletion
  for (const peer of peers) {
    await announceFileDelete(peer.ip, fileId, profile);
  }

  return result;
});

// Settings
ipcMain.handle('settings:get', () => {
  return getSettings();
});

ipcMain.handle('settings:update', (event, settings) => {
  return updateSettings(settings);
});
