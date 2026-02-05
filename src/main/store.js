const Store = require('electron-store');

const store = new Store({
  name: 'poly-hub-data',
  defaults: {
    profile: null,
    peers: [],
    sharedFiles: [],
    stats: {
      totals: {
        sentFiles: 0,
        sentBytes: 0,
        receivedFiles: 0,
        receivedBytes: 0,
      },
      // Keyed by local day in YYYY-MM-DD.
      byDay: {},
      updatedAt: null,
    },
    settings: {
      syncFolder: null,
      maxFileSize: 5, // Default 5GB per file (null = unlimited)
      maxStorageSize: 5, // Default 5GB total folder size (null = unlimited)
      notifications: true,
      theme: 'dark', // 'dark' or 'light'
      roundedCorners: false,
      accentColor: '#ff6700', // Safety Orange (default)
      compactSidebar: false, // Icon-only sidebar mode
      overlayShortcut: 'Alt+D', // Global shortcut for overlay window
      hasSeenTrayNotification: false, // Show tray notification on first minimize
      _migrated: false, // Track if user has been migrated to 5GB defaults
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
 * Update user profile
 * @param {object} updates - Partial profile updates
 */
function updateProfile(updates) {
  const current = getProfile();
  const updated = {
    ...current,
    ...updates,
    updatedAt: Date.now(),
  };
  store.set('profile', updated);
  return updated;
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
    lastSeen: Date.now(), // Track when peer was last seen
  });

  store.set('peers', peers);
  return { success: true, peers: getPeers() };
}

/**
 * Update a peer by IP
 * @param {string} peerIP - The IP of the peer to update
 * @param {object} updates - Fields to update
 */
function updatePeer(peerIP, updates) {
  const peers = getPeers();
  const index = peers.findIndex((p) => p.ip === peerIP);
  if (index === -1) {
    return { success: false, reason: 'Peer not found' };
  }
  peers[index] = { ...peers[index], ...updates };
  store.set('peers', peers);
  return { success: true, peer: peers[index] };
}

/**
 * Get settings
 * Ensures existing users get the 5GB defaults if they have null/undefined values (one-time migration)
 */
function getSettings() {
  const settings = store.get('settings');

  // Only migrate if user hasn't been migrated yet AND has null/undefined/empty values
  if (!settings._migrated) {
    const needsMigration =
      settings.maxFileSize === null ||
      settings.maxFileSize === undefined ||
      settings.maxFileSize === '' ||
      settings.maxStorageSize === null ||
      settings.maxStorageSize === undefined ||
      settings.maxStorageSize === '';

    if (needsMigration) {
      // Apply defaults for existing users who have null/undefined/empty values
      const updatedSettings = {
        ...settings,
        maxFileSize: (settings.maxFileSize === null || settings.maxFileSize === undefined || settings.maxFileSize === '') ? 5 : settings.maxFileSize,
        maxStorageSize: (settings.maxStorageSize === null || settings.maxStorageSize === undefined || settings.maxStorageSize === '') ? 5 : settings.maxStorageSize,
        notifications: settings.notifications !== false, // Default to true if undefined
        _migrated: true, // Mark as migrated so we don't override user changes
      };

      // Save the updated settings
      store.set('settings', updatedSettings);
      console.log('[STORE] Migrated settings to 5GB defaults:', updatedSettings);
      return updatedSettings;
    } else {
      // User already had values set, just mark as migrated
      const updatedSettings = {
        ...settings,
        notifications: settings.notifications !== false, // Ensure notifications defaults to true
        _migrated: true
      };
      store.set('settings', updatedSettings);
      return updatedSettings;
    }
  }

  // Ensure notifications is always defined (backwards compatibility)
  if (settings.notifications === undefined) {
    const updatedSettings = { ...settings, notifications: true };
    store.set('settings', updatedSettings);
    return updatedSettings;
  }

  return settings;
}

/**
 * Update settings
 */
function updateSettings(settings) {
  store.set('settings', { ...getSettings(), ...settings });
  return getSettings();
}

/**
 * Stats
 */

function formatLocalDayKey(timestamp) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getStats() {
  return store.get('stats');
}

/**
 * Record a completed transfer (sent or received).
 *
 * @param {{direction: 'sent'|'received', bytes: number, timestamp?: number}} entry
 */
function recordTransferStat(entry) {
  const timestamp = entry.timestamp || Date.now();
  const dayKey = formatLocalDayKey(timestamp);

  const current = getStats() || {
    totals: { sentFiles: 0, sentBytes: 0, receivedFiles: 0, receivedBytes: 0 },
    byDay: {},
    updatedAt: null,
  };

  const stats = {
    ...current,
    totals: { ...current.totals },
    byDay: { ...(current.byDay || {}) },
  };

  const bytes = Math.max(0, Number(entry.bytes) || 0);

  const day = stats.byDay[dayKey] || {
    sentFiles: 0,
    sentBytes: 0,
    receivedFiles: 0,
    receivedBytes: 0,
  };

  if (entry.direction === 'sent') {
    stats.totals.sentFiles += 1;
    stats.totals.sentBytes += bytes;
    day.sentFiles += 1;
    day.sentBytes += bytes;
  } else if (entry.direction === 'received') {
    stats.totals.receivedFiles += 1;
    stats.totals.receivedBytes += bytes;
    day.receivedFiles += 1;
    day.receivedBytes += bytes;
  }

  stats.byDay[dayKey] = day;
  stats.updatedAt = Date.now();

  store.set('stats', stats);
  return stats;
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
  updateProfile,
  getPeers,
  addPeer,
  updatePeer,
  getSettings,
  updateSettings,
  getStats,
  recordTransferStat,
  getSharedFiles,
  addSharedFile,
  removeSharedFile,
  clearAll,
};
