const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeImage, globalShortcut, screen, clipboard, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec } = require('child_process');
const { pathToFileURL } = require('url');
const { getTailscaleStatus, getTailscaleIP } = require('./tailscale');
const { getProfile, saveProfile, updateProfile, getPeers, addPeer, updatePeer, getSettings, updateSettings, getStats, recordTransferStat, addSharedFile, getSharedFiles, removeSharedFile } = require('./store');
const { PeerServer, sendPairRequest, createSendFileTask, announceFileDelete, announceProfileUpdate } = require('./peerServer');
const { setupAutoUpdater } = require('./autoUpdater');

let mainWindow;
let overlayWindow = null;
let peerServer;
let folderWatcher = null;
let receivingFiles = new Set(); // Track files currently being received to prevent duplicates
let tray = null;
let isQuitting = false;

// Transfer tracking (used by Transfers page)
// transferId format:
// - sending: send:<fileId>:<peerIP>
// - receiving: recv:<fileId>:<peerIP>
const activeTransfers = new Map(); // transferId -> transfer meta
const activeSendControllers = new Map(); // transferId -> {pause,resume,cancel,getState,promise}

function sendTransferUpdated(transfer) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('transfer:updated', transfer);
}

function sendTransferRemoved(transferId) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('transfer:removed', transferId);
}

function upsertTransfer(transfer) {
  activeTransfers.set(transfer.transferId, transfer);
  sendTransferUpdated(transfer);
}

function removeTransfer(transferId) {
  activeTransfers.delete(transferId);
  activeSendControllers.delete(transferId);
  sendTransferRemoved(transferId);
}

const isDev = !app.isPackaged;

// Auto-start Tailscale on app launch
function startTailscale() {
  console.log('[MAIN] Attempting to start Tailscale...');

  // Try multiple Tailscale executable locations
  const tailscalePaths = [
    'C:\\Program Files\\Tailscale\\tailscale-ipn.exe',
    'C:\\Program Files (x86)\\Tailscale\\tailscale-ipn.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Tailscale', 'tailscale-ipn.exe'),
  ];

  for (const tsPath of tailscalePaths) {
    if (fs.existsSync(tsPath)) {
      console.log(`[MAIN] Found Tailscale at: ${tsPath}`);
      exec(`"${tsPath}"`, (error) => {
        if (error) {
          console.log('[MAIN] Tailscale may already be running:', error.message);
        } else {
          console.log('[MAIN] Tailscale started successfully');
        }
      });
      return;
    }
  }

  console.log('[MAIN] Tailscale executable not found in common locations');
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Poly-Hub',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Transfers',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate', '/transfers');
        }
      },
    },
    {
      label: 'Statistics',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate', '/statistics');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Poly-Hub',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Poly-Hub - P2P File Sharing');
  tray.setContextMenu(contextMenu);

  // Double-click tray icon to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false, // Don't show immediately
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.show(); // Show in dev mode
  } else {
    // In production, dist is at the app root level
    const indexPath = path.join(__dirname, '../../dist/index.html');
    console.log('[MAIN] Loading production HTML from:', indexPath);
    mainWindow.loadFile(indexPath);
    // Check if app was started with --hidden flag or on startup
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[MAIN] Window ready to show');
    if (!process.argv.includes('--hidden') || isDev) {
      mainWindow.show();
      console.log('[MAIN] Window shown');
    } else {
      console.log('[MAIN] Window hidden (started with --hidden flag)');
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[MAIN] Failed to load:', errorCode, errorDescription);
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      // Show notification on first minimize
      const settings = getSettings();
      if (settings.notifications && !settings.hasSeenTrayNotification) {
        const { Notification } = require('electron');
        new Notification({
          title: 'Poly-Hub Running in Background',
          body: 'Poly-Hub is still running. You can receive files while minimized. Right-click the tray icon to quit.',
        }).show();
        updateSettings({ hasSeenTrayNotification: true });
      }
    }
  });
}

