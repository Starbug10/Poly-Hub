import React, { useState, useEffect } from 'react';
import './Onboarding.css';

function Onboarding({ tailscaleStatus, existingProfile, onComplete }) {
  const [step, setStep] = useState('checking'); // checking, profile
  const [tailscaleIP, setTailscaleIP] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Load existing profile name if available
    async function loadExistingProfile() {
      const profile = await window.electronAPI.getProfile();
      if (profile?.name) {
        setName(profile.name);
      }
    }
    loadExistingProfile();
  }, []);

  useEffect(() => {
    async function checkTailscale() {
      if (tailscaleStatus?.running) {
        const ip = await window.electronAPI.getTailscaleIP();
        setTailscaleIP(ip);
        setStep('profile');
      } else {
        setStep('checking');
      }
    }
    checkTailscale();
  }, [tailscaleStatus]);

  const handleRetryTailscale = async () => {
    setRetrying(true);
    const status = await window.electronAPI.getTailscaleStatus();
    if (status?.running) {
      const ip = await window.electronAPI.getTailscaleIP();
      setTailscaleIP(ip);
      setStep('profile');
    }
    setRetrying(false);
  };

  const handleSaveProfile = async () => {
    if (!name.trim() || !tailscaleIP) return;

    setSaving(true);
    const profile = await window.electronAPI.saveProfile({
      name: name.trim(),
      ip: tailscaleIP,
    });
    setSaving(false);
    onComplete(profile);
  };

  return (
    <div className="onboarding">
      <div className="onboarding-container">
        {step === 'checking' && (
          <div className="onboarding-step">
            <div className="onboarding-header">
              <span className="onboarding-step-label">STEP 01</span>
              <h1 className="onboarding-title">TAILSCALE CHECK</h1>
            </div>

            <div className="onboarding-content">
              <div className="status-card status-error">
                <div className="status-icon">✕</div>
                <div className="status-text">
                  <div className="status-title">Tailscale not detected</div>
                  <div className="status-subtitle">
                    Make sure Tailscale is installed and running
                  </div>
                </div>
              </div>

              <div className="onboarding-info">
                <p>Poly-Hub requires Tailscale for secure P2P connections.</p>
                <ol>
                  <li>Install Tailscale from <span className="text-accent">tailscale.com</span></li>
                  <li>Sign in with Google, Microsoft, or GitHub</li>
                  <li>Make sure Tailscale is running in your system tray</li>
                </ol>
              </div>

              <button className="primary" onClick={handleRetryTailscale} disabled={retrying}>
                {retrying ? 'CHECKING...' : 'RETRY DETECTION'}
              </button>
            </div>
          </div>
        )}

        {step === 'profile' && (
          <div className="onboarding-step">
            <div className="onboarding-header">
              <span className="onboarding-step-label">STEP 02</span>
              <h1 className="onboarding-title">CREATE PROFILE</h1>
            </div>

            <div className="onboarding-content">
              <div className="status-card status-success">
                <div className="status-icon">✓</div>
                <div className="status-text">
                  <div className="status-title">Tailscale detected</div>
                  <div className="status-subtitle">IP: {tailscaleIP}</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">YOUR TAILSCALE IP</label>
                <input
                  type="text"
                  value={tailscaleIP || ''}
                  disabled
                  className="input-readonly"
                />
                <span className="form-hint">Auto-detected from Tailscale</span>
              </div>

              <div className="form-group">
                <label className="form-label">YOUR NAME</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                />
                <span className="form-hint">This will be visible to your peers</span>
              </div>

              <button
                className="primary"
                onClick={handleSaveProfile}
                disabled={!name.trim() || saving}
              >
                {saving ? 'SAVING...' : 'SAVE PROFILE'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="onboarding-decoration">
        <span className="decoration-text">POLY</span>
        <span className="decoration-text decoration-accent">HUB</span>
      </div>
    </div>
  );
}

export default Onboarding;
