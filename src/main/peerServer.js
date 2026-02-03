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
  }

  setSyncFolder(folder) {
    this.syncFolder = folder;
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
        console.log(`Poly-Hub peer server listening on port ${POLY_HUB_PORT}`);
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
        console.log(`Poly-Hub file server listening on port ${FILE_TRANSFER_PORT}`);
        resolve();
      });
    });
  }

  /**
   * Handle incoming file transfer
   */
  handleFileTransfer(socket) {
    const chunks = [];
    let headerReceived = false;
    let fileInfo = null;
    let headerLength = 0;

    socket.on('data', (chunk) => {
      if (!headerReceived) {
        // First 4 bytes are header length
        if (chunks.length === 0 && chunk.length >= 4) {
          headerLength = chunk.readUInt32BE(0);
          const headerData = chunk.slice(4, 4 + headerLength);
          try {
            fileInfo = JSON.parse(headerData.toString());
            headerReceived = true;
            // Rest of this chunk is file data
            const fileData = chunk.slice(4 + headerLength);
            if (fileData.length > 0) {
              chunks.push(fileData);
            }
          } catch (e) {
            console.error('Failed to parse file header:', e);
            socket.end();
          }
        }
      } else {
        chunks.push(chunk);
      }
    });

    socket.on('end', () => {
      if (fileInfo && this.syncFolder) {
        const fileBuffer = Buffer.concat(chunks);
        const destPath = path.join(this.syncFolder, fileInfo.name);
        
        try {
          fs.writeFileSync(destPath, fileBuffer);
          console.log(`File received and saved: ${destPath}`);
          
          // Emit event with local path
          this.emit('file-received', {
            file: {
              ...fileInfo,
              path: destPath, // Use local path, not sender's path
            },
            from: fileInfo.from,
          });
        } catch (err) {
          console.error('Failed to save received file:', err);
        }
      }
    });

    socket.on('error', (err) => {
      console.error('File transfer error:', err.message);
    });
  }

  /**
   * Handle incoming connection from a peer
   */
  handleConnection(socket) {
    const remoteAddress = socket.remoteAddress;
    console.log(`Peer connected from ${remoteAddress}`);

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
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'PAIR_REQUEST':
        // Someone is trying to pair with us
        this.emit('pair-request', {
          name: message.name,
          ip: message.ip,
        });
        // Send acknowledgment
        this.sendMessage(socket, {
          type: 'PAIR_ACK',
          success: true,
        });
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
        this.emit('file-delete', {
          fileId: message.fileId,
          from: message.from,
        });
        break;

      case 'PROFILE_UPDATE':
        // Peer is updating their profile
        this.emit('profile-update', {
          profile: message.profile,
        });
        break;

      default:
        console.log('Unknown message type:', message.type);
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
 * Send a file to a peer (actual file transfer, not just announcement)
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} file - File info {id, name, size, type, path}
 * @param {object} from - Our profile {name, ip}
 */
function sendFile(peerIP, file, from) {
  return new Promise((resolve) => {
    // Read file data
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(file.path);
    } catch (err) {
      console.error('Failed to read file:', err);
      resolve({ success: false, error: 'Failed to read file' });
      return;
    }

    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 60000); // 60 second timeout for file transfer

    socket.connect(FILE_TRANSFER_PORT, peerIP, () => {
      clearTimeout(timeout);
      console.log(`Sending file ${file.name} to ${peerIP}`);

      // Create header with file info
      const header = JSON.stringify({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        sharedBy: file.sharedBy,
        sharedAt: file.sharedAt,
        from: from,
      });
      const headerBuffer = Buffer.from(header);
      
      // Create length prefix (4 bytes)
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(headerBuffer.length, 0);
      
      // Send: [header length (4 bytes)][header JSON][file data]
      socket.write(lengthBuffer);
      socket.write(headerBuffer);
      socket.write(fileBuffer);
      socket.end();
      
      console.log(`File ${file.name} sent successfully`);
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Failed to send file to ${peerIP}:`, err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Announce a file to a peer (metadata only, for backwards compat)
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} file - File info {name, size, type, path}
 * @param {object} from - Our profile {name, ip}
 */
function announceFile(peerIP, file, from) {
  // Use sendFile for actual file transfer
  return sendFile(peerIP, file, from);
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