// Create overlay window for quick file drop
function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Calculate overlay dimensions (60% width, 15% height)
  const overlayWidth = Math.floor(width * 0.6);
  const overlayHeight = Math.floor(height * 0.15);
  const overlayX = Math.floor((width - overlayWidth) / 2);
  const overlayY = 0; // Anchored to top

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: overlayX,
    y: overlayY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.focus();

    // Register ESC key handler for this window
    overlayWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') {
        console.log('[MAIN] ESC key detected in overlay, closing...');
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.close();
          overlayWindow = null;
        }
      }
    });
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  overlayWindow.on('blur', () => {
    // Keep focus on overlay so keyboard events work
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.focus();
    }
  });

  console.log('[MAIN] Overlay window created');
}

// Toggle overlay window
function toggleOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  } else {
    createOverlayWindow();
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
    } else if (result.reason === 'Peer already exists') {
      // Update lastSeen AND profile picture for existing peer
      const updates = { lastSeen: Date.now() };
      if (peerData.profilePicture !== undefined) {
        updates.profilePicture = peerData.profilePicture;
      }
      if (peerData.name) {
        updates.name = peerData.name;
      }
      updatePeer(peerData.ip, updates);
      // Notify renderer about the updated peer
      mainWindow.webContents.send('peer:updated', peerData);
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
    recordTransferStat({ direction: 'received', bytes: file.size || 0, timestamp: Date.now() });
    mainWindow.webContents.send('file:received', file);
  });

  // Handle actual file transfers (new style - file data included)
  peerServer.on('file-received', (data) => {
    console.log(`[MAIN] File received: ${data.file.name} from ${data.from.name}`);

    // Update lastSeen for this peer
    updatePeer(data.from.ip, { lastSeen: Date.now() });

    // Remove from receiving set
    if (data.file.path) {
      receivingFiles.delete(data.file.path);
    }
    if (data.file.localPath) {
      receivingFiles.delete(data.file.localPath);
    }

    const file = {
      ...data.file,
      from: data.from,
      receivedAt: Date.now(),
    };

    // Check file size limits
    const settings = getSettings();
    const fileSizeGB = data.file.size / (1024 * 1024 * 1024);
    let exceedsLimit = false;
    let limitType = '';
    let limitValue = 0;

    if (settings.maxFileSize && fileSizeGB > settings.maxFileSize) {
      exceedsLimit = true;
      limitType = 'file size';
      limitValue = settings.maxFileSize;
    }

    if (settings.maxStorageSize) {
      // Calculate current storage usage
      const sharedFiles = getSharedFiles();
      const currentUsageBytes = sharedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      const currentUsageGB = currentUsageBytes / (1024 * 1024 * 1024);

      if (currentUsageGB + fileSizeGB > settings.maxStorageSize) {
        exceedsLimit = true;
        limitType = 'storage';
        limitValue = settings.maxStorageSize;
      }
    }

    // Always show notification if notifications are enabled (user can accept/decline)
    if (settings.notifications) {
      console.log('[MAIN] Notifications enabled, sending to renderer...');
      // Send notification to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('[MAIN] Sending file:notification event with data:', {
          fileName: data.file.name,
          fromName: data.from.name,
          exceedsLimit,
        });
        mainWindow.webContents.send('file:notification', {
          file: data.file,
          from: data.from,
          exceedsLimit,
          limitType,
          limitValue,
        });
      } else {
        console.log('[MAIN] ERROR: mainWindow is null or destroyed!');
      }
    } else {
      console.log('[MAIN] Notifications disabled, auto-accepting file');
      // Auto-accept if notifications are disabled
      addSharedFile(file);
      recordTransferStat({ direction: 'received', bytes: file.size || 0, timestamp: Date.now() });
      mainWindow.webContents.send('file:received', file);
    }
  });

  // Handle file transfer progress
  peerServer.on('file-progress', (data) => {
    console.log(`[MAIN] File progress: ${data.fileName} - ${data.progress}%`);

    const peerIP = data.from?.ip || 'unknown';
    const transferId = `recv:${data.fileId}:${peerIP}`;

    // Track this file as being received using localPath directly
    if (data.localPath) {
      // Show notification when file starts receiving (first progress event for this file)
      if (!receivingFiles.has(data.localPath)) {
        console.log(`[MAIN] New file transfer detected: ${data.fileName}`);
        const settings = getSettings();
        console.log(`[MAIN] Notifications enabled: ${settings.notifications}`);
        if (settings.notifications) {
          const { Notification } = require('electron');
          const senderName = data.from?.name || 'a peer';
          const notification = new Notification({
            title: 'Receiving File',
            body: `Receiving "${data.fileName}" from ${senderName}...`,
          });
          notification.show();
          console.log(`[MAIN] Notification shown for: ${data.fileName}`);
        }
      }
      receivingFiles.add(data.localPath);
    }

    // Update Transfers page state
    upsertTransfer({
      transferId,
      fileId: data.fileId,
      fileName: data.fileName,
      direction: 'receiving',
      peerName: data.from?.name || 'Unknown',
      peerIP,
      status: data.progress >= 100 ? 'completed' : 'receiving',
      progress: data.progress,
      bytesTransferred: data.bytesReceived,
      totalBytes: data.totalBytes,
      updatedAt: Date.now(),
    });

    // Forward to renderer (Gallery)
    mainWindow.webContents.send('file:progress', { ...data, transferId });

    if (data.progress >= 100) {
      // Keep it visible for a moment, then remove from active list.
      setTimeout(() => removeTransfer(transferId), 3000);
    }
  });

  // Handle blocked files (storage limits exceeded)
  peerServer.on('file-blocked', (data) => {
    console.log(`[MAIN] File blocked: ${data.file.name} - ${data.reason}`);
    mainWindow.webContents.send('file:blocked', {
      fileName: data.file.name,
      fileSize: data.file.size,
      from: data.from,
      reason: data.reason,
    });

    // Show notification
    const settings = getSettings();
    if (settings.notifications) {
      const { Notification } = require('electron');
      const message = data.reason === 'STORAGE_FULL'
        ? `Storage limit reached. "${data.file.name}" was blocked.`
        : `File "${data.file.name}" exceeds size limit.`;
      new Notification({
        title: 'File Blocked',
        body: message,
      }).show();
    }
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
    // Update both name and profile picture
    const updates = { name: data.profile.name };
    if (data.profile.profilePicture !== undefined) {
      updates.profilePicture = data.profile.profilePicture;
    }
    updatePeer(data.profile.ip, updates);
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

  // Set storage limits
  const maxStorageBytes = settings.maxStorageSize ? settings.maxStorageSize * 1024 * 1024 * 1024 : null;
  const maxFileBytes = settings.maxFileSize ? settings.maxFileSize * 1024 * 1024 * 1024 : null;
  peerServer.setStorageLimits(maxStorageBytes, maxFileBytes);

  try {
    await peerServer.start();
  } catch (err) {
    console.error('[MAIN] Failed to start peer server:', err);
    if (err.code === 'EADDRINUSE') {
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'Poly-Hub Already Running',
        'Another instance of Poly-Hub is already running.\n\nPlease close the other instance before starting a new one, or wait a moment for ports to free up.'
      );
      app.quit();
      return;
    }
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

  // Watch for new files and deletions
  folderWatcher = fs.watch(syncFolder, { recursive: true }, async (eventType, filename) => {
    if (eventType !== 'rename' || !filename) return;

    const filePath = path.join(syncFolder, filename);
    const fileExists = fs.existsSync(filePath);

    // Handle file deletion
    if (!fileExists && existingFiles.has(filePath)) {
      console.log(`[MAIN] File deleted from sync folder: ${filename}`);
      existingFiles.delete(filePath);

      // Find the file in shared files by path
      const sharedFiles = getSharedFiles();
      const deletedFile = sharedFiles.find(f => f.path === filePath);

      if (deletedFile) {
        // Remove from shared files
        removeSharedFile(deletedFile.id);

        // Notify renderer to update gallery
        mainWindow.webContents.send('file:deleted', deletedFile.id);

        console.log(`[MAIN] Auto-removed file from gallery: ${filename}`);
      }
      return;
    }

    // Handle file creation
    if (!fileExists) return;

    // Check if it's actually a file
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return;

    // Skip if already tracked
    if (existingFiles.has(filePath)) return;

    // Skip if file is currently being received from a peer
    if (receivingFiles.has(filePath)) {
      console.log(`[MAIN] Skipping file (currently receiving): ${filename}`);
      return;
    }

    // Skip temporary files
    if (filename.startsWith('.') || filename.endsWith('.tmp')) return;

    // Skip files with 0 size (still being written)
    if (stats.size === 0) {
      console.log(`[MAIN] Skipping file (0 bytes, possibly still writing): ${filename}`);
      return;
    }

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

  // Set app to launch on startup
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden']
    });
  }

  // Register custom protocol for loading local file thumbnails
  protocol.registerFileProtocol('polyhub-file', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('polyhub-file://', ''));
    callback({ path: filePath });
  });
  console.log('[MAIN] Registered custom protocol: polyhub-file://');

  // Start Tailscale first
  startTailscale();
  console.log('[MAIN] Tailscale auto-start initiated');

  createWindow();
  console.log('[MAIN] Main window created');

  // Create system tray
  createTray();
  console.log('[MAIN] System tray created');

  await startPeerServer();
  console.log('[MAIN] PolyHub ready');

  // Setup auto-updater (only in production)
  if (!isDev) {
    setupAutoUpdater(mainWindow);
    console.log('[MAIN] Auto-updater initialized');
  }

  // Register global shortcut for overlay (Alt+D by default)
  const settings = getSettings();
  const shortcut = settings.overlayShortcut || 'Alt+D';

  const registered = globalShortcut.register(shortcut, () => {
    console.log(`[MAIN] Global shortcut ${shortcut} triggered`);
    toggleOverlay();
  });

  if (registered) {
    console.log(`[MAIN] Global shortcut registered: ${shortcut}`);
  } else {
    console.error(`[MAIN] Failed to register global shortcut: ${shortcut}`);
  }
});

