# PolyHub — Technical Overview

## Table of Contents
1. [Project Summary](#project-summary)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Network Protocol](#network-protocol)
5. [File Transfer System](#file-transfer-system)
6. [Data Storage](#data-storage)
7. [User Interface](#user-interface)
8. [Security Considerations](#security-considerations)
9. [Development Guidelines](#development-guidelines)
10. [Future Enhancements](#future-enhancements)

---

## Project Summary

**PolyHub** is a peer-to-peer file sharing application built on Electron that leverages Tailscale's mesh VPN network for secure, direct connections between users. The application provides a brutalist-designed interface for seamless file synchronization across a private network.

### Core Features
- **Direct P2P Communication**: No central server required; all communication happens directly between peers over Tailscale
- **Real-time File Sync**: Files shared to one peer are immediately available to all connected peers
- **Automatic Discovery**: Uses Tailscale network to discover and connect to peers
- **Bidirectional Transfer**: Both file metadata and actual binary data are transferred
- **Brutalist UI**: Clean, function-first interface with dark and light themes

---

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                     PolyHub Application                      │
├─────────────────────────────────────────────────────────────┤
│  Renderer Process (React)          Main Process (Node.js)   │
│  ┌──────────────────┐             ┌──────────────────┐     │
│  │   UI Components  │◄────IPC────►│  IPC Handlers    │     │
│  │   - Gallery      │             │  - File Ops      │     │
│  │   - Settings     │             │  - Profile Mgmt  │     │
│  │   - Discovery    │             │  - Peer Mgmt     │     │
│  │   - Onboarding   │             └─────────┬────────┘     │
│  └──────────────────┘                       │              │
│                                              │              │
│                                    ┌─────────▼────────┐     │
│                                    │  Peer Server     │     │
│                                    │  - Control Port  │     │
│                                    │  - File Port     │     │
│                                    └─────────┬────────┘     │
└────────────────────────────────────────────┬─┴──────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │   Tailscale VPN Network     │
                              │   (100.x.x.x IP space)      │
                              └──────────────┬──────────────┘
                                             │
                         ┌───────────────────┴───────────────────┐
                         │                                       │
                    ┌────▼────┐                            ┌────▼────┐
                    │ Peer A  │                            │ Peer B  │
                    └─────────┘                            └─────────┘
```

### Process Separation

**Main Process** (`src/main/`)
- Manages Electron lifecycle
- Handles system-level operations (file I/O, networking)
- Runs TCP servers for peer communication
- Manages persistent storage via electron-store
- Bridges renderer with native functionality

**Renderer Process** (`src/renderer/`)
- React-based UI running in Chromium
- Communicates with main process via IPC
- Handles user interactions and state management
- No direct file system or network access

---

## Technology Stack

### Core Technologies
- **Electron** `v28.1.0` — Desktop application framework
- **React** `v18.2.0` — UI framework
- **Vite** `v5.0.10` — Build tool and dev server
- **Tailscale** — VPN mesh network for P2P connectivity

### Key Libraries
- **electron-store** — Persistent JSON storage
- **react-router-dom** — Client-side routing (HashRouter)

### Development Tools
- Node.js `v18+` recommended
- npm package manager
- VS Code (recommended IDE)

---

## Network Protocol

### Tailscale Integration

PolyHub operates entirely within a Tailscale VPN network. Each device is assigned an IP in the `100.x.x.x` range, enabling direct peer-to-peer connections without NAT traversal.

**Discovery Process:**
1. User extracts their Tailscale IP via `tailscale status`
2. Pairing link generated containing `{name, ip, timestamp}`
3. Link shared out-of-band (e.g., via chat, QR code)
4. Receiving peer parses link and initiates TCP connection

### TCP Server Ports

PolyHub uses two separate TCP servers:

#### Port 47777 — Control Messages
Handles peer coordination and metadata:
- `PAIR_REQUEST` — New peer wants to connect
- `PAIR_ACK` — Acknowledgment of pairing
- `FILE_DELETE` — File deletion notification
- `PROFILE_UPDATE` — User name change notification

#### Port 47778 — File Transfer
Dedicated binary file transfer port:
- Streams actual file data
- Uses length-prefixed protocol
- Handles large files (tested up to GB scale)

### Message Protocol

**Control Messages (JSON over TCP)**
```json
{
  "type": "PAIR_REQUEST",
  "name": "Alice",
  "ip": "100.101.102.103"
}
```

**File Transfer (Binary Protocol)**
```
[4 bytes: header length (UInt32BE)]
[N bytes: JSON header with file metadata]
[M bytes: raw file data]
```

Example header:
```json
{
  "id": "1704723891234-abc123",
  "name": "document.pdf",
  "size": 2048576,
  "type": "pdf",
  "sharedBy": "Alice",
  "sharedAt": 1704723891234,
  "from": {
    "name": "Alice",
    "ip": "100.101.102.103"
  }
}
```

---

## File Transfer System

### Transfer Flow

**Sender Side:**
1. User selects file(s) via dialog or drag-and-drop
2. Files copied to local sync folder (`~/Documents/PolyHub`)
3. File metadata generated (ID, name, size, type, timestamps)
4. For each peer:
   - Open TCP connection to peer's port 47778
   - Send 4-byte header length
   - Send JSON header with file info
   - Stream file bytes
   - Close connection

**Receiver Side:**
1. Listen on port 47778 for incoming connections
2. Read 4-byte header length
3. Read and parse JSON header
4. Accumulate file data chunks
5. Write complete file to local sync folder
6. Store file metadata with **local path** (not sender's path)
7. Notify UI to update gallery

### File Storage

**Sync Folder:**
- Default: `C:\Users\[username]\Documents\PolyHub` (Windows)
- Configurable via Settings
- Each peer stores files with their own local paths
- Enables thumbnail generation using custom protocol

**Custom Protocol:**
```
polyhub-file://C:/Users/[user]/Documents/PolyHub/image.png
```
- Registered in Electron's protocol API
- Bypasses CSP restrictions for local file access
- Enables thumbnail display in React components

### File Metadata

Stored in electron-store as JSON:
```json
{
  "id": "1704723891234-abc123",
  "name": "vacation.jpg",
  "path": "C:\\Users\\Alice\\Documents\\PolyHub\\vacation.jpg",
  "size": 2048576,
  "type": "jpg",
  "sharedBy": "Alice",
  "sharedAt": 1704723891234,
  "from": {
    "name": "Alice",
    "ip": "100.101.102.103"
  },
  "receivedAt": 1704723895678
}
```

---

## Data Storage

PolyHub uses **electron-store** for persistent JSON storage. Data is stored in:
- Windows: `%APPDATA%\poly-hub\config.json`
- macOS: `~/Library/Application Support/poly-hub/config.json`
- Linux: `~/.config/poly-hub/config.json`

### Storage Schema

```javascript
{
  "profile": {
    "name": "Alice",
    "ip": "100.101.102.103"
  },
  "peers": [
    {
      "name": "Bob",
      "ip": "100.101.102.104",
      "pairedAt": 1704723891234
    }
  ],
  "sharedFiles": [
    {
      "id": "1704723891234-abc123",
      "name": "document.pdf",
      "path": "C:\\Users\\Alice\\Documents\\PolyHub\\document.pdf",
      "size": 2048576,
      "type": "pdf",
      "sharedBy": "Alice",
      "sharedAt": 1704723891234
    }
  ],
  "settings": {
    "syncFolder": "C:\\Users\\Alice\\Documents\\PolyHub",
    "maxFileSize": "10",
    "notifications": true,
    "theme": "dark"
  }
}
```

### Store Operations

**Read Operations:**
- `getProfile()` — Get user's profile
- `getPeers()` — Get list of connected peers
- `getSharedFiles()` — Get all shared files
- `getSettings()` — Get application settings

**Write Operations:**
- `saveProfile(profile)` — Save user profile
- `updateProfile(updates)` — Update profile fields
- `addPeer(peer)` — Add new peer
- `updatePeer(ip, updates)` — Update peer info
- `addSharedFile(file)` — Add shared file
- `removeSharedFile(id)` — Delete shared file
- `updateSettings(settings)` — Update settings

---

## User Interface

### Design System

**Brutalist Principles:**
- Function over form
- Sharp edges (no border-radius)
- Hard shadows (offset, not blur)
- Monospace typography only (`JetBrains Mono`)
- High contrast
- Minimal decoration

### Theme System

**Dark Theme (Default):**
- Background: `#0d0d0d`
- Surface: `#1a1a1a`
- Text: `#e8e8e8`
- Accent: `#ff6700` (Safety Orange)
- Borders: `#3d3d3d`

**Light Theme (Notion-Inspired):**
- Background: `#ffffff`
- Surface: `#f7f6f3` (Notion off-white)
- Text: `#37352f` (Notion dark gray)
- Accent: `#d44800` (Burnt orange)
- Borders: `#e3e2df` (Notion gray)

### Routing Structure

```
/                    → Onboarding (if no profile)
/discovery           → Peer discovery and pairing
/gallery             → File gallery and sharing
/settings            → User settings and configuration
```

### Key Components

**TitleBar** (`src/renderer/components/TitleBar.jsx`)
- Custom window controls (minimize, maximize, close)
- Frameless window design
- Electron window management via IPC

**Sidebar** (`src/renderer/components/Sidebar.jsx`)
- Navigation between pages
- Active route highlighting
- Fixed left panel

**Gallery** (`src/renderer/pages/Gallery.jsx`)
- Full-page drag-and-drop zone
- File grid with thumbnails
- Click to open files
- Delete functionality
- Peer count tooltip

**Settings** (`src/renderer/pages/Settings.jsx`)
- Profile management (name editing)
- Sync folder configuration
- Theme switcher
- Notification toggle
- Connected peers list

**Discovery** (`src/renderer/pages/Discovery.jsx`)
- Generate pairing links
- Parse and connect via links
- Displays Tailscale IP and pairing instructions

---

## Security Considerations

### Network Security

**Tailscale as Security Layer:**
- All traffic encrypted via WireGuard
- Identity management handled by Tailscale
- No exposure to public internet
- Access control via Tailscale ACLs

**Limitations:**
- No authentication beyond Tailscale network
- Any peer on the network can pair
- Files transferred in plaintext over Tailscale VPN
- No file integrity checking (no checksums)

### File System Security

**Risks:**
- Files saved to user-controlled sync folder
- No sandboxing of file writes
- No virus scanning or file validation
- Users can execute received files

**Mitigations:**
- Files stored in user's Documents folder by default
- User must explicitly open files
- Operating system handles file execution permissions

### Application Security

**CSP Policy:**
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: polyhub-file:;
```

**IPC Security:**
- Context isolation enabled
- Node integration disabled in renderer
- Preload script exposes limited API
- All IPC handlers validated

---

## Development Guidelines

### Project Structure

```
poly-hub/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.js        # Entry point, IPC handlers
│   │   ├── peerServer.js  # TCP server for P2P
│   │   ├── store.js       # Persistent storage
│   │   ├── tailscale.js   # Tailscale integration
│   │   └── preload.js     # IPC bridge
│   └── renderer/          # React UI
│       ├── App.jsx        # Root component
│       ├── main.jsx       # React entry point
│       ├── index.html     # HTML entry
│       ├── components/    # Reusable components
│       ├── pages/         # Route pages
│       └── styles/        # Global styles
├── package.json
├── vite.config.js
└── README.md
```

### Development Workflow

**Start Development Server:**
```bash
npm run dev
```
- Runs Vite dev server on `http://localhost:5173`
- Starts Electron with hot reload
- Opens DevTools automatically

**Build for Production:**
```bash
npm run build
```
- Bundles renderer with Vite
- Packages Electron app
- Outputs to `dist/`

### Coding Standards

**Main Process:**
- Use Node.js `require()` (CommonJS)
- Async/await for IPC handlers
- Comprehensive logging with `[MODULE]` prefixes
- Error handling with try/catch

**Renderer Process:**
- Use ES6 `import` (ESM)
- React functional components with hooks
- Controlled inputs (no uncontrolled components)
- IPC via `window.electronAPI`

**Logging Convention:**
```javascript
// Main process
console.log('[PEER-SERVER] Connection from 100.101.102.103');
console.error('[FILE-SERVER] ERROR: Failed to save file');

// Renderer process
console.log('Gallery: File received', file.name);
console.error('Settings: Failed to update profile', error);
```

### Adding New Features

**To add a new IPC handler:**
1. Define handler in `src/main/main.js`:
   ```javascript
   ipcMain.handle('feature:action', async (event, arg) => {
     // Implementation
     return result;
   });
   ```

2. Expose in `src/main/preload.js`:
   ```javascript
   contextBridge.exposeInMainWorld('electronAPI', {
     featureAction: (arg) => ipcRenderer.invoke('feature:action', arg),
   });
   ```

3. Use in renderer:
   ```javascript
   const result = await window.electronAPI.featureAction(arg);
   ```

**To add a new peer message type:**
1. Add handler in `peerServer.js`:
   ```javascript
   case 'NEW_MESSAGE_TYPE':
     console.log('[PEER-SERVER] Handling new message type');
     this.emit('new-event', message.data);
     break;
   ```

2. Listen in `main.js`:
   ```javascript
   peerServer.on('new-event', (data) => {
     console.log('[MAIN] New event received', data);
     mainWindow.webContents.send('new-event', data);
   });
   ```

3. Add sender function:
   ```javascript
   function sendNewMessage(peerIP, data) {
     return new Promise((resolve) => {
       const socket = new net.Socket();
       socket.connect(POLY_HUB_PORT, peerIP, () => {
         socket.write(JSON.stringify({
           type: 'NEW_MESSAGE_TYPE',
           data: data,
         }));
         socket.end();
         resolve({ success: true });
       });
     });
   }
   ```

---

## Future Enhancements

### Planned Features

**File Management:**
- [ ] Folder synchronization (recursive file transfer)
- [ ] Large file streaming (chunked transfer with progress)
- [ ] Resume interrupted transfers
- [ ] File deduplication (hash-based)
- [ ] File versioning
- [ ] Conflict resolution

**Network:**
- [ ] Peer presence detection (heartbeat)
- [ ] Automatic peer reconnection
- [ ] Bandwidth throttling
- [ ] Connection status indicators
- [ ] Offline queue for transfers

**UI/UX:**
- [ ] Transfer progress bars
- [ ] File preview (images, videos, PDFs)
- [ ] Search and filter files
- [ ] Bulk selection and operations
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements

**Security:**
- [ ] End-to-end encryption (beyond Tailscale)
- [ ] File integrity verification (SHA256 checksums)
- [ ] Access control per file
- [ ] Audit log of transfers

**Platform:**
- [ ] macOS and Linux support
- [ ] Mobile companion app
- [ ] Installer/updater
- [ ] Crash reporting
- [ ] Analytics (privacy-preserving)

### Technical Debt

- [ ] Replace JSON-over-TCP with structured protocol (e.g., Protocol Buffers)
- [ ] Add unit and integration tests
- [ ] Improve error handling and user feedback
- [ ] Add TypeScript for type safety
- [ ] Optimize file transfer for large files (stream instead of loading into memory)
- [ ] Add database (SQLite) for better querying of files

---

## Troubleshooting

### Common Issues

**Files not transferring:**
- Check that both peers are on Tailscale network
- Verify firewall allows ports 47777 and 47778
- Ensure sync folder is writable
- Check logs for error messages

**Thumbnails not showing:**
- Verify file exists at path in metadata
- Check CSP allows `polyhub-file:` protocol
- Ensure image file types are supported
- Check browser console for protocol errors

**Peers not connecting:**
- Verify Tailscale is running and connected
- Check IP address is correct (100.x.x.x range)
- Try regenerating pairing link
- Check network connectivity with `ping [peer-ip]`

**App won't start:**
- Check Node.js version (18+ required)
- Run `npm install` to ensure dependencies
- Check for port conflicts (5173 for dev server)
- Review Electron logs for errors

### Debug Mode

Enable verbose logging:
```javascript
// In main.js
process.env.DEBUG = 'polyhub:*';
```

View logs:
- Development: Terminal running `npm run dev`
- Production: Electron DevTools console

---

## License

MIT License — See `LICENSE` file for details.

## Contributing

Contributions welcome! Please follow existing code style and add tests for new features.

## Support

For issues and questions, file a GitHub issue or consult the README.

---

*Last Updated: February 2026*
*Version: 1.0.0*
