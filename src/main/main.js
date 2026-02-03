const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { getTailscaleStatus, getTailscaleIP } = require('./tailscale');
const { getProfile, saveProfile, updateProfile, getPeers, addPeer, updatePeer, getSettings, updateSettings, addSharedFile, getSharedFiles, removeSharedFile } = require('./store');
const { PeerServer, sendPairRequest, announceFile, announceFileDelete, announceProfileUpdate } = require('./peerServer');

let mainWindow;
let peerServer;
let folderWatcher = null;

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
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Start peer server for incoming connections
async function startPeerServer() {
  peerServer = new PeerServer();

  // Handle incoming pair requests (reverse-add)
  peerServer.on('pair-request', (peerData) => {
    console.log(`[MAIN] Received pair request from: ${peerData.name} (${peerData.ip})`);
    const result = addPeer(peerData);
    if (result.success) {
      console.log(`[MAIN] Successfully added peer: ${peerData.name}`);
      // Notify renderer about new peer
      mainWindow.webContents.send('peer:added', peerData);
      
      // Show notification
      const settings = getSettings();
      if (settings.notifications) {
        const { Notification } = require('electron');
        new Notification({
          title: 'New Peer Connected',
          body: `${peerData.name} has connected to PolyHub`,
        }).show();
      }
    }
  });

  // Handle incoming file announcements (old style - metadata only)
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

  // Handle actual file transfers (new style - file data included)
  peerServer.on('file-received', (data) => {
    console.log(`[MAIN] File received: ${data.file.name} from ${data.from.name}`);
    const file = {
      ...data.file,
      from: data.from,
      receivedAt: Date.now(),
    };
    addSharedFile(file);
    mainWindow.webContents.send('file:received', file);
    
    // Show notification
    const settings = getSettings();
    if (settings.notifications) {
      const { Notification } = require('electron');
      new Notification({
        title: 'File Received',
        body: `${data.from.name} shared ${data.file.name}`,
      }).show();
    }
  });

  // Handle file transfer progress
  peerServer.on('file-progress', (data) => {
    console.log(`[MAIN] File progress: ${data.fileName} - ${data.progress}%`);
    mainWindow.webContents.send('file:progress', data);
  });

  // Handle incoming file deletion
  peerServer.on('file-delete', (data) => {
    console.log(`[MAIN] File deletion received: ${data.fileId}`);
    
    // Also delete from disk
    const sharedFiles = getSharedFiles();
    const fileToDelete = sharedFiles.find(f => f.id === data.fileId);
    if (fileToDelete && fileToDelete.path) {
      try {
        if (fs.existsSync(fileToDelete.path)) {
          fs.unlinkSync(fileToDelete.path);
          console.log(`[MAIN] Deleted file from disk: ${fileToDelete.path}`);
        }
      } catch (err) {
        console.error(`[MAIN] ERROR: Failed to delete file from disk: ${err.message}`);
      }
    }
    
    removeSharedFile(data.fileId);
    mainWindow.webContents.send('file:deleted', data.fileId);
  });

  // Handle incoming profile updates
  peerServer.on('profile-update', (data) => {
    console.log(`[MAIN] Profile update received: ${data.profile.name} (${data.profile.ip})`);
    updatePeer(data.profile.ip, { name: data.profile.name });
    mainWindow.webContents.send('peer:updated', data.profile);
  });

  // Set sync folder for receiving files
  let settings = getSettings();
  let syncFolder = settings.syncFolder;
  if (!syncFolder) {
    syncFolder = path.join(app.getPath('documents'), 'PolyHub');
    console.log(`[MAIN] No sync folder configured, creating default: ${syncFolder}`);
    if (!fs.existsSync(syncFolder)) {
      fs.mkdirSync(syncFolder, { recursive: true });
    }
    updateSettings({ syncFolder });
  }
  console.log(`[MAIN] Using sync folder: ${syncFolder}`);
  peerServer.setSyncFolder(syncFolder);

  try {
    await peerServer.start();
  } catch (err) {
    console.error('Failed to start peer server:', err);
  }
  
  // Setup folder watcher for auto-sync
  setupFolderWatcher(syncFolder);
}