app.on('will-quit', async () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();

  // Stop peer server gracefully
  if (peerServer) {
    console.log('[MAIN] Shutting down peer server...');
    try {
      await peerServer.stop();
      console.log('[MAIN] Peer server stopped');
    } catch (err) {
      console.error('[MAIN] Error stopping peer server:', err);
    }
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running in background
  // On Windows/Linux, keep running if we have a tray icon
  if (process.platform === 'darwin' || tray) {
    // Keep running in background
    return;
  }
  app.quit();
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
ipcMain.handle('window:close', () => {
  // Close now minimizes to tray instead
  mainWindow.hide();
});

// Overlay window controls
ipcMain.on('overlay:close', () => {
  console.log('[MAIN] Overlay close requested');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    console.log('[MAIN] Closing overlay window');
    overlayWindow.close();
    overlayWindow = null;
  } else {
    console.log('[MAIN] Overlay window not found or already destroyed');
  }
});

ipcMain.on('overlay:files-dropped', async (event, filePaths) => {
  console.log('[MAIN] Files dropped on overlay:', filePaths);

  // Process dropped files
  const files = [];
  for (const filePath of filePaths) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        files.push({
          path: filePath,
          name: path.basename(filePath),
          size: stats.size,
          type: path.extname(filePath).slice(1) || 'file',
        });
      }
    } catch (err) {
      console.error(`[MAIN] Error processing file ${filePath}:`, err);
    }
  }

  if (files.length > 0) {
    // Share files using existing share logic
    const result = await shareFilesInternal(files);
    console.log(`[MAIN] Shared ${result.length} file(s) from overlay`);

    // Show notification
    const settings = getSettings();
    if (settings.notifications) {
      const { Notification } = require('electron');
      new Notification({
        title: 'Files Shared',
        body: `${result.length} file(s) shared successfully`,
      }).show();
    }

    // Notify main window to update gallery
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('files:shared', result);
    }
  }

  // Auto-hide overlay after 1 second
  setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
  }, 1000);
});

