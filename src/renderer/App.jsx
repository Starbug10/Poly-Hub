import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Onboarding from './pages/Onboarding';
import Gallery from './pages/Gallery';
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
                <Route path="/settings" element={<Settings profile={profile} />} />
              </Routes>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
