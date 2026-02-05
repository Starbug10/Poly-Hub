const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const POLY_HUB_PORT = 47777; // Custom port for Poly-Hub communication
const FILE_TRANSFER_PORT = 47778; // Separate port for file transfers

class PeerServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.fileServer = null;
    this.connections = new Map();
    this.syncFolder = null;
    this.maxStorageSize = null; // in bytes
    this.maxFileSize = null; // in bytes
  }

  setSyncFolder(folder) {
    this.syncFolder = folder;
  }

  setStorageLimits(maxStorageSize, maxFileSize) {
    this.maxStorageSize = maxStorageSize;
    this.maxFileSize = maxFileSize;
  }

  /**
   * Calculate current folder size
   */
  getFolderSize(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) return 0;
    
    let totalSize = 0;
    const files = fs.readdirSync(folderPath);
    
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          totalSize += this.getFolderSize(filePath);
        } else {
          totalSize += stats.size;
        }
      } catch (err) {
        // Skip files we can't read
      }
    }
    
    return totalSize;
  }

  /**
   * Check if incoming file would exceed storage limits
   */
  checkStorageLimits(fileSize) {
    // Check per-file limit
    if (this.maxFileSize && fileSize > this.maxFileSize) {
      return { allowed: false, reason: 'FILE_TOO_LARGE' };
    }
    
    // Check total storage limit
    if (this.maxStorageSize && this.syncFolder) {
      const currentSize = this.getFolderSize(this.syncFolder);
      if (currentSize + fileSize > this.maxStorageSize) {
        return { allowed: false, reason: 'STORAGE_FULL' };
      }
    }
    
    return { allowed: true };
  }

  /**
   * Start the TCP server to listen for incoming peer connections
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        console.error('Peer server error:', err);
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(POLY_HUB_PORT, '0.0.0.0', () => {
        console.log(`[PEER-SERVER] Started listening on port ${POLY_HUB_PORT}`);
        console.log(`[PEER-SERVER] Ready to accept peer connections`);
        this.startFileServer().then(resolve).catch(reject);
      });
    });
  }

  /**
   * Start file transfer server
   */
  startFileServer() {
    return new Promise((resolve, reject) => {
      this.fileServer = net.createServer((socket) => {
        this.handleFileTransfer(socket);
      });

      this.fileServer.on('error', (err) => {
        console.error('File server error:', err);
      });

      this.fileServer.listen(FILE_TRANSFER_PORT, '0.0.0.0', () => {
        console.log(`[FILE-SERVER] Started listening on port ${FILE_TRANSFER_PORT}`);
        console.log(`[FILE-SERVER] Ready to receive file transfers`);
        resolve();
      });
    });
  }

  /**
   * Handle incoming file transfer with streaming support
   */
  handleFileTransfer(socket) {
    let headerReceived = false;
    let fileInfo = null;
    let headerLength = 0;
    let headerBuffer = Buffer.alloc(0);
    let fileStream = null;
    let bytesReceived = 0;
    let lastProgressLog = 0;

    // Increase socket timeout for large files
    socket.setTimeout(600000); // 10 minutes

    socket.on('data', (chunk) => {
      if (!headerReceived) {
        // Accumulate data until we have the full header
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        
        // First 4 bytes are header length
        if (headerBuffer.length >= 4 && headerLength === 0) {
          headerLength = headerBuffer.readUInt32BE(0);
        }
        
        // Check if we have the full header
        if (headerLength > 0 && headerBuffer.length >= 4 + headerLength) {
          const headerData = headerBuffer.slice(4, 4 + headerLength);
          try {
            fileInfo = JSON.parse(headerData.toString());
            headerReceived = true;
            console.log(`[FILE-SERVER] Receiving file: ${fileInfo.name} (${fileInfo.size} bytes) from ${fileInfo.from?.name || 'unknown'}`);
            
            // Check storage limits before accepting file
            const limitCheck = this.checkStorageLimits(fileInfo.size);
            if (!limitCheck.allowed) {
              console.log(`[FILE-SERVER] BLOCKED: File ${fileInfo.name} - ${limitCheck.reason}`);
              this.emit('file-blocked', {
                file: fileInfo,
                from: fileInfo.from,
                reason: limitCheck.reason,
              });
              socket.end();
              return;
            }
            
            // Create write stream for the file
            if (this.syncFolder) {
              let destPath;
              
              // If file has a relative path (from folder), preserve folder structure
              if (fileInfo.relativePath) {
                destPath = path.join(this.syncFolder, fileInfo.relativePath);
                // Ensure parent directories exist
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                  console.log(`[FILE-SERVER] Created folder: ${destDir}`);
                }
              } else {
                destPath = path.join(this.syncFolder, fileInfo.name);
              }
              
              fileStream = fs.createWriteStream(destPath);
              fileInfo.localPath = destPath;
              
              // Write any remaining data from this chunk
              const fileData = headerBuffer.slice(4 + headerLength);
              if (fileData.length > 0) {
                fileStream.write(fileData);
                bytesReceived += fileData.length;
              }
              
              // Emit progress event
              this.emit('file-progress', {
                fileId: fileInfo.id,
                fileName: fileInfo.name,
                fileType: fileInfo.type,
                bytesReceived,
                totalBytes: fileInfo.size,
                progress: Math.round((bytesReceived / fileInfo.size) * 100),
                relativePath: fileInfo.relativePath || null,
                localPath: fileInfo.localPath,
                from: fileInfo.from,
                direction: 'receiving',
              });
            }
          } catch (e) {
            console.error('[FILE-SERVER] ERROR: Failed to parse file header:', e);
            socket.end();
          }
        }
      } else if (fileStream) {
        // Stream file data directly to disk
        fileStream.write(chunk);
        bytesReceived += chunk.length;
        
        // Log and emit progress every 10%
        const progress = Math.round((bytesReceived / fileInfo.size) * 100);
        if (progress >= lastProgressLog + 10 || bytesReceived === fileInfo.size) {
          console.log(`[FILE-SERVER] Receiving ${fileInfo.name}: ${progress}% (${bytesReceived}/${fileInfo.size})`);
          lastProgressLog = progress;
          
          this.emit('file-progress', {
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            fileType: fileInfo.type,
            bytesReceived,
            totalBytes: fileInfo.size,
            progress,
            relativePath: fileInfo.relativePath || null,
            localPath: fileInfo.localPath,
            from: fileInfo.from,
            direction: 'receiving',
          });
        }
      }
    });

    socket.on('end', () => {
      if (fileStream) {
        fileStream.end();
        
        if (fileInfo && bytesReceived >= fileInfo.size * 0.99) { // Allow 1% tolerance
          console.log(`[FILE-SERVER] File complete: ${fileInfo.name} (${bytesReceived} bytes)`);
          console.log(`[FILE-SERVER] Saved to: ${fileInfo.localPath}`);
          
          // Emit event with local path
          this.emit('file-received', {
            file: {
              ...fileInfo,
              path: fileInfo.localPath,
            },
            from: fileInfo.from,
          });
        } else if (fileInfo) {
          console.error(`[FILE-SERVER] ERROR: Incomplete file ${fileInfo.name} (${bytesReceived}/${fileInfo.size})`);
          // Clean up incomplete file
          try {
            if (fs.existsSync(fileInfo.localPath)) {
              fs.unlinkSync(fileInfo.localPath);
            }
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }
    });

    socket.on('timeout', () => {
      console.error('[FILE-SERVER] ERROR: Socket timeout during file transfer');
      socket.destroy();
      if (fileStream) {
        fileStream.end();
      }
    });

    socket.on('error', (err) => {
      console.error('[FILE-SERVER] ERROR: File transfer error:', err.message);
      if (fileStream) {
        fileStream.end();
      }
    });
  }

  /**
   * Handle incoming connection from a peer
   */
  handleConnection(socket) {
    const remoteAddress = socket.remoteAddress;
    console.log(`[PEER-SERVER] New connection from ${remoteAddress}`);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Try to parse complete JSON messages
      try {
        const message = JSON.parse(buffer);
        buffer = '';
        this.handleMessage(message, socket);
      } catch (e) {
        // Incomplete message, wait for more data
      }
    });

    socket.on('close', () => {
      console.log(`Peer disconnected: ${remoteAddress}`);
    });

    socket.on('error', (err) => {
      console.error(`Socket error from ${remoteAddress}:`, err.message);
    });
  }

  /**
   * Handle incoming message from peer
   */
  handleMessage(message, socket) {
    console.log(`[PEER-SERVER] Received message: ${message.type}`);

    switch (message.type) {
      case 'PAIR_REQUEST':
        // Someone is trying to pair with us
        console.log(`[PEER-SERVER] Pair request from ${message.name} (${message.ip})`);
        this.emit('pair-request', {
          name: message.name,
          ip: message.ip,
          profilePicture: message.profilePicture || null,
        });
        // Send acknowledgment
        this.sendMessage(socket, {
          type: 'PAIR_ACK',
          success: true,
        });
        console.log(`[PEER-SERVER] Accepted pairing with ${message.name}`);
        break;

      case 'FILE_ANNOUNCE':
        // Peer is announcing a new file
        this.emit('file-announce', {
          file: message.file,
          from: message.from,
        });
        break;

      case 'FILE_DELETE':
        // Peer is deleting a file
        console.log(`[PEER-SERVER] File delete request: ${message.fileId}`);
        this.emit('file-delete', {
          fileId: message.fileId,
          from: message.from,
        });
        break;

      case 'PROFILE_UPDATE':
        // Peer is updating their profile
        console.log(`[PEER-SERVER] Profile update from ${message.profile.name} (${message.profile.ip})`);
        this.emit('profile-update', {
          profile: message.profile,
        });
        break;

      default:
        console.log(`[PEER-SERVER] WARNING: Unknown message type: ${message.type}`);
    }
  }

  /**
   * Send a message to a socket
   */
  sendMessage(socket, message) {
    try {
      socket.write(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  /**
   * Stop the server
   */
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

/**
 * Send a pairing request to a peer
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} profile - Our profile {name, ip}
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function sendPairRequest(peerIP, profile) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);

    socket.connect(POLY_HUB_PORT, peerIP, () => {
      clearTimeout(timeout);
      console.log(`Connected to peer at ${peerIP}`);

      // Send pair request with our profile
      socket.write(JSON.stringify({
        type: 'PAIR_REQUEST',
        name: profile.name,
        ip: profile.ip,
        profilePicture: profile.profilePicture || null,
      }));
    });

    socket.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'PAIR_ACK' && response.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: 'Peer rejected pairing' });
        }
      } catch (e) {
        resolve({ success: false, error: 'Invalid response' });
      }
      socket.end();
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Failed to connect to ${peerIP}:`, err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Send a file to a peer (actual file transfer with streaming for large files)
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} file - File info {id, name, size, type, path}
 * @param {object} from - Our profile {name, ip}
 * @param {function} onProgress - Optional callback for progress updates
 */
function sendFile(peerIP, file, from, onProgress) {
  return new Promise((resolve) => {
    // Check if file exists
    if (!fs.existsSync(file.path)) {
      console.error(`[FILE-TRANSFER] ERROR: File not found: ${file.path}`);
      resolve({ success: false, error: 'File not found' });
      return;
    }

    const stats = fs.statSync(file.path);
    const fileSize = stats.size;
    console.log(`[FILE-TRANSFER] Preparing to send ${file.name} (${fileSize} bytes) to ${peerIP}`);

    const socket = new net.Socket();
    
    // Longer timeout for large files (5 minutes + 1 min per GB)
    const timeoutMs = 300000 + Math.ceil(fileSize / (1024 * 1024 * 1024)) * 60000;
    const timeout = setTimeout(() => {
      console.error(`[FILE-TRANSFER] ERROR: Timeout sending ${file.name} to ${peerIP}`);
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, timeoutMs);

    socket.connect(FILE_TRANSFER_PORT, peerIP, () => {
      console.log(`[FILE-TRANSFER] Connected to ${peerIP}, sending ${file.name}`);

      // Create header with file info
      const header = JSON.stringify({
        id: file.id,
        name: file.name,
        size: fileSize,
        type: file.type,
        sharedBy: file.sharedBy,
        sharedAt: file.sharedAt,
        from: from,
        // Include relative path for folder structure
        relativePath: file.relativePath || null,
        folderName: file.folderName || null,
      });
      const headerBuffer = Buffer.from(header);
      
      // Create length prefix (4 bytes)
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(headerBuffer.length, 0);
      
      // Send header first
      socket.write(lengthBuffer);
      socket.write(headerBuffer);
      
      // Stream the file instead of loading entirely into memory
      const fileStream = fs.createReadStream(file.path, { highWaterMark: 64 * 1024 }); // 64KB chunks
      let bytesSent = 0;
      
      fileStream.on('data', (chunk) => {
        bytesSent += chunk.length;
        const progress = Math.round((bytesSent / fileSize) * 100);
        if (onProgress) {
          onProgress(progress, bytesSent, fileSize);
        }
        // Log progress every 10%
        if (bytesSent === chunk.length || progress % 10 === 0) {
          console.log(`[FILE-TRANSFER] Sending ${file.name}: ${progress}% (${bytesSent}/${fileSize})`);
        }
      });
      
      fileStream.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`[FILE-TRANSFER] ERROR: Failed to read file ${file.name}:`, err);
        socket.destroy();
        resolve({ success: false, error: 'Failed to read file' });
      });
      
      fileStream.on('end', () => {
        console.log(`[FILE-TRANSFER] File stream complete for ${file.name}`);
      });
      
      // Pipe file stream to socket
      fileStream.pipe(socket, { end: true });
      
      socket.on('close', () => {
        clearTimeout(timeout);
        if (bytesSent === fileSize) {
          console.log(`[FILE-TRANSFER] Successfully sent ${file.name} (${bytesSent} bytes) to ${peerIP}`);
          resolve({ success: true });
        } else {
          console.error(`[FILE-TRANSFER] ERROR: Incomplete transfer of ${file.name} (${bytesSent}/${fileSize})`);
          resolve({ success: false, error: 'Incomplete transfer' });
        }
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`[FILE-TRANSFER] ERROR: Failed to send ${file.name} to ${peerIP}:`, err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Announce a file to a peer (metadata only, for backwards compat)
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} file - File info {name, size, type, path}
 * @param {object} from - Our profile {name, ip}
 * @param {function} onProgress - Optional callback for progress updates
 */
function announceFile(peerIP, file, from, onProgress) {
  // Use sendFile for actual file transfer
  return sendFile(peerIP, file, from, onProgress);
}

/**
 * Announce file deletion to a peer
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {string} fileId - The ID of the file to delete
 * @param {object} from - Our profile {name, ip}
 */
function announceFileDelete(peerIP, fileId, from) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);

    socket.connect(POLY_HUB_PORT, peerIP, () => {
      clearTimeout(timeout);
      socket.write(JSON.stringify({
        type: 'FILE_DELETE',
        fileId,
        from,
      }));
      socket.end();
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Announce profile update to a peer
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} profile - Updated profile {name, ip}
 */
function announceProfileUpdate(peerIP, profile) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);

    socket.connect(POLY_HUB_PORT, peerIP, () => {
      clearTimeout(timeout);
      socket.write(JSON.stringify({
        type: 'PROFILE_UPDATE',
        profile,
      }));
      socket.end();
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

module.exports = {
  PeerServer,
  sendPairRequest,
  sendFile,
  announceFile,
  announceFileDelete,
  announceProfileUpdate,
  POLY_HUB_PORT,
  FILE_TRANSFER_PORT,
};