// Notification handlers (new in-app system)
ipcMain.handle('notification:accept', async (event, data) => {
  console.log('[MAIN] File accepted:', data.file.name);

  const file = {
    ...data.file,
    from: data.from,
    receivedAt: Date.now(),
  };

  addSharedFile(file);
  recordTransferStat({ direction: 'received', bytes: file.size || 0, timestamp: Date.now() });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file:received', file);
  }

  return { success: true };
});

ipcMain.handle('notification:decline', async (event, data) => {
  console.log('[MAIN] File declined:', data.file.name);

  // Delete the file from disk
  if (data.file.path && fs.existsSync(data.file.path)) {
    try {
      fs.unlinkSync(data.file.path);
      console.log('[MAIN] Declined file deleted from disk');
    } catch (err) {
      console.error('[MAIN] Error deleting declined file:', err);
    }
  }

  return { success: true };
});

// App info
ipcMain.handle('app:version', () => {
  try {
    const versionPath = path.join(__dirname, '../../version.json');
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    return versionData;
  } catch (err) {
    console.error('[MAIN] Failed to read version.json:', err);
    return { version: 'unknown', name: 'Poly-Hub' };
  }
});

// Check for updates manually
ipcMain.handle('app:checkForUpdates', async () => {
  if (isDev) {
    return { available: false, message: 'Updates not available in dev mode' };
  }

  try {
    const { autoUpdater } = require('electron-updater');
    const result = await autoUpdater.checkForUpdates();

    if (result && result.updateInfo) {
      const currentVersion = app.getVersion();
      const latestVersion = result.updateInfo.version;

      console.log(`[MAIN] Current: ${currentVersion}, Latest: ${latestVersion}`);

      if (latestVersion !== currentVersion) {
        return { available: true, version: latestVersion };
      }
    }

    return { available: false };
  } catch (err) {
    console.error('[MAIN] Error checking for updates:', err);
    return { available: false, error: err.message };
  }
});

