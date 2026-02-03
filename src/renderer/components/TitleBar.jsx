import React from 'react';
import './TitleBar.css';

function TitleBar() {
  const handleMinimize = () => window.electronAPI.minimize();
  const handleMaximize = () => window.electronAPI.maximize();
  const handleClose = () => window.electronAPI.close();

  return (
    <header className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-title">POLYHUB</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect y="5" width="12" height="2" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={handleMaximize}
          aria-label="Maximize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={handleClose}
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export default TitleBar;
