import React, { useState, useEffect } from 'react';
import './Settings.css';

function Settings({ profile: initialProfile }) {
  const [settings, setSettings] = useState({
    syncFolder: null,
    maxFileSize: '5',
    maxStorageSize: '5',
    notifications: true,
    theme: 'dark',
    roundedCorners: false,
    accentColor: '#ff6700',
    compactSidebar: false,
  });
  const [profile, setProfile] = useState(initialProfile);
  const [peers, setPeers] = useState([]);
  const [peerStatus, setPeerStatus] = useState({}); // Track online/offline status
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [storageStats, setStorageStats] = useState(null);
  const [appVersion, setAppVersion] = useState(null);

  // Discovery state
  const [pairingLink, setPairingLink] = useState('');
  const [inputLink, setInputLink] = useState('');
  const [pairingStatus, setPairingStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadData();

    // Listen for incoming peer additions (reverse-add)
    window.electronAPI.onPeerAdded((peer) => {
      setPeers((prev) => {
        if (prev.some((p) => p.ip === peer.ip)) return prev;
        return [...prev, peer];
      });
      setPairingStatus({ type: 'success', message: `${peer.name} connected to you!` });
      // Mark new peer as online
      setPeerStatus((prev) => ({ ...prev, [peer.ip]: true }));
    });

    return () => {
      window.electronAPI.removeAllListeners('peer:added');
    };
  }, []);

  // Check peer status periodically
  useEffect(() => {
    if (peers.length === 0) return;

    // Initial check
    checkPeersStatus();

    // Then check every 10 seconds
    const interval = setInterval(checkPeersStatus, 10000);
    return () => clearInterval(interval);
  }, [peers]);

  const [checkingPeers, setCheckingPeers] = useState(false);

  const checkPeersStatus = async () => {
    setCheckingPeers(true);
    try {
      const statusResults = await window.electronAPI.checkAllPeersStatus();
      const statusMap = {};
      statusResults.forEach(result => {
        statusMap[result.ip] = result.online;
      });
      setPeerStatus(statusMap);
    } finally {
      setCheckingPeers(false);
    }
  };

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', settings.theme);

    // Apply rounded corners preference
    if (settings.roundedCorners) {
      document.documentElement.classList.add('rounded-corners');
    } else {
      document.documentElement.classList.remove('rounded-corners');
    }

    // Apply compact sidebar preference
    if (settings.compactSidebar) {
      document.documentElement.classList.add('compact-sidebar');
    } else {
      document.documentElement.classList.remove('compact-sidebar');
    }

    // Apply accent color
    if (settings.accentColor) {
      document.documentElement.style.setProperty('--color-accent', settings.accentColor);
      // Calculate dimmed version (darker)
      const r = parseInt(settings.accentColor.slice(1, 3), 16);
      const g = parseInt(settings.accentColor.slice(3, 5), 16);
      const b = parseInt(settings.accentColor.slice(5, 7), 16);
      const dimmed = `#${Math.floor(r * 0.8).toString(16).padStart(2, '0')}${Math.floor(g * 0.8).toString(16).padStart(2, '0')}${Math.floor(b * 0.8).toString(16).padStart(2, '0')}`;
      document.documentElement.style.setProperty('--color-accent-dim', dimmed);
    }
  }, [settings.theme, settings.roundedCorners, settings.accentColor, settings.compactSidebar]);

  async function loadData() {
    const currentSettings = await window.electronAPI.getSettings();
    // Ensure maxFileSize and maxStorageSize are always strings for controlled inputs
    // Use the values from settings (which now default to 5GB)
    setSettings({
      ...currentSettings,
      maxFileSize: currentSettings.maxFileSize != null ? String(currentSettings.maxFileSize) : '5',
      maxStorageSize: currentSettings.maxStorageSize != null ? String(currentSettings.maxStorageSize) : '5',
      roundedCorners: currentSettings.roundedCorners || false,
      accentColor: currentSettings.accentColor || '#ff6700',
      compactSidebar: currentSettings.compactSidebar || false,
    });

    // Apply saved theme on load
    document.documentElement.setAttribute('data-theme', currentSettings.theme || 'dark');

    // Apply rounded corners on load
    if (currentSettings.roundedCorners) {
      document.documentElement.classList.add('rounded-corners');
    }

    // Apply compact sidebar on load
    if (currentSettings.compactSidebar) {
      document.documentElement.classList.add('compact-sidebar');
    }

    // Apply accent color on load
    if (currentSettings.accentColor) {
      document.documentElement.style.setProperty('--color-accent', currentSettings.accentColor);
      const r = parseInt(currentSettings.accentColor.slice(1, 3), 16);
      const g = parseInt(currentSettings.accentColor.slice(3, 5), 16);
      const b = parseInt(currentSettings.accentColor.slice(5, 7), 16);
      const dimmed = `#${Math.floor(r * 0.8).toString(16).padStart(2, '0')}${Math.floor(g * 0.8).toString(16).padStart(2, '0')}${Math.floor(b * 0.8).toString(16).padStart(2, '0')}`;
      document.documentElement.style.setProperty('--color-accent-dim', dimmed);
    }

    const currentProfile = await window.electronAPI.getProfile();
    setProfile(currentProfile);
    if (currentProfile) {
      setNewName(currentProfile.name);
    }

    const currentPeers = await window.electronAPI.getPeers();
    setPeers(currentPeers);

    // Load storage stats
    const stats = await window.electronAPI.getStorageStats();
    setStorageStats(stats);

    // Load pairing link
    const link = await window.electronAPI.generatePairingLink();
    setPairingLink(link);

    // Load app version
    const version = await window.electronAPI.getVersion();
    setAppVersion(version);
  }

  // Helper function to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const handleSave = async () => {
    await window.electronAPI.updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleNameUpdate = async () => {
    if (!newName.trim() || newName === profile?.name) {
      setEditingName(false);
      return;
    }
    const updatedProfile = await window.electronAPI.updateProfile({ name: newName.trim() });
    setProfile(updatedProfile);
    setEditingName(false);
  };

  const handleMaxFileSizeChange = (e) => {
    const value = e.target.value;
    setSettings((prev) => ({
      ...prev,
      maxFileSize: value,
    }));
  };

  const handleNotificationsChange = (e) => {
    setSettings((prev) => ({
      ...prev,
      notifications: e.target.checked,
    }));
  };

  const handleThemeChange = async (theme) => {
    const newSettings = { ...settings, theme };
    setSettings(newSettings);
    document.documentElement.setAttribute('data-theme', theme);
    await window.electronAPI.updateSettings(newSettings);
  };

  const handleSelectSyncFolder = async () => {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      setSettings((prev) => ({
        ...prev,
        syncFolder: folder.path,
      }));
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pairingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleConnect = async () => {
    if (!inputLink.trim()) return;

    setPairingStatus(null);
    setConnecting(true);

    // Parse the incoming link
    const peerData = await window.electronAPI.parsePairingLink(inputLink.trim());

    if (!peerData) {
      setPairingStatus({ type: 'error', message: 'Invalid pairing link' });
      setConnecting(false);
      return;
    }

    // Check if it's not our own link
    if (peerData.ip === profile?.ip) {
      setPairingStatus({ type: 'error', message: "You can't pair with yourself" });
      setConnecting(false);
      return;
    }

    // Add the peer locally
    const result = await window.electronAPI.addPeer({
      name: peerData.name,
      ip: peerData.ip,
    });

    if (result.success) {
      setPeers(result.peers);

      // Send our profile to the peer (reverse-add)
      const connectResult = await window.electronAPI.connectToPeer(peerData.ip);

      if (connectResult.success) {
        setPairingStatus({ type: 'success', message: `Connected to ${peerData.name}!` });
      } else {
        setPairingStatus({
          type: 'warning',
          message: `Added ${peerData.name}, but couldn't notify them (they may be offline)`
        });
      }

      setInputLink('');
    } else {
      setPairingStatus({ type: 'error', message: result.reason || 'Failed to add peer' });
    }

    setConnecting(false);
  };

  return (
    <div className="settings">
      <header className="settings-header">
        <h1 className="settings-title">SETTINGS</h1>
        <span className="settings-subtitle">Configure your PolyHub preferences</span>
      </header>

      <div className="settings-content">
        {/* Profile Section */}
        <section className="settings-section">
          <h2 className="section-title">PROFILE</h2>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Name</span>
                <span className="label-description">Your display name visible to peers</span>
              </div>
              <div className="setting-value">
                {editingName ? (
                  <>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="name-input"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleNameUpdate()}
                    />
                    <button onClick={handleNameUpdate} className="setting-btn name-update-btn">
                      SAVE
                    </button>
                    <button onClick={() => { setEditingName(false); setNewName(profile?.name || ''); }} className="setting-btn">
                      CANCEL
                    </button>
                  </>
                ) : (
                  <>
                    <span className="value-text">{profile?.name || '—'}</span>
                    <button onClick={() => setEditingName(true)} className="setting-btn">
                      EDIT
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Tailscale IP</span>
                <span className="label-description">Your network address for P2P connections</span>
              </div>
              <div className="setting-value">
                <span className="value-text value-mono">{profile?.ip || '—'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Storage Section */}
        <section className="settings-section">
          <h2 className="section-title">STORAGE</h2>

          {/* Storage Status Bar */}
          {storageStats && settings.syncFolder && (
            <div className="storage-stats">
              <div className="storage-info">
                <span className="storage-used">{formatBytes(storageStats.folderSize)}</span>
                <span className="storage-divider">/</span>
                <span className="storage-total">
                  {storageStats.maxSize
                    ? formatBytes(storageStats.maxSize) + ' limit'
                    : formatBytes(storageStats.diskTotal) + ' disk'
                  }
                </span>
                <span className="storage-free">
                  ({formatBytes(storageStats.diskFree)} free)
                </span>
              </div>

              {/* Visual bar showing usage by file type */}
              <div className="storage-bar-container">
                <div className="storage-bar">
                  {Object.entries(storageStats.filesByType).map(([type, data]) => {
                    const percentage = storageStats.maxSize
                      ? (data.size / storageStats.maxSize) * 100
                      : (data.size / storageStats.diskTotal) * 100;
                    if (percentage < 0.5) return null;
                    return (
                      <div
                        key={type}
                        className="storage-bar-segment"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: data.color,
                        }}
                        title={`${type}: ${formatBytes(data.size)} (${data.count} files)`}
                      />
                    );
                  })}
                </div>
                <div className="storage-bar-bg" />
              </div>

              {/* Legend */}
              <div className="storage-legend">
                {Object.entries(storageStats.filesByType).map(([type, data]) => {
                  if (data.count === 0) return null;
                  return (
                    <div key={type} className="storage-legend-item">
                      <span
                        className="storage-legend-color"
                        style={{ backgroundColor: data.color }}
                      />
                      <span className="storage-legend-label">
                        {type} ({data.count})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Sync Folder</span>
                <span className="label-description">Where shared files are stored locally</span>
              </div>
              <div className="setting-value">
                <span className="value-text value-mono">
                  {settings.syncFolder || 'Not set'}
                </span>
                <button onClick={handleSelectSyncFolder} className="setting-btn">
                  BROWSE
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Max File Size</span>
                <span className="label-description">Maximum size per file (GB). Leave empty for unlimited.</span>
              </div>
              <div className="setting-value">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  placeholder="Unlimited"
                  value={settings.maxFileSize || ''}
                  onChange={handleMaxFileSizeChange}
                  className="setting-input"
                />
                <span className="value-unit">GB</span>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Max Storage Size</span>
                <span className="label-description">Maximum total folder size (GB). Blocks incoming files if exceeded.</span>
              </div>
              <div className="setting-value">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  placeholder="Unlimited"
                  value={settings.maxStorageSize || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, maxStorageSize: e.target.value }))}
                  className="setting-input"
                />
                <span className="value-unit">GB</span>
              </div>
            </div>
          </div>
        </section>

        {/* Appearance Section */}
        <section className="settings-section">
          <h2 className="section-title">APPEARANCE</h2>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Theme</span>
                <span className="label-description">Choose between dark and light mode</span>
              </div>
              <div className="setting-value">
                <div className="theme-switcher">
                  <button
                    className={`theme-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    DARK
                  </button>
                  <button
                    className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                  >
                    LIGHT
                  </button>
                </div>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Rounded Corners</span>
                <span className="label-description">Apply rounded corners to UI elements</span>
              </div>
              <div className="setting-value">
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={settings.roundedCorners}
                    onChange={(e) => setSettings((prev) => ({ ...prev, roundedCorners: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Accent Color</span>
                <span className="label-description">Choose your preferred accent color</span>
              </div>
              <div className="setting-value">
                <div className="color-picker-wrapper">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => setSettings((prev) => ({ ...prev, accentColor: e.target.value }))}
                    className="color-picker-input"
                  />
                  <span className="color-picker-value">{settings.accentColor.toUpperCase()}</span>
                  <button
                    onClick={() => setSettings((prev) => ({ ...prev, accentColor: '#ff6700' }))}
                    className="setting-btn"
                    title="Reset to default orange"
                  >
                    RESET
                  </button>
                </div>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Compact Sidebar</span>
                <span className="label-description">Show only icons in sidebar (hover to see full info)</span>
              </div>
              <div className="setting-value">
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={settings.compactSidebar}
                    onChange={(e) => setSettings((prev) => ({ ...prev, compactSidebar: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="settings-section">
          <h2 className="section-title">NOTIFICATIONS</h2>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Enable Notifications</span>
                <span className="label-description">Get notified when files are shared</span>
              </div>
              <div className="setting-value">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.notifications}
                    onChange={handleNotificationsChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Peer Discovery Section */}
        <section className="settings-section">
          <h2 className="section-title">PEER DISCOVERY</h2>
          <div className="settings-card">
            {/* Share Your Link */}
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Your Pairing Link</span>
                <span className="label-description">Share this link with others to connect</span>
              </div>
              <div className="setting-value pairing-link-value">
                <input
                  type="text"
                  value={pairingLink}
                  readOnly
                  className="pairing-input"
                />
                <button
                  onClick={handleCopyLink}
                  className={`setting-btn ${copied ? 'copied' : ''}`}
                >
                  {copied ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Paste Link */}
            <div className="setting-row">
              <div className="setting-label">
                <span className="label-title">Connect to Peer</span>
                <span className="label-description">Paste a link received from another user</span>
              </div>
              <div className="setting-value pairing-link-value">
                <input
                  type="text"
                  value={inputLink}
                  onChange={(e) => setInputLink(e.target.value)}
                  placeholder="polyhub://pair/..."
                  className="pairing-input"
                />
                <button
                  onClick={handleConnect}
                  className="setting-btn primary-btn"
                  disabled={!inputLink.trim() || connecting}
                >
                  {connecting ? 'CONNECTING...' : 'CONNECT'}
                </button>
              </div>
            </div>

            {/* Pairing Status */}
            {pairingStatus && (
              <div className={`pairing-status pairing-${pairingStatus.type}`}>
                {pairingStatus.message}
              </div>
            )}
          </div>
        </section>

        {/* Connected Peers Section */}
        <section className="settings-section">
          <div className="section-header-row">
            <h2 className="section-title">CONNECTED PEERS ({peers.length})</h2>
            {peers.length > 0 && (
              <button
                className="retry-peers-btn"
                onClick={checkPeersStatus}
                disabled={checkingPeers}
                title="Check peer status"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={checkingPeers ? 'spinning' : ''}
                >
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {checkingPeers ? 'CHECKING...' : 'RETRY'}
              </button>
            )}
          </div>
          <div className="settings-card">
            {peers.length === 0 ? (
              <div className="setting-row">
                <span className="value-text text-muted">No peers connected. Use the pairing link above to connect!</span>
              </div>
            ) : (
              peers.map((peer) => {
                const isOnline = peerStatus[peer.ip] === true;
                const isChecking = peerStatus[peer.ip] === undefined;
                return (
                  <div key={peer.ip} className="setting-row peer-row">
                    <div className="peer-status-indicator">
                      <div className={`peer-status-dot ${isOnline ? 'online' : 'offline'}`} />
                    </div>
                    <div className="setting-label">
                      <span className="label-title">{peer.name}</span>
                      <span className="label-description">{peer.ip}</span>
                    </div>
                    <div className="setting-value">
                      <span className={`peer-status ${isOnline ? 'online' : 'offline'}`}>
                        {isChecking ? 'Checking...' : isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Save Button */}
        <div className="settings-actions">
          <button onClick={handleSave} className="primary">
            {saved ? 'SAVED!' : 'SAVE SETTINGS'}
          </button>
        </div>

        {/* Version Info */}
        {appVersion && (
          <div className="settings-version">
            <span className="version-label">{appVersion.name}</span>
            <span className="version-number">V{appVersion.version}</span>
            <span className="version-divider">•</span>
            <button
              onClick={() => window.electronAPI.openExternal('https://poly-hub.netlify.app/')}
              className="version-website"
            >
              poly-hub.netlify.app
            </button>
            {appVersion.buildDate && (
              <span className="version-date">Build: {appVersion.buildDate}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
