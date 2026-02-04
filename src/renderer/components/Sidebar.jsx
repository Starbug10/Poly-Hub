import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ profile, tailscaleOffline }) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <NavLink
          to="/gallery"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-indicator" />
          <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span className="sidebar-link-text">GALLERY</span>
        </NavLink>
      </nav>

      <div className="sidebar-bottom">
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-indicator" />
          <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          <span className="sidebar-link-text">SETTINGS</span>
        </NavLink>

        <div className="sidebar-profile">
          <div className="sidebar-profile-divider" />
          <div className={`sidebar-profile-icon ${tailscaleOffline ? 'offline' : ''}`}>
            {profile?.name?.[0]?.toUpperCase() || 'U'}
            <span className={`status-indicator ${tailscaleOffline ? 'offline' : ''}`}></span>
          </div>
          <div className="sidebar-profile-content">
            <div className="sidebar-profile-header">
              <div className="sidebar-profile-label">PROFILE</div>
              <div className={`sidebar-profile-status ${tailscaleOffline ? 'offline' : 'online'}`}>
                <span className="status-dot"></span>
                <span className="status-text">{tailscaleOffline ? 'OFFLINE' : 'ONLINE'}</span>
              </div>
            </div>
            <div className="sidebar-profile-name">{profile?.name || 'Unknown'}</div>
            <div className="sidebar-profile-ip">{profile?.ip || '—'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