// Setup folder watcher to auto-add files
function setupFolderWatcher(syncFolder) {
  // Close existing watcher
  if (folderWatcher) {
    console.log('[MAIN] Closing existing folder watcher');
    folderWatcher.close();
    folderWatcher = null;
  }
  
  if (!syncFolder || !fs.existsSync(syncFolder)) {
    console.log('[MAIN] No valid sync folder, skipping folder watcher setup');
    return;
  }
  
  console.log(`[MAIN] Setting up folder watcher for: ${syncFolder}`);
  
  // Track existing files to avoid re-adding them
  const existingFiles = new Set();
  const sharedFiles = getSharedFiles();
  sharedFiles.forEach(file => {
    if (file.path) {
      existingFiles.add(file.path);
    }
  });
  
  // Watch for new files
  folderWatcher = fs.watch(syncFolder, { recursive: false }, async (eventType, filename) => {
    if (eventType !== 'rename' || !filename) return;
    
    const filePath = path.join(syncFolder, filename);
    
    // Check if file exists (rename event fires for both create and delete)
    if (!fs.existsSync(filePath)) return;
    
    // Check if it's actually a file
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return;
    
    // Skip if already tracked
    if (existingFiles.has(filePath)) return;
    
    // Skip temporary files
    if (filename.startsWith('.') || filename.endsWith('.tmp')) return;
    
    console.log(`[MAIN] New file detected in sync folder: ${filename}`);
    existingFiles.add(filePath);
    
    // Add to shared files
    const fileExt = path.extname(filename).toLowerCase().slice(1);
    const file = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: filename,
      path: filePath,
      size: stats.size,
      type: fileExt,
      sharedAt: Date.now(),
      sharedBy: 'You',
    };
    
    addSharedFile(file);
    
    // Notify renderer
    mainWindow.webContents.send('file:auto-added', file);
    
    console.log(`[MAIN] Auto-added file: ${filename}`);
  });
  
  console.log('[MAIN] Folder watcher active');
}

app.whenReady().then(async () => {
  console.log('[MAIN] PolyHub starting up...');
  
  // Register custom protocol for loading local file thumbnails
  protocol.registerFileProtocol('polyhub-file', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('polyhub-file://', ''));
    callback({ path: filePath });
  });
  console.log('[MAIN] Registered custom protocol: polyhub-file://');

  createWindow();
  console.log('[MAIN] Main window created');
  
  await startPeerServer();
  console.log('[MAIN] PolyHub ready');
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

ipcMain.handle('profile:update', async (event, updates) => {
  const updatedProfile = updateProfile(updates);
  const peers = getPeers();
  
  // Notify all peers about profile update
  for (const peer of peers) {
    await announceProfileUpdate(peer.ip, updatedProfile);
  }
  
  return updatedProfile;
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
  console.log(`[MAIN] Folder selected: ${folderPath}`);
  
  // Get all files in the folder recursively
  const files = getAllFilesInFolder(folderPath);
  console.log(`[MAIN] Found ${files.length} file(s) in folder`);
  
  return {
    path: folderPath,
    name: path.basename(folderPath),
    files: files,
  };
});

// Helper to get all files in a folder recursively
function getAllFilesInFolder(dirPath) {
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Recursively get files from subdirectories
        files.push(...getAllFilesInFolder(fullPath));
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        files.push({
          path: fullPath,
          name: entry.name,
          size: stats.size,
          type: path.extname(entry.name).slice(1) || 'file',
        });
      }
    }
  } catch (e) {
    console.error(`[MAIN] ERROR: Failed to read folder ${dirPath}:`, e);
  }
  return files;
}

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
  console.log(`[MAIN] Sharing ${files.length} file(s)`);
  const profile = getProfile();
  const peers = getPeers();
  const settings = getSettings();
  const results = [];

  // Set default sync folder if not configured
  let syncFolder = settings.syncFolder;
  if (!syncFolder) {
    syncFolder = path.join(app.getPath('documents'), 'PolyHub');
    if (!fs.existsSync(syncFolder)) {
      fs.mkdirSync(syncFolder, { recursive: true });
    }
    updateSettings({ syncFolder });
  }

  for (const file of files) {
    // Copy file to sync folder
    const destPath = path.join(syncFolder, file.name);
    console.log(`[MAIN] Copying ${file.name} to sync folder: ${destPath}`);
    try {
      // Copy file to sync folder
      fs.copyFileSync(file.path, destPath);
    } catch (err) {
      console.error(`[MAIN] ERROR: Failed to copy file ${file.name}:`, err);
      continue;
    }

    // Add to our shared files with new path
    const sharedFile = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      path: destPath,
      size: file.size,
      type: file.type,
      sharedBy: profile.name,
      sharedAt: Date.now(),
    };
    addSharedFile(sharedFile);

    // Announce to all peers
    console.log(`[MAIN] Announcing ${file.name} to ${peers.length} peer(s)`);
    for (const peer of peers) {
      await announceFile(peer.ip, sharedFile, profile);
    }

    results.push(sharedFile);
  }

  console.log(`[MAIN] Successfully shared ${results.length} file(s)`);
  return results;
});

// Get shared files
ipcMain.handle('files:get', () => {
  return getSharedFiles();
});

// Delete a shared file
ipcMain.handle('files:delete', async (event, fileId) => {
  console.log(`[MAIN] Deleting file: ${fileId}`);
  const profile = getProfile();
  const peers = getPeers();
  const sharedFiles = getSharedFiles();
  
  // Find the file to get its path
  const fileToDelete = sharedFiles.find(f => f.id === fileId);
  
  // Remove from local storage first
  const result = removeSharedFile(fileId);
  
  // Delete the actual file from disk
  if (fileToDelete && fileToDelete.path) {
    try {
      if (fs.existsSync(fileToDelete.path)) {
        fs.unlinkSync(fileToDelete.path);
        console.log(`[MAIN] Deleted file from disk: ${fileToDelete.path}`);
      }
    } catch (err) {
      console.error(`[MAIN] ERROR: Failed to delete file from disk: ${err.message}`);
    }
  }

  // Notify all peers about deletion
  console.log(`[MAIN] Notifying ${peers.length} peer(s) about file deletion`);
  for (const peer of peers) {
    const sendResult = await announceFileDelete(peer.ip, fileId, profile);
    if (sendResult.success) {
      console.log(`[MAIN] Notified ${peer.name} about deletion`);
    } else {
      console.error(`[MAIN] Failed to notify ${peer.name}: ${sendResult.error}`);
    }
  }

  return result;
});

