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

  // Peers
  getPeers: () => ipcRenderer.invoke('peers:get'),
  addPeer: (peer) => ipcRenderer.invoke('peers:add', peer),

  // Pairing
  generatePairingLink: () => ipcRenderer.invoke('pairing:generate'),
  parsePairingLink: (link) => ipcRenderer.invoke('pairing:parse', link),
});