// Open external URL in default browser
ipcMain.handle('app:openExternal', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error('[MAIN] Failed to open external URL:', err);
    return { success: false, error: err.message };
  }
});

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

// Check if a specific peer is online
ipcMain.handle('peers:checkStatus', async (event, peerIP) => {
  const POLY_HUB_PORT = 47777;
  const TIMEOUT = 3000; // 3 second timeout

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      socket.destroy();
      resolve({ ip: peerIP, online: false });
    }, TIMEOUT);

    socket.connect(POLY_HUB_PORT, peerIP, () => {
      clearTimeout(timeout);
      socket.end();
      if (!timedOut) {
        // Update lastSeen
        updatePeer(peerIP, { lastSeen: Date.now() });
        resolve({ ip: peerIP, online: true });
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      if (!timedOut) {
        resolve({ ip: peerIP, online: false });
      }
    });
  });
});

// Check status of all peers
ipcMain.handle('peers:checkAllStatus', async () => {
  const peers = getPeers();
  const statusPromises = peers.map(peer => {
    const POLY_HUB_PORT = 47777;
    const TIMEOUT = 3000;

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        socket.destroy();
        resolve({ ip: peer.ip, name: peer.name, online: false });
      }, TIMEOUT);

      socket.connect(POLY_HUB_PORT, peer.ip, () => {
        clearTimeout(timeout);
        socket.end();
        if (!timedOut) {
          // Update lastSeen
          updatePeer(peer.ip, { lastSeen: Date.now() });
          resolve({ ip: peer.ip, name: peer.name, online: true });
        }
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        if (!timedOut) {
          resolve({ ip: peer.ip, name: peer.name, online: false });
        }
      });
    });
  });

  const results = await Promise.all(statusPromises);
  return results;
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

