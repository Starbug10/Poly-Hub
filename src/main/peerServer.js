const net = require('net');
const { EventEmitter } = require('events');

const POLY_HUB_PORT = 47777; // Custom port for Poly-Hub communication

class PeerServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.connections = new Map();
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
        resolve();
      });
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
 * Announce a file to a peer
 * @param {string} peerIP - The Tailscale IP of the peer
 * @param {object} file - File info {name, size, type, path}
 * @param {object} from - Our profile {name, ip}
 */
function announceFile(peerIP, file, from) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);

    socket.connect(POLY_HUB_PORT, peerIP, () => {
      clearTimeout(timeout);
      socket.write(JSON.stringify({
        type: 'FILE_ANNOUNCE',
        file,
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

module.exports = {
  PeerServer,
  sendPairRequest,
  announceFile,
  announceFileDelete,
  POLY_HUB_PORT,
};
