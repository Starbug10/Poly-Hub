import React, { useState, useEffect } from 'react';
import './Settings.css';

function Settings() {
  const [settings, setSettings] = useState({
    syncFolder: null,
    maxFileSize: '',
    notifications: true,
    theme: 'dark',
  });
  const [profile, setProfile] = useState(null);
  const [peers, setPeers] = useState([]);
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  async function loadData() {
    const currentSettings = await window.electronAPI.getSettings();
    // Ensure maxFileSize is always a string for controlled input
    setSettings({
      ...currentSettings,
      maxFileSize: currentSettings.maxFileSize != null ? String(currentSettings.maxFileSize) : ''
    });

    // Apply saved theme on load
    document.documentElement.setAttribute('data-theme', currentSettings.theme || 'dark');

    const currentProfile = await window.electronAPI.getProfile();
    setProfile(currentProfile);
    if (currentProfile) {
      setNewName(currentProfile.name);
    }

    const currentPeers = await window.electronAPI.getPeers();
    setPeers(currentPeers);
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

        {/* Connected Peers Section */}
        <section className="settings-section">
          <h2 className="section-title">CONNECTED PEERS ({peers.length})</h2>
          <div className="settings-card">
            {peers.length === 0 ? (
              <div className="setting-row">
                <span className="value-text text-muted">No peers connected</span>
              </div>
            ) : (
              peers.map((peer) => (
                <div key={peer.ip} className="setting-row">
                  <div className="setting-label">
                    <span className="label-title">{peer.name}</span>
                    <span className="label-description">{peer.ip}</span>
                  </div>
                  <div className="setting-value">
                    <span className="peer-status">Connected</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Save Button */}
        <div className="settings-actions">
          <button onClick={handleSave} className="primary">
            {saved ? 'SAVED!' : 'SAVE SETTINGS'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