// Helper function to share files (used by both IPC handler and overlay)
async function shareFilesInternal(files) {
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

    // Send to all peers
    console.log(`[MAIN] Sending ${file.name} to ${peers.length} peer(s)`);
    for (const peer of peers) {
      const transferId = `send:${sharedFile.id}:${peer.ip}`;

      upsertTransfer({
        transferId,
        fileId: sharedFile.id,
        fileName: sharedFile.name,
        direction: 'sending',
        peerName: peer.name,
        peerIP: peer.ip,
        status: 'sending',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: sharedFile.size,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });

      const task = createSendFileTask(peer.ip, sharedFile, profile, (progress, bytesSent, totalBytes) => {
        // Update Transfers page state
        upsertTransfer({
          transferId,
          fileId: sharedFile.id,
          fileName: sharedFile.name,
          direction: 'sending',
          peerName: peer.name,
          peerIP: peer.ip,
          status: activeTransfers.get(transferId)?.status === 'paused' ? 'paused' : 'sending',
          progress,
          bytesTransferred: bytesSent,
          totalBytes,
          startedAt: activeTransfers.get(transferId)?.startedAt || Date.now(),
          updatedAt: Date.now(),
        });

        // Forward to renderer (Gallery)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file:progress', {
            transferId,
            fileId: sharedFile.id,
            fileName: sharedFile.name,
            progress,
            bytesSent,
            totalBytes,
            direction: 'sending',
            peerName: peer.name,
            peerIP: peer.ip,
          });
        }
      });

      activeSendControllers.set(transferId, task);

      const result = await task.promise;

      if (result.success) {
        recordTransferStat({ direction: 'sent', bytes: (activeTransfers.get(transferId)?.totalBytes || sharedFile.size || 0), timestamp: Date.now() });
        upsertTransfer({
          ...(activeTransfers.get(transferId) || {}),
          transferId,
          status: 'completed',
          progress: 100,
          updatedAt: Date.now(),
        });
      } else {
        const error = result.error || 'Failed';
        const status = error === 'Cancelled' ? 'cancelled' : 'failed';
        upsertTransfer({
          ...(activeTransfers.get(transferId) || {}),
          transferId,
          status,
          updatedAt: Date.now(),
        });
      }

      activeSendControllers.delete(transferId);
      setTimeout(() => removeTransfer(transferId), 5000);
    }

    results.push(sharedFile);
  }

  console.log(`[MAIN] Successfully shared ${results.length} file(s)`);
  return results;
}

// Share files with peers
ipcMain.handle('files:share', async (event, files) => {
  return await shareFilesInternal(files);
});

