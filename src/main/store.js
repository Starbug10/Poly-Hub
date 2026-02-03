const Store = require('electron-store');

const store = new Store({
  name: 'poly-hub-data',
  defaults: {
    profile: null,
    peers: [],
    sharedFiles: [],
    settings: {
      syncFolder: null,
      maxFileSize: null, // null = unlimited
      notifications: true,
      theme: 'dark', // 'dark' or 'light'
    },
  },
});

/**
 * Get user profile
 * @returns {{name: string, ip: string, createdAt: number} | null}
 */
function getProfile() {
  return store.get('profile');
}

/**
 * Save user profile
 * @param {{name: string, ip: string}} profile
 */
function saveProfile(profile) {
  store.set('profile', {
    ...profile,
    createdAt: Date.now(),
  });
  return getProfile();
}

/**
 * Get all peers
 * @returns {Array<{name: string, ip: string, addedAt: number}>}
 */
function getPeers() {
  return store.get('peers') || [];
}

/**
 * Add a peer
 * @param {{name: string, ip: string}} peer
 */
function addPeer(peer) {
  const peers = getPeers();
  
  // Check if peer already exists
  const exists = peers.some((p) => p.ip === peer.ip);
  if (exists) {
    return { success: false, reason: 'Peer already exists' };
  }
  
  peers.push({
    ...peer,
    addedAt: Date.now(),
  });
  
  store.set('peers', peers);
  return { success: true, peers: getPeers() };
}

/**
 * Get settings
 */
function getSettings() {
  return store.get('settings');
}

/**
 * Update settings
 */
function updateSettings(settings) {
  store.set('settings', { ...getSettings(), ...settings });
  return getSettings();
}

/**
 * Get shared files
 */
function getSharedFiles() {
  return store.get('sharedFiles') || [];
}

/**
 * Add a shared file
 */
function addSharedFile(file) {
  const files = getSharedFiles();
  
  // Check if file already exists (by id or path)
  const exists = files.some((f) => f.id === file.id || f.path === file.path);
  if (exists) {
    return { success: false, reason: 'File already shared' };
  }
  
  files.push(file);
  store.set('sharedFiles', files);
  return { success: true, files: getSharedFiles() };
}

/**
 * Remove a shared file
 */
function removeSharedFile(fileId) {
  const files = getSharedFiles().filter((f) => f.id !== fileId);
  store.set('sharedFiles', files);
  return { success: true, files };
}

/**
 * Clear all data (for testing/reset)
 */
function clearAll() {
  store.clear();
}

module.exports = {
  getProfile,
  saveProfile,
  getPeers,
  addPeer,
  getSettings,
  updateSettings,
  getSharedFiles,
  addSharedFile,
  removeSharedFile,
  clearAll,
};
