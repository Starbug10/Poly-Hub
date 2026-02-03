import React, { useState, useEffect } from 'react';
import './Gallery.css';

function Gallery() {
  const [peers, setPeers] = useState([]);
  const [files, setFiles] = useState([]);

  useEffect(() => {
    async function loadData() {
      const peerList = await window.electronAPI.getPeers();
      setPeers(peerList);
    }
    loadData();
  }, []);

  const hasPeers = peers.length > 0;

  return (
    <div className="gallery">
      <header className="gallery-header">
        <div className="gallery-header-left">
          <h1 className="gallery-title">GALLERY</h1>
          <span className="gallery-subtitle">Shared files between you and your peers</span>
        </div>
        <div className="gallery-header-right">
          {hasPeers && (
            <div className="gallery-peer-count">
              <span className="peer-count-number">{peers.length}</span>
              <span className="peer-count-label">PEER{peers.length !== 1 ? 'S' : ''}</span>
            </div>
          )}
        </div>
      </header>

      <div className="gallery-content">
        {!hasPeers ? (
          <div className="gallery-empty">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path
                  d="M24 4L44 14V34L24 44L4 34V14L24 4Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <path
                  d="M24 24V44M24 24L4 14M24 24L44 14"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <h2 className="empty-title">NO PEERS CONNECTED</h2>
            <p className="empty-text">
              Go to the <span className="text-accent">Discover</span> page to connect with another user
            </p>
          </div>
        ) : files.length === 0 ? (
          <div className="gallery-empty">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="10" width="36" height="32" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M6 18H42" stroke="currentColor" strokeWidth="2" />
                <path d="M14 6V10" stroke="currentColor" strokeWidth="2" />
                <path d="M34 6V10" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <h2 className="empty-title">NO FILES YET</h2>
            <p className="empty-text">
              Drag and drop files here to share with your peers
            </p>
          </div>
        ) : (
          <div className="gallery-grid">
            {files.map((file) => (
              <div key={file.id} className="file-card">
                <div className="file-icon">{getFileIcon(file.type)}</div>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">{formatFileSize(file.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasPeers && (
        <div className="gallery-drop-zone">
          <div className="drop-zone-inner">
            <span className="drop-zone-text">DROP FILES HERE TO SHARE</span>
          </div>
        </div>
      )}
    </div>
  );
}

function getFileIcon(type) {
  // Placeholder icons
  return '▢';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default Gallery;