// Share a folder with all files preserving structure
ipcMain.handle('files:shareFolder', async (event, folderPath) => {
  console.log(`[MAIN] Sharing folder: ${folderPath}`);

  // Validate folder exists
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error(`[MAIN] ERROR: Invalid folder path: ${folderPath}`);
    return [];
  }

  const profile = getProfile();
  const peers = getPeers();
  const settings = getSettings();
  const results = [];

  // Get folder name
  const folderName = path.basename(folderPath);

  // Set default sync folder if not configured
  let syncFolder = settings.syncFolder;
  if (!syncFolder) {
    syncFolder = path.join(app.getPath('documents'), 'PolyHub');
    if (!fs.existsSync(syncFolder)) {
      fs.mkdirSync(syncFolder, { recursive: true });
    }
    updateSettings({ syncFolder });
  }

  // Create destination folder in sync folder
  const destFolderPath = path.join(syncFolder, folderName);

  // Helper to copy folder recursively and collect files
  async function copyFolderRecursive(srcDir, destDir, relativePath = '') {
    // Create destination directory
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Recursively copy subdirectories
        await copyFolderRecursive(srcPath, destPath, relPath);
      } else if (entry.isFile()) {
        // Copy file
        try {
          fs.copyFileSync(srcPath, destPath);
          const stats = fs.statSync(destPath);
          const ext = path.extname(entry.name).slice(1) || 'file';

          const sharedFile = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: entry.name,
            path: destPath,
            size: stats.size,
            type: ext,
            sharedBy: profile.name,
            sharedAt: Date.now(),
            // Include relative path for folder structure preservation on receiver
            relativePath: `${folderName}/${relPath}`,
            folderName: folderName,
          };

          addSharedFile(sharedFile);
          results.push(sharedFile);

          console.log(`[MAIN] Copied: ${relPath}`);
        } catch (err) {
          console.error(`[MAIN] ERROR: Failed to copy ${entry.name}:`, err);
        }
      }
    }
  }

  // Copy the folder
  await copyFolderRecursive(folderPath, destFolderPath);

  console.log(`[MAIN] Folder copied, ${results.length} file(s)`);

  // Send all files to peers
  for (const file of results) {
    console.log(`[MAIN] Sending ${file.relativePath || file.name} to ${peers.length} peer(s)`);
    for (const peer of peers) {
      const transferId = `send:${file.id}:${peer.ip}`;

      upsertTransfer({
        transferId,
        fileId: file.id,
        fileName: file.name,
        direction: 'sending',
        peerName: peer.name,
        peerIP: peer.ip,
        status: 'sending',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });

      const task = createSendFileTask(peer.ip, file, profile, (progress, bytesSent, totalBytes) => {
        upsertTransfer({
          transferId,
          fileId: file.id,
          fileName: file.name,
          direction: 'sending',
          peerName: peer.name,
          peerIP: peer.ip,
          status: activeTransfers.get(transferId)?.status === 'paused' ? 'paused' : 'sending',
          progress,
          bytesTransferred: bytesSent,
          totalBytes,
          startedAt: activeTransfers.get(transferId)?.startedAt || Date.now(),
          updatedAt: Date.now(),
        });

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file:progress', {
            transferId,
            fileId: file.id,
            fileName: file.name,
            progress,
            bytesSent,
            totalBytes,
            direction: 'sending',
            peerName: peer.name,
            peerIP: peer.ip,
          });
        }
      });

      activeSendControllers.set(transferId, task);

      const result = await task.promise;

      if (result.success) {
        recordTransferStat({ direction: 'sent', bytes: (activeTransfers.get(transferId)?.totalBytes || file.size || 0), timestamp: Date.now() });
        upsertTransfer({
          ...(activeTransfers.get(transferId) || {}),
          transferId,
          status: 'completed',
          progress: 100,
          updatedAt: Date.now(),
        });
      } else {
        const error = result.error || 'Failed';
        const status = error === 'Cancelled' ? 'cancelled' : 'failed';
        upsertTransfer({
          ...(activeTransfers.get(transferId) || {}),
          transferId,
          status,
          updatedAt: Date.now(),
        });
      }

      activeSendControllers.delete(transferId);
      setTimeout(() => removeTransfer(transferId), 5000);
    }
  }

  console.log(`[MAIN] Successfully shared folder with ${results.length} file(s)`);
  return results;
});

