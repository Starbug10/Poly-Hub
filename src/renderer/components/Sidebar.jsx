import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ profile }) {
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
        <NavLink
          to="/discovery"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-indicator" />
          <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
          <span className="sidebar-link-text">DISCOVER</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-indicator" />
          <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
          </svg>
          <span className="sidebar-link-text">SETTINGS</span>
        </NavLink>
      </nav>

      <div className="sidebar-profile">
        <div className="sidebar-profile-divider" />
        <div className="sidebar-profile-icon">
          {profile?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="sidebar-profile-content">
          <div className="sidebar-profile-label">PROFILE</div>
          <div className="sidebar-profile-name">{profile?.name || 'Unknown'}</div>
          <div className="sidebar-profile-ip">{profile?.ip || '—'}</div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
