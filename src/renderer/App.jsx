import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Onboarding from './pages/Onboarding';
import Gallery from './pages/Gallery';
import Transfers from './pages/Transfers';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import NotificationManager from './components/NotificationManager';
import './styles/app.css';

function App() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tailscaleStatus, setTailscaleStatus] = useState(null);
  const [peerStatus, setPeerStatus] = useState({}); // Global peer status

  // Function to check all peer statuses
  const checkAllPeersStatus = async () => {
    try {
      const statusResults = await window.electronAPI.checkAllPeersStatus();
      const statusMap = {};
      statusResults.forEach(result => {
        statusMap[result.ip] = result.online;
      });
      setPeerStatus(statusMap);
      return statusMap;
    } catch (err) {
      console.error('Failed to check peer status:', err);
      return {};
    }
  };

  useEffect(() => {
    // Listen for tray navigation events
    window.electronAPI.onNavigate((path) => {
      navigate(path);
    });

    async function init() {
      // Check Tailscale status
      const status = await window.electronAPI.getTailscaleStatus();
      setTailscaleStatus(status);

      // Check if profile exists
      const existingProfile = await window.electronAPI.getProfile();
      setProfile(existingProfile);

      // Check peer status if profile exists
      if (existingProfile) {
        await checkAllPeersStatus();
      }

      // Apply saved theme
      const settings = await window.electronAPI.getSettings();
      if (settings?.theme) {
        document.documentElement.setAttribute('data-theme', settings.theme);
      }

      // Apply rounded corners
      if (settings?.roundedCorners) {
        document.documentElement.classList.add('rounded-corners');
      }

      // Apply compact sidebar
      if (settings?.compactSidebar) {
        document.documentElement.classList.add('compact-sidebar');
      }

      // Apply accent color
      if (settings?.accentColor) {
        document.documentElement.style.setProperty('--color-accent', settings.accentColor);
        const r = parseInt(settings.accentColor.slice(1, 3), 16);
        const g = parseInt(settings.accentColor.slice(3, 5), 16);
        const b = parseInt(settings.accentColor.slice(5, 7), 16);
        const dimmed = `#${Math.floor(r * 0.8).toString(16).padStart(2, '0')}${Math.floor(g * 0.8).toString(16).padStart(2, '0')}${Math.floor(b * 0.8).toString(16).padStart(2, '0')}`;
        document.documentElement.style.setProperty('--color-accent-dim', dimmed);
      }

      setLoading(false);
    }
    init();

    return () => {
      window.electronAPI.removeAllListeners('navigate');
    };
  }, [navigate]);

  const handleProfileComplete = (newProfile) => {
    setProfile(newProfile);
    // Also update tailscale status after profile is set
    window.electronAPI.getTailscaleStatus().then(setTailscaleStatus);
  };

  // Refresh Tailscale status periodically when offline
  useEffect(() => {
    if (!tailscaleStatus?.running && profile) {
      const interval = setInterval(async () => {
        const status = await window.electronAPI.getTailscaleStatus();
        if (status?.running) {
          setTailscaleStatus(status);
          // Update profile IP if it changed
          const newIP = await window.electronAPI.getTailscaleIP();
          if (newIP && newIP !== profile.ip) {
            const updatedProfile = await window.electronAPI.updateProfile({ ip: newIP });
            setProfile(updatedProfile);
          }
        }
      }, 5000); // Check every 5 seconds
      return () => clearInterval(interval);
    }
  }, [tailscaleStatus?.running, profile]);

  // Check peer status periodically
  useEffect(() => {
    if (!profile) return;

    // Check every 10 seconds
    const interval = setInterval(checkAllPeersStatus, 10000);
    return () => clearInterval(interval);
  }, [profile]);

  const handleProfileUpdate = (updatedProfile) => {
    setProfile(updatedProfile);
  };

  if (loading) {
    return (
      <div className="app">
        <TitleBar />
        <div className="app-loading">
          <span className="loading-text">INITIALIZING</span>
          <span className="loading-dots">...</span>
        </div>
      </div>
    );
  }

  // Show onboarding only if no profile exists (new user)
  // If profile exists but Tailscale is offline, show warning in the main app
  const needsOnboarding = !profile;
  const tailscaleOffline = profile && !tailscaleStatus?.running;

  return (
    <div className="app">
      <TitleBar />
      <div className="app-container">
        {needsOnboarding ? (
          <Onboarding
            tailscaleStatus={tailscaleStatus}
            existingProfile={null}
            onComplete={handleProfileComplete}
          />
        ) : (
          <>
            <Sidebar profile={profile} tailscaleOffline={tailscaleOffline} />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Navigate to="/gallery" replace />} />
                <Route path="/gallery" element={<Gallery tailscaleOffline={tailscaleOffline} />} />
                <Route path="/transfers" element={<Transfers />} />
                <Route path="/statistics" element={<Statistics />} />
                <Route
                  path="/settings"
                  element={
                    <Settings
                      profile={profile}
                      onProfileUpdate={handleProfileUpdate}
                      peerStatus={peerStatus}
                      onPeerStatusUpdate={setPeerStatus}
                      onRefreshPeerStatus={checkAllPeersStatus}
                    />
                  }
                />
              </Routes>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