// Open a file with default system application
ipcMain.handle('files:open', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get file thumbnail as data URL
ipcMain.handle('files:getThumbnail', async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif'];
    
    if (imageExts.includes(ext)) {
      // For image files, create a thumbnail from the actual image
      const image = nativeImage.createFromPath(filePath);
      if (!image.isEmpty()) {
        const size = image.getSize();
        // Resize to thumbnail size (max 400px for better quality)
        const maxSize = 400;
        let width = size.width;
        let height = size.height;
        
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        const thumbnail = image.resize({ width, height, quality: 'best' });
        return thumbnail.toDataURL();
      }
    } else {
      // For non-image files, try to get the file icon from Windows
      const icon = await app.getFileIcon(filePath, { size: 'large' });
      if (!icon.isEmpty()) {
        // Reduced icon size (25% smaller than before)
        const resized = icon.resize({ width: 48, height: 48, quality: 'best' });
        return resized.toDataURL();
      }
    }
    
    return null;
  } catch (err) {
    console.error(`[MAIN] ERROR: Failed to generate thumbnail for ${filePath}:`, err);
    return null;
  }
});

// Settings
ipcMain.handle('settings:get', () => {
  return getSettings();
});

ipcMain.handle('settings:update', (event, settings) => {
  const oldSettings = getSettings();
  const updated = updateSettings(settings);
  
  // If sync folder changed, restart folder watcher
  if (oldSettings.syncFolder !== settings.syncFolder) {
    setupFolderWatcher(settings.syncFolder);
  }
  
  return updated;
});

// Get storage statistics
ipcMain.handle('settings:getStorageStats', async () => {
  const settings = getSettings();
  const syncFolder = settings.syncFolder;
  
  if (!syncFolder || !fs.existsSync(syncFolder)) {
    return {
      folderSize: 0,
      diskTotal: 0,
      diskFree: 0,
      maxSize: settings.maxFileSize ? parseInt(settings.maxFileSize) * 1024 * 1024 * 1024 : null,
      filesByType: {},
    };
  }
  
  // Get file breakdown by type
  const filesByType = {
    images: { size: 0, count: 0, color: '#4CAF50' },
    videos: { size: 0, count: 0, color: '#2196F3' },
    audio: { size: 0, count: 0, color: '#9C27B0' },
    documents: { size: 0, count: 0, color: '#FF9800' },
    archives: { size: 0, count: 0, color: '#795548' },
    other: { size: 0, count: 0, color: '#607D8B' },
  };
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
  const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
  
  let folderSize = 0;
  
  function scanFolder(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanFolder(fullPath);
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          folderSize += stats.size;
          
          if (imageExts.includes(ext)) {
            filesByType.images.size += stats.size;
            filesByType.images.count++;
          } else if (videoExts.includes(ext)) {
            filesByType.videos.size += stats.size;
            filesByType.videos.count++;
          } else if (audioExts.includes(ext)) {
            filesByType.audio.size += stats.size;
            filesByType.audio.count++;
          } else if (docExts.includes(ext)) {
            filesByType.documents.size += stats.size;
            filesByType.documents.count++;
          } else if (archiveExts.includes(ext)) {
            filesByType.archives.size += stats.size;
            filesByType.archives.count++;
          } else {
            filesByType.other.size += stats.size;
            filesByType.other.count++;
          }
        }
      }
    } catch (e) {
      console.error(`[MAIN] ERROR: Failed to scan folder ${dirPath}:`, e);
    }
  }
  
  scanFolder(syncFolder);
  
  // Get disk space info
  let diskTotal = 0;
  let diskFree = 0;
  
  try {
    // Use Node.js to get disk info (Windows-specific)
    const { execSync } = require('child_process');
    const driveLetter = syncFolder.charAt(0).toUpperCase();
    const output = execSync(`wmic logicaldisk where "DeviceID='${driveLetter}:'" get Size,FreeSpace /format:csv`, {
      encoding: 'utf8',
    });
    const lines = output.trim().split('\n');
    if (lines.length >= 2) {
      const values = lines[1].split(',');
      if (values.length >= 3) {
        diskFree = parseInt(values[1]) || 0;
        diskTotal = parseInt(values[2]) || 0;
      }
    }
  } catch (e) {
    console.error('[MAIN] ERROR: Failed to get disk info:', e);
  }
  
  return {
    folderSize,
    diskTotal,
    diskFree,
    maxSize: settings.maxFileSize ? parseInt(settings.maxFileSize) * 1024 * 1024 * 1024 : null,
    filesByType,
  };
});
