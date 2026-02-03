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
          <span>GALLERY</span>
        </NavLink>
        <NavLink
          to="/discovery"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-indicator" />
          <span>DISCOVER</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-indicator" />
          <span>SETTINGS</span>
        </NavLink>
      </nav>

      <div className="sidebar-profile">
        <div className="sidebar-profile-divider" />
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
