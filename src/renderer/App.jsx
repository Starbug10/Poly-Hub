import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Onboarding from './pages/Onboarding';
import Gallery from './pages/Gallery';
import Discovery from './pages/Discovery';
import Settings from './pages/Settings';
import './styles/app.css';

function App() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tailscaleStatus, setTailscaleStatus] = useState(null);

  useEffect(() => {
    async function init() {
      // Check Tailscale status
      const status = await window.electronAPI.getTailscaleStatus();
      setTailscaleStatus(status);

      // Check if profile exists
      const existingProfile = await window.electronAPI.getProfile();
      setProfile(existingProfile);

      // Apply saved theme
      const settings = await window.electronAPI.getSettings();
      if (settings?.theme) {
        document.documentElement.setAttribute('data-theme', settings.theme);
      }

      setLoading(false);
    }
    init();
  }, []);

  const handleProfileComplete = (newProfile) => {
    setProfile(newProfile);
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

  // Show onboarding if no profile or Tailscale not ready
  const needsOnboarding = !profile || !tailscaleStatus?.running;

  return (
    <div className="app">
      <TitleBar />
      <div className="app-container">
        {needsOnboarding ? (
          <Onboarding
            tailscaleStatus={tailscaleStatus}
            onComplete={handleProfileComplete}
          />
        ) : (
          <>
            <Sidebar profile={profile} />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Navigate to="/gallery" replace />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/discovery" element={<Discovery profile={profile} />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
