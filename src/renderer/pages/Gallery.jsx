import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './Gallery.css';

function Gallery({ tailscaleOffline: propTailscaleOffline }) {
  const [peers, setPeers] = useState([]);
  const [peerStatus, setPeerStatus] = useState({}); // Track peer online/offline status
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [settings, setSettings] = useState({ syncFolder: null });
  const [showPeerTooltip, setShowPeerTooltip] = useState(false);
  const [fileProgress, setFileProgress] = useState({}); // Track download progress
  const [deletingFiles, setDeletingFiles] = useState(new Set()); // Track files being deleted
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // date, name, size, type, sender
  const [filterType, setFilterType] = useState('all'); // all, images, videos, documents, etc.
  const [filterSender, setFilterSender] = useState('all'); // all or specific peer name
  const [tailscaleOffline, setTailscaleOffline] = useState(propTailscaleOffline || false);
  const [noPeersOnline, setNoPeersOnline] = useState(false); // Show warning when no peers online
  const [pendingAction, setPendingAction] = useState(null); // Store action to retry
  const dragCounterRef = useRef(0);
  const fileProgressRef = useRef({}); // Ref to track progress without causing re-renders
  const progressUpdateTimerRef = useRef(null); // Throttle progress updates

  // Sync with prop
  useEffect(() => {
    if (propTailscaleOffline !== undefined) {
      setTailscaleOffline(propTailscaleOffline);
    }
  }, [propTailscaleOffline]);

  useEffect(() => {
    loadData();

    // Listen for incoming files
    window.electronAPI.onFileReceived((file) => {
      console.log('[Gallery] File received from peer:', file.name, file.id);
      setFiles((prev) => {
        if (prev.some((f) => f.id === file.id)) return prev;
        return [...prev, file];
      });
      // Clear progress for this file
      setFileProgress((prev) => {
        const updated = { ...prev };
        delete updated[file.id];
        return updated;
      });
    });

    // Listen for file deletions
    window.electronAPI.onFileDeleted((fileId) => {
      console.log('[Gallery] File deleted by peer:', fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setDeletingFiles((prev) => {
        const updated = new Set(prev);
        updated.delete(fileId);
        return updated;
      });
    });

    // Listen for file progress - throttled to reduce re-renders during drag-drop
    window.electronAPI.onFileProgress((progress) => {
      console.log('[Gallery] File progress:', progress.fileName, progress.progress + '%', progress.direction || 'receiving');
      
      // Store in ref immediately (no re-render)
      fileProgressRef.current = {
        ...fileProgressRef.current,
        [progress.fileId]: progress,
      };
      
      if (progress.progress >= 100) {
        // Clear progress after completion with a small delay for visual feedback
        setTimeout(() => {
          delete fileProgressRef.current[progress.fileId];
          setFileProgress((prev) => {
            const updated = { ...prev };
            delete updated[progress.fileId];
            return updated;
          });
        }, 1000);
        // Immediately update state for completion
        setFileProgress((prev) => ({
          ...prev,
          [progress.fileId]: progress,
        }));
      } else {
        // Throttle state updates to every 500ms to prevent lag during drag-drop
        if (!progressUpdateTimerRef.current) {
          progressUpdateTimerRef.current = setTimeout(() => {
            setFileProgress({ ...fileProgressRef.current });
            progressUpdateTimerRef.current = null;
          }, 500);
        }
      }
    });

    // Listen for peer updates
    window.electronAPI.onPeerUpdated((updatedPeer) => {
      console.log('[Gallery] Peer updated:', updatedPeer.name);
      setPeers((prev) => 
        prev.map((p) => p.ip === updatedPeer.ip ? { 
          ...p, 
          name: updatedPeer.name,
          profilePicture: updatedPeer.profilePicture 
        } : p)
      );
    });

    // Listen for auto-added files from folder watcher
    window.electronAPI.onFileAutoAdded((file) => {
      console.log('[Gallery] File auto-added from folder:', file.name);
      setFiles((prev) => {
        // Check if file already exists
        if (prev.some(f => f.id === file.id || f.path === file.path)) {
          return prev;
        }
        return [file, ...prev];
      });
    });

    return () => {
      window.electronAPI.removeAllListeners('file:received');
      window.electronAPI.removeAllListeners('file:deleted');
      window.electronAPI.removeAllListeners('file:progress');
      window.electronAPI.removeAllListeners('peer:updated');
      window.electronAPI.removeAllListeners('file:auto-added');
      // Clear the progress update timer
      if (progressUpdateTimerRef.current) {
        clearTimeout(progressUpdateTimerRef.current);
        progressUpdateTimerRef.current = null;
      }
    };
  }, []);

  async function loadData() {
    const peerList = await window.electronAPI.getPeers();
    setPeers(peerList);

    const sharedFiles = await window.electronAPI.getSharedFiles();
    setFiles(sharedFiles);

    const currentSettings = await window.electronAPI.getSettings();
    setSettings(currentSettings);
    
    // Check Tailscale status on load
    const status = await window.electronAPI.getTailscaleStatus();
    if (!status?.running) {
      setTailscaleOffline(true);
    }
  }

  // Check Tailscale status before file operations
  const checkTailscaleStatus = async () => {
    const status = await window.electronAPI.getTailscaleStatus();
    return status?.running === true;
  };

  // Check peer online status
  const checkPeersStatus = useCallback(async () => {
    try {
      const statusResults = await window.electronAPI.checkAllPeersStatus();
      // Convert array to map like Settings does
      const statusMap = {};
      statusResults.forEach(result => {
        statusMap[result.ip] = result.online;
      });
      setPeerStatus(statusMap);
      
      // Check if any peers are online
      const onlineCount = Object.values(statusMap).filter(isOnline => isOnline).length;
      return onlineCount > 0;
    } catch (err) {
      console.error('[Gallery] Error checking peer status:', err);
      return false;
    }
  }, []);

  // Check if any peers are online before sharing
  const hasOnlinePeers = useCallback(() => {
    const onlineCount = Object.values(peerStatus).filter(isOnline => isOnline).length;
    return onlineCount > 0;
  }, [peerStatus]);

  // Periodically check peer status
  useEffect(() => {
    if (!tailscaleOffline && peers.length > 0) {
      checkPeersStatus();
      const interval = setInterval(checkPeersStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [tailscaleOffline, peers, checkPeersStatus]);

  const handleRetryTailscale = async () => {
    const isOnline = await checkTailscaleStatus();
    if (isOnline) {
      setTailscaleOffline(false);
      // Execute pending action if any
      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        action();
      }
    }
  };

  const dismissTailscaleWarning = () => {
    setTailscaleOffline(false);
    setPendingAction(null);
  };

  const handleRetryPeers = async () => {
    const hasPeersOnline = await checkPeersStatus();
    if (hasPeersOnline) {
      setNoPeersOnline(false);
      // Execute pending action if any
      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        action();
      }
    }
  };

  const dismissNoPeersWarning = () => {
    setNoPeersOnline(false);
    setPendingAction(null);
  };

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

    const droppedItems = Array.from(e.dataTransfer.files);
    console.log('[Gallery] Items dropped:', droppedItems.length);
    if (droppedItems.length === 0) return;

    // Check Tailscale status before proceeding
    const isOnline = await checkTailscaleStatus();
    if (!isOnline) {
      // Store the action to retry later
      setPendingAction(() => async () => {
        await processDroppedItems(droppedItems);
      });
      setTailscaleOffline(true);
      return;
    }

    // Check if any peers are online
    const hasPeersOnline = await checkPeersStatus();
    if (!hasPeersOnline) {
      // Store the action to retry later
      setPendingAction(() => async () => {
        await processDroppedItems(droppedItems);
      });
      setNoPeersOnline(true);
      return;
    }

    await processDroppedItems(droppedItems);
  }, [checkPeersStatus]);

  const processDroppedItems = async (droppedItems) => {
    // Separate folders from files
    const folders = [];
    const filesToShare = [];

    for (const item of droppedItems) {
      console.log('[Gallery] Dropped item:', item.name, item.type, item.size, item.path);
      // If size is 0 and no type, it's likely a folder (or we can check if path exists as directory)
      // The main process will validate this
      if (item.size === 0 && !item.type) {
        folders.push(item.path);
      } else {
        filesToShare.push({
          path: item.path,
          name: item.name,
          size: item.size,
          type: item.name.split('.').pop() || 'file',
        });
      }
    }

    // Share folders first
    for (const folderPath of folders) {
      console.log('[Gallery] Sharing folder:', folderPath);
      setSharing(true);
      try {
        const sharedFiles = await window.electronAPI.shareFolder(folderPath);
        console.log('[Gallery] Folder shared, files:', sharedFiles?.length || 0);
        if (sharedFiles && sharedFiles.length > 0) {
          setFiles((prev) => [...prev, ...sharedFiles]);
        }
      } catch (err) {
        console.error('[Gallery] ERROR: Failed to share folder:', err);
      }
      setSharing(false);
    }

    // Then share individual files
    if (filesToShare.length > 0) {
      await shareFiles(filesToShare);
    }
  };

  const handleSelectFiles = async () => {
    // Check Tailscale status before proceeding
    const isOnline = await checkTailscaleStatus();
    if (!isOnline) {
      setPendingAction(() => handleSelectFiles);
      setTailscaleOffline(true);
      return;
    }

    // Check if any peers are online
    const hasPeersOnline = await checkPeersStatus();
    if (!hasPeersOnline) {
      setPendingAction(() => handleSelectFiles);
      setNoPeersOnline(true);
      return;
    }
    
    console.log('[Gallery] Opening file selection dialog');
    const selectedFiles = await window.electronAPI.selectFiles();
    console.log('[Gallery] Files selected:', selectedFiles.length);
    if (selectedFiles.length > 0) {
      selectedFiles.forEach(file => {
        console.log('[Gallery] Selected:', file.name, file.size, file.type);
      });
      await shareFiles(selectedFiles);
    }
  };

  const shareFiles = async (filesToShare) => {
    console.log('[Gallery] Starting file share for', filesToShare.length, 'file(s)');
    setSharing(true);
    try {
      const sharedFiles = await window.electronAPI.shareFiles(filesToShare);
      console.log('[Gallery] Successfully shared', sharedFiles.length, 'file(s)');
      sharedFiles.forEach(file => {
        console.log('[Gallery] Shared:', file.name, file.id);
      });
      // Only add files that aren't already in the list (they may have been auto-added)
      setFiles((prev) => {
        const newFiles = sharedFiles.filter(file => 
          !prev.some(f => f.id === file.id || f.path === file.path)
        );
        return [...prev, ...newFiles];
      });
    } catch (err) {
      console.error('[Gallery] ERROR: Failed to share files:', err);
    }
    setSharing(false);
  };

  const handleDeleteFile = async (e, fileId) => {
    e.stopPropagation();
    console.log('[Gallery] Deleting file:', fileId);
    setDeletingFiles((prev) => new Set(prev).add(fileId));
    try {
      await window.electronAPI.deleteFile(fileId);
      console.log('[Gallery] File deleted successfully:', fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error('[Gallery] ERROR: Failed to delete file:', err);
    } finally {
      setDeletingFiles((prev) => {
        const updated = new Set(prev);
        updated.delete(fileId);
        return updated;
      });
    }
  };

  const handleOpenFile = async (file) => {
    console.log('[Gallery] Opening file:', file.name);
    try {
      await window.electronAPI.openFile(file.path);
    } catch (err) {
      console.error('[Gallery] ERROR: Failed to open file:', err);
    }
  };

  const handleSelectFolder = async () => {
    // Check Tailscale status before proceeding
    const isOnline = await checkTailscaleStatus();
    if (!isOnline) {
      setPendingAction(() => handleSelectFolder);
      setTailscaleOffline(true);
      return;
    }

    // Check if any peers are online
    const hasPeersOnline = await checkPeersStatus();
    if (!hasPeersOnline) {
      setPendingAction(() => handleSelectFolder);
      setNoPeersOnline(true);
      return;
    }
    
    console.log('[Gallery] Opening folder selection dialog');
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      console.log('[Gallery] Folder selected:', folder.name, 'Files:', folder.files?.length || 0);
      if (folder.files && folder.files.length > 0) {
        folder.files.forEach(file => {
          console.log('[Gallery] File in folder:', file.name, file.size, file.type);
        });
        await shareFiles(folder.files);
      } else {
        console.warn('[Gallery] No files found in selected folder');
      }
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete all files? This action cannot be undone.')) {
      return;
    }
    console.log('[Gallery] Clearing all files:', files.length);
    const fileIds = files.map(f => f.id);
    for (const fileId of fileIds) {
      setDeletingFiles((prev) => new Set(prev).add(fileId));
      try {
        await window.electronAPI.deleteFile(fileId);
        console.log('[Gallery] Deleted file:', fileId);
      } catch (err) {
        console.error('[Gallery] ERROR: Failed to delete file:', err);
      }
    }
    setFiles([]);
    setDeletingFiles(new Set());
    
    // Reload files from sync folder to ensure gallery is in sync
    const sharedFiles = await window.electronAPI.getSharedFiles();
    setFiles(sharedFiles);
  };

  // Filter and sort files
  const getFilteredAndSortedFiles = () => {
    let filtered = [...files];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
      const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'];
      const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'];
      const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
      const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];

      filtered = filtered.filter(file => {
        const ext = file.type?.toLowerCase();
        switch (filterType) {
          case 'images': return imageExts.includes(ext);
          case 'videos': return videoExts.includes(ext);
          case 'audio': return audioExts.includes(ext);
          case 'documents': return docExts.includes(ext);
          case 'archives': return archiveExts.includes(ext);
          default: return true;
        }
      });
    }

    // Sender filter
    if (filterSender !== 'all') {
      if (filterSender === 'myself') {
        filtered = filtered.filter(file => file.sharedBy === 'You' || !file.from);
      } else {
        filtered = filtered.filter(file => file.from?.name === filterSender || file.sharedBy === filterSender);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return (b.size || 0) - (a.size || 0);
        case 'type':
          return (a.type || '').localeCompare(b.type || '');
        case 'sender':
          return (a.from?.name || a.sharedBy || '').localeCompare(b.from?.name || b.sharedBy || '');
        case 'date':
        default:
          return (b.sharedAt || b.receivedAt || 0) - (a.sharedAt || a.receivedAt || 0);
      }
    });

    return filtered;
  };

  // Get list of unique senders including "Myself"
  const getUniqueSenders = () => {
    const senders = new Set();
    let hasSelfFiles = false;
    
    files.forEach(file => {
      const sender = file.from?.name || file.sharedBy;
      if (sender === 'You' || !file.from) {
        hasSelfFiles = true;
      } else if (sender) {
        senders.add(sender);
      }
    });
    
    const result = [];
    if (hasSelfFiles) {
      result.push('myself');
    }
    result.push(...Array.from(senders).sort());
    return result;
  };

  const hasPeers = peers.length > 0;
  const hasSyncFolder = !!settings.syncFolder;
  const filteredFiles = getFilteredAndSortedFiles();
  const uniqueSenders = getUniqueSenders();

  // Get files that are currently being received (have progress and not sending)
  const receivingFiles = Object.entries(fileProgress).filter(
    ([id, progress]) => progress.progress < 100 && progress.direction !== 'sending'
  );

  return (
    <div 
      className="gallery"
      onDragEnter={hasPeers ? handleDragEnter : undefined}
      onDragOver={hasPeers ? handleDragOver : undefined}
      onDragLeave={hasPeers ? handleDragLeave : undefined}
      onDrop={hasPeers ? handleDrop : undefined}
    >
      {/* Tailscale Offline Modal */}
      {tailscaleOffline && (
        <div className="tailscale-modal-overlay">
          <div className="tailscale-modal">
            <div className="tailscale-modal-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="tailscale-modal-title">TAILSCALE OFFLINE</h2>
            <p className="tailscale-modal-message">
              Tailscale is not running. Files cannot be shared with peers until Tailscale is connected.
            </p>
            <p className="tailscale-modal-hint">
              Please start Tailscale and ensure you're connected to your network.
            </p>
            <div className="tailscale-modal-actions">
              <button onClick={handleRetryTailscale} className="primary">
                RETRY CONNECTION
              </button>
              <button onClick={dismissTailscaleWarning} className="secondary">
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Peers Online Modal */}
      {noPeersOnline && (
        <div className="tailscale-modal-overlay">
          <div className="tailscale-modal">
            <div className="tailscale-modal-icon warning">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="tailscale-modal-title">NO PEERS ONLINE</h2>
            <p className="tailscale-modal-message">
              None of your peers are currently online. Files will not be received until a peer comes online.
            </p>
            <p className="tailscale-modal-hint">
              Wait for a peer to come online or check their Tailscale connection.
            </p>
            <div className="tailscale-modal-actions">
              <button onClick={handleRetryPeers} className="primary">
                CHECK AGAIN
              </button>
              <button onClick={dismissNoPeersWarning} className="secondary">
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

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
                        <div className="peer-tooltip-avatar">
                          {peer.profilePicture ? (
                            <img src={peer.profilePicture} alt="" className="peer-tooltip-avatar-img" />
                          ) : (
                            <span className="peer-tooltip-avatar-initial">{(peer.name || '?')[0].toUpperCase()}</span>
                          )}
                          <span className={`peer-tooltip-status-dot ${peerStatus[peer.ip] ? 'online' : 'offline'}`}></span>
                        </div>
                        <div className="peer-tooltip-info">
                          <span className="peer-tooltip-name">{peer.name}</span>
                          <span className="peer-tooltip-ip">{peer.ip}</span>
                        </div>
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

      {/* Filter bar */}
      {hasPeers && files.length > 0 && (
        <div className="gallery-filters">
          <div className="gallery-filters-top">
            <div className="filter-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="filter-search-input"
              />
              {searchQuery && (
                <button className="filter-clear-btn" onClick={() => setSearchQuery('')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div className="filter-controls">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
                <option value="date">Sort: Date</option>
                <option value="name">Sort: Name</option>
                <option value="size">Sort: Size</option>
                <option value="type">Sort: Type</option>
                <option value="sender">Sort: Sender</option>
              </select>

              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
                <option value="all">All Types</option>
                <option value="images">Images</option>
                <option value="videos">Videos</option>
                <option value="audio">Audio</option>
                <option value="documents">Documents</option>
                <option value="archives">Archives</option>
              </select>

              {uniqueSenders.length > 0 && (
                <select value={filterSender} onChange={(e) => setFilterSender(e.target.value)} className="filter-select">
                  <option value="all">All Senders</option>
                  {uniqueSenders.map((sender) => (
                    <option key={sender} value={sender}>
                      {sender === 'myself' ? 'Myself' : sender}
                    </option>
                  ))}
                </select>
              )}

              <button className="filter-clear-all-btn" onClick={handleClearAll} title="Delete all files">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Clear All
              </button>
            </div>
          </div>

          <div className="filter-results">
            {filteredFiles.length !== files.length 
              ? `Showing ${filteredFiles.length} of ${files.length} files`
              : `${files.length} file${files.length !== 1 ? 's' : ''} total`
            }
          </div>
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
        ) : files.length === 0 && receivingFiles.length === 0 ? (
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
            {/* Show files currently being received */}
            {receivingFiles.map(([fileId, progress]) => (
              <div key={`receiving-${fileId}`} className="file-card file-card-receiving">
                <div className="file-thumbnail">
                  <div className="file-thumbnail-fallback receiving-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                </div>
                <div className="file-info">
                  <span className="file-name" title={progress.fileName}>{progress.fileName || 'Receiving...'}</span>
                  <div className="file-meta">
                    <span className="file-type">RECEIVING</span>
                    <span className="file-meta-dot">•</span>
                    <span className="file-size">{formatFileSize(progress.totalBytes || 0)}</span>
                  </div>
                </div>
                <div className="file-card-overlay file-card-overlay-progress">
                  <div className="file-progress-container">
                    <div className="file-progress-bar" style={{ width: `${progress.progress}%` }}></div>
                  </div>
                  <span className="file-progress-text">{progress.progress}%</span>
                </div>
              </div>
            ))}

            {/* Show completed files */}
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onDelete={handleDeleteFile}
                onOpen={handleOpenFile}
                isDeleting={deletingFiles.has(file.id)}
                progress={fileProgress[file.id]}
              />
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

// FileCard component with thumbnail loading
function FileCard({ file, onDelete, onOpen, isDeleting, progress }) {
  const [thumbnail, setThumbnail] = useState(null);
  const [loadingThumbnail, setLoadingThumbnail] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    async function loadThumbnail() {
      if (!file.path) {
        setLoadingThumbnail(false);
        return;
      }
      
      try {
        const thumbData = await window.electronAPI.getThumbnail(file.path);
        if (mounted && thumbData) {
          setThumbnail(thumbData);
        }
      } catch (err) {
        console.error('[FileCard] Failed to load thumbnail:', err);
      } finally {
        if (mounted) {
          setLoadingThumbnail(false);
        }
      }
    }

    loadThumbnail();

    return () => {
      mounted = false;
    };
  }, [file.path]);

  const isDownloading = progress && progress.progress < 100;
  const isSending = progress && progress.direction === 'sending';
  
  // Check if file is an image type
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
  const isImage = imageExts.includes(file.type?.toLowerCase());

  return (
    <div 
      className={`file-card ${isDeleting ? 'file-card-deleting' : ''} ${isDownloading ? 'file-card-downloading' : ''}`}
      onClick={() => !isDeleting && !isDownloading && onOpen(file)}
    >
      {/* Deleting overlay */}
      {isDeleting && (
        <div className="file-card-overlay">
          <div className="file-loading-spinner"></div>
          <span>Deleting...</span>
        </div>
      )}
      
      {/* Downloading/Sending progress */}
      {isDownloading && (
        <div className={`file-card-overlay ${isSending ? 'sending' : 'receiving'}`}>
          <div className="file-progress-container">
            <div 
              className="file-progress-bar" 
              style={{ width: `${progress.progress}%` }}
            ></div>
          </div>
          <span>{isSending ? 'Sending' : 'Receiving'} {progress.progress}%</span>
        </div>
      )}
      
      <button 
        className="file-delete-btn" 
        onClick={(e) => onDelete(e, file.id)}
        title="Delete file"
        disabled={isDeleting}
      >
        ×
      </button>
      <div className="file-thumbnail">
        {thumbnail ? (
          <img 
            src={thumbnail}
            alt={file.name} 
            className={`file-thumbnail-img ${isImage ? 'is-image' : 'is-icon'}`}
          />
        ) : loadingThumbnail ? (
          <div className="file-thumbnail-loading">
            <div className="file-loading-spinner small"></div>
          </div>
        ) : (
          <div className="file-thumbnail-fallback">
            {getFileIcon(file.type)}
          </div>
        )}
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
  );
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
