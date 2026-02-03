import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Gallery.css';

function Gallery() {
  const [peers, setPeers] = useState([]);
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [settings, setSettings] = useState({ syncFolder: null });
  const [showPeerTooltip, setShowPeerTooltip] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    loadData();

    // Listen for incoming files
    window.electronAPI.onFileReceived((file) => {
      setFiles((prev) => {
        if (prev.some((f) => f.id === file.id)) return prev;
        return [...prev, file];
      });
    });

    // Listen for file deletions
    window.electronAPI.onFileDeleted((fileId) => {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    });

    // Listen for peer updates
    window.electronAPI.onPeerUpdated((updatedPeer) => {
      setPeers((prev) => 
        prev.map((p) => p.ip === updatedPeer.ip ? { ...p, name: updatedPeer.name } : p)
      );
    });

    return () => {
      window.electronAPI.removeAllListeners('file:received');
      window.electronAPI.removeAllListeners('file:deleted');
      window.electronAPI.removeAllListeners('peer:updated');
    };
  }, []);

  async function loadData() {
    const peerList = await window.electronAPI.getPeers();
    setPeers(peerList);

    const sharedFiles = await window.electronAPI.getSharedFiles();
    setFiles(sharedFiles);

    const currentSettings = await window.electronAPI.getSettings();
    setSettings(currentSettings);
  }

  // Use counter to prevent flickering when dragging over child elements
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    await shareFiles(droppedFiles.map((file) => ({
      path: file.path,
      name: file.name,
      size: file.size,
      type: file.name.split('.').pop() || 'file',
    })));
  }, []);

  const handleSelectFiles = async () => {
    const selectedFiles = await window.electronAPI.selectFiles();
    if (selectedFiles.length > 0) {
      await shareFiles(selectedFiles);
    }
  };

  const shareFiles = async (filesToShare) => {
    setSharing(true);
    try {
      const sharedFiles = await window.electronAPI.shareFiles(filesToShare);
      setFiles((prev) => [...prev, ...sharedFiles]);
    } catch (err) {
      console.error('Failed to share files:', err);
    }
    setSharing(false);
  };

  const handleDeleteFile = async (e, fileId) => {
    e.stopPropagation();
    try {
      await window.electronAPI.deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const handleOpenFile = async (file) => {
    try {
      await window.electronAPI.openFile(file.path);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleSelectFolder = async () => {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      await shareFiles([folder]);
    }
  };

  const hasPeers = peers.length > 0;
  const hasSyncFolder = !!settings.syncFolder;

  return (
    <div 
      className="gallery"
      onDragEnter={hasPeers ? handleDragEnter : undefined}
      onDragOver={hasPeers ? handleDragOver : undefined}
      onDragLeave={hasPeers ? handleDragLeave : undefined}
      onDrop={hasPeers ? handleDrop : undefined}
    >
      <header className="gallery-header">
        <div className="gallery-header-left">
          <h1 className="gallery-title">GALLERY</h1>
          <span className="gallery-subtitle">Shared files between you and your peers</span>
        </div>
        <div className="gallery-header-right">
          {hasPeers && (
            <>
              <button 
                className="gallery-folder-btn" 
                onClick={handleSelectFolder}
                title="Select folder to share"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <div 
                className="gallery-peer-count"
                onMouseEnter={() => setShowPeerTooltip(true)}
                onMouseLeave={() => setShowPeerTooltip(false)}
              >
                <span className="peer-count-number">{peers.length}</span>
                <span className="peer-count-label">PEER{peers.length !== 1 ? 'S' : ''}</span>
                {showPeerTooltip && (
                  <div className="peer-tooltip">
                    <div className="peer-tooltip-title">CONNECTED PEERS</div>
                    {peers.map((peer) => (
                      <div key={peer.ip} className="peer-tooltip-item">
                        <span className="peer-tooltip-name">{peer.name}</span>
                        <span className="peer-tooltip-ip">{peer.ip}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Sync folder warning */}
      {hasPeers && !hasSyncFolder && (
        <div className="gallery-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>No sync folder configured. Go to <strong>Settings</strong> to set up a folder for shared files.</span>
        </div>
      )}

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
              <div 
                key={file.id} 
                className="file-card"
                onClick={() => handleOpenFile(file)}
              >
                <button 
                  className="file-delete-btn" 
                  onClick={(e) => handleDeleteFile(e, file.id)}
                  title="Delete file"
                >
                  ×
                </button>
                <div className="file-thumbnail">
                  {isImageFile(file.type) && file.path ? (
                    <img 
                      src={`polyhub-file://${file.path.replace(/\\/g, '/')}`}
                      alt={file.name} 
                      className="file-thumbnail-img"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    className="file-thumbnail-fallback" 
                    style={{ display: isImageFile(file.type) && file.path ? 'none' : 'flex' }}
                  >
                    {getFileIcon(file.type)}
                  </div>
                </div>
                <div className="file-info">
                  <span className="file-name" title={file.name}>{file.name}</span>
                  <div className="file-meta">
                    <span className="file-type">{(file.type || 'FILE').toUpperCase()}</span>
                    <span className="file-meta-dot">•</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drop overlay - covers entire gallery when dragging */}
      {isDragging && hasPeers && (
        <div className="gallery-drop-overlay">
          <div className="drop-overlay-content">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="drop-overlay-icon">
              <path d="M32 8V56M8 32H56" stroke="currentColor" strokeWidth="4" strokeLinecap="square" />
            </svg>
            <span className="drop-overlay-text">
              {sharing ? 'SHARING...' : 'DROP TO SHARE'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function isImageFile(type) {
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
  return imageTypes.includes(type?.toLowerCase());
}

function getFileIcon(type) {
  const icons = {
    // Folders
    folder: '📁',
    
    // Archives
    zip: '📦',
    rar: '📦',
    '7z': '📦',
    tar: '📦',
    gz: '📦',
    bz2: '📦',
    
    // Documents
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    txt: '📝',
    rtf: '📝',
    odt: '📝',
    
    // Spreadsheets
    xls: '📊',
    xlsx: '📊',
    csv: '📊',
    ods: '📊',
    
    // Presentations
    ppt: '📽',
    pptx: '📽',
    odp: '📽',
    
    // Images
    jpg: '🖼',
    jpeg: '🖼',
    png: '🖼',
    gif: '🖼',
    bmp: '🖼',
    svg: '🖼',
    webp: '🖼',
    ico: '🖼',
    tiff: '🖼',
    tif: '🖼',
    heic: '🖼',
    heif: '🖼',
    
    // Videos
    mp4: '🎬',
    mkv: '🎬',
    avi: '🎬',
    mov: '🎬',
    wmv: '🎬',
    flv: '🎬',
    webm: '🎬',
    m4v: '🎬',
    
    // Audio
    mp3: '🎵',
    wav: '🎵',
    flac: '🎵',
    aac: '🎵',
    ogg: '🎵',
    wma: '🎵',
    m4a: '🎵',
    opus: '🎵',
    
    // Code
    js: '💻',
    jsx: '💻',
    ts: '💻',
    tsx: '💻',
    py: '💻',
    java: '💻',
    cpp: '💻',
    c: '💻',
    cs: '💻',
    php: '💻',
    rb: '💻',
    go: '💻',
    rs: '💻',
    html: '💻',
    css: '💻',
    json: '💻',
    xml: '💻',
    
    // Executables
    exe: '⚙',
    msi: '⚙',
    dmg: '⚙',
    app: '⚙',
    deb: '⚙',
    rpm: '⚙',
  };
  return icons[type?.toLowerCase()] || '▢';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default Gallery;
