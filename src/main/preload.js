const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Tailscale
  getTailscaleStatus: () => ipcRenderer.invoke('tailscale:status'),
  getTailscaleIP: () => ipcRenderer.invoke('tailscale:ip'),

  // Profile
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (profile) => ipcRenderer.invoke('profile:save', profile),
  updateProfile: (updates) => ipcRenderer.invoke('profile:update', updates),

  // Peers
  getPeers: () => ipcRenderer.invoke('peers:get'),
  addPeer: (peer) => ipcRenderer.invoke('peers:add', peer),

  // Pairing
  generatePairingLink: () => ipcRenderer.invoke('pairing:generate'),
  parsePairingLink: (link) => ipcRenderer.invoke('pairing:parse', link),
  connectToPeer: (peerIP) => ipcRenderer.invoke('pairing:connect', peerIP),

  // Files
  selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  shareFiles: (files) => ipcRenderer.invoke('files:share', files),
  getSharedFiles: () => ipcRenderer.invoke('files:get'),
  deleteFile: (fileId) => ipcRenderer.invoke('files:delete', fileId),
  openFile: (filePath) => ipcRenderer.invoke('files:open', filePath),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // Event listeners
  onPeerAdded: (callback) => {
    ipcRenderer.on('peer:added', (event, peer) => callback(peer));
  },
  onPeerUpdated: (callback) => {
    ipcRenderer.on('peer:updated', (event, peer) => callback(peer));
  },
  onFileReceived: (callback) => {
    ipcRenderer.on('file:received', (event, file) => callback(file));
  },
  onFileDeleted: (callback) => {
    ipcRenderer.on('file:deleted', (event, fileId) => callback(fileId));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