// Transfers
ipcMain.handle('transfers:getActive', () => {
  return Array.from(activeTransfers.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
});

ipcMain.handle('transfers:pause', (event, transferId) => {
  const controller = activeSendControllers.get(transferId);
  if (!controller) return { success: false, error: 'Transfer not found' };

  const result = controller.pause();
  if (result.success) {
    const current = activeTransfers.get(transferId);
    if (current) {
      upsertTransfer({ ...current, status: 'paused', updatedAt: Date.now() });
    }
  }
  return result;
});

ipcMain.handle('transfers:resume', (event, transferId) => {
  const controller = activeSendControllers.get(transferId);
  if (!controller) return { success: false, error: 'Transfer not found' };

  const result = controller.resume();
  if (result.success) {
    const current = activeTransfers.get(transferId);
    if (current) {
      upsertTransfer({ ...current, status: 'sending', updatedAt: Date.now() });
    }
  }
  return result;
});

ipcMain.handle('transfers:cancel', (event, transferId) => {
  const controller = activeSendControllers.get(transferId);
  if (!controller) return { success: false, error: 'Transfer not found' };

  controller.cancel();

  const current = activeTransfers.get(transferId);
  if (current) {
    upsertTransfer({ ...current, status: 'cancelled', updatedAt: Date.now() });
  }

  activeSendControllers.delete(transferId);
  setTimeout(() => removeTransfer(transferId), 3000);

  return { success: true };
});

// Clipboard
ipcMain.handle('clipboard:share', async () => {
  try {
    const image = clipboard.readImage();
    if (image && !image.isEmpty()) {
      const png = image.toPNG();
      const name = `clipboard-${Date.now()}.png`;
      const tmpPath = path.join(app.getPath('temp'), name);

      fs.writeFileSync(tmpPath, png);
      try {
        const files = await shareFilesInternal([
          {
            path: tmpPath,
            name,
            size: png.length,
            type: 'png',
          },
        ]);
        return { success: true, files };
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // ignore
        }
      }
    }

    const text = clipboard.readText();
    if (text && text.trim()) {
      const buf = Buffer.from(text, 'utf8');
      const name = `clipboard-${Date.now()}.txt`;
      const tmpPath = path.join(app.getPath('temp'), name);

      fs.writeFileSync(tmpPath, buf);
      try {
        const files = await shareFilesInternal([
          {
            path: tmpPath,
            name,
            size: buf.length,
            type: 'txt',
          },
        ]);
        return { success: true, files };
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // ignore
        }
      }
    }

    return { success: false, error: 'Clipboard is empty' };
  } catch (err) {
    console.error('[MAIN] ERROR: Failed to share clipboard:', err);
    return { success: false, error: err.message };
  }
});

// Statistics
ipcMain.handle('stats:get', () => {
  return getStats();
});

// Get shared files - filter out files that no longer exist on disk
ipcMain.handle('files:get', () => {
  const sharedFiles = getSharedFiles();
  const validFiles = [];
  const invalidFileIds = [];

  for (const file of sharedFiles) {
    if (file.path && fs.existsSync(file.path)) {
      validFiles.push(file);
    } else {
      console.log(`[MAIN] Removing stale file entry: ${file.name} (${file.path})`);
      invalidFileIds.push(file.id);
    }
  }

  // Clean up stale entries from store
  for (const fileId of invalidFileIds) {
    removeSharedFile(fileId);
  }

  return validFiles;
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
      // Use 'large' size (32x32) or 'normal' (16x16)
      const icon = await app.getFileIcon(filePath, { size: 'large' });
      if (!icon.isEmpty()) {
        // Scale up the icon for better visibility but maintain crispness
        // Get at native size first, then let the frontend scale it with CSS
        const iconSize = icon.getSize();
        // If icon is small, scale it up with nearest neighbor for pixelated look
        // Otherwise use best quality
        const targetSize = 64;
        const resized = icon.resize({
          width: targetSize,
          height: targetSize,
          quality: 'best'
        });
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

  // If sync folder changed, restart folder watcher and update peer server
  if (oldSettings.syncFolder !== settings.syncFolder) {
    setupFolderWatcher(settings.syncFolder);
    if (peerServer) {
      peerServer.setSyncFolder(settings.syncFolder);
    }
  }

  // Update storage limits on peer server
  if (peerServer) {
    const maxStorageBytes = settings.maxStorageSize ? settings.maxStorageSize * 1024 * 1024 * 1024 : null;
    const maxFileBytes = settings.maxFileSize ? settings.maxFileSize * 1024 * 1024 * 1024 : null;
    peerServer.setStorageLimits(maxStorageBytes, maxFileBytes);
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
