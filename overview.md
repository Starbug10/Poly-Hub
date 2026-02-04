# PolyHub — Technical Overview

## Project Summary
**PolyHub** is a P2P file sharing Electron app using Tailscale's mesh VPN for secure direct connections. Features brutalist UI with dark/light themes.

## Architecture
```
Main Process (Node.js)          Renderer Process (React)
├── IPC Handlers                ├── UI Components
├── Peer Server (TCP)           ├── Gallery, Settings, Discovery
├── File Transfer               └── Onboarding
└── Storage (electron-store)
         ↓
   Tailscale VPN (100.x.x.x)
         ↓
    Peer-to-Peer Network
```

## Technology Stack
- **Electron** v28.1.0 — Desktop framework
- **React** v18.2.0 — UI
- **Vite** v5.0.10 — Build tool
- **Tailscale** — VPN mesh network
- **electron-store** — Persistent storage

## Network Protocol

### Ports
- **47777** — Control messages (JSON over TCP): PAIR_REQUEST, FILE_DELETE, PROFILE_UPDATE
- **47778** — File transfer (binary): 4-byte header length + JSON metadata + raw file stream

### Discovery
1. User extracts Tailscale IP via `tailscale status`
2. Generate pairing link: `polyhub://pair/{base64({name, ip, timestamp})}`
3. Share link out-of-band
4. Peer parses link and connects via TCP

## File Transfer

### Flow
**Sender:** Select files → Copy to sync folder → Generate metadata → Stream to peers (port 47778)
**Receiver:** Listen on 47778 → Read header → Accumulate chunks → Write to sync folder → Update gallery

### Storage
- Default sync folder: `~/Documents/PolyHub`
- Custom protocol: `polyhub-file://` for thumbnail access
- Metadata stored in electron-store JSON

### File Metadata
```javascript
{
  id: "timestamp-random",
  name: "file.jpg",
  path: "C:\\Users\\...\\PolyHub\\file.jpg",
  size: 2048576,
  type: "jpg",
  sharedBy: "Alice",
  sharedAt: 1704723891234,
  from: { name: "Alice", ip: "100.x.x.x" }
}
```

## Data Storage (electron-store)
```javascript
{
  profile: { name: "Alice", ip: "100.x.x.x" },
  peers: [{ name: "Bob", ip: "100.x.x.x", addedAt: timestamp }],
  sharedFiles: [{ id, name, path, size, type, sharedBy, sharedAt }],
  settings: {
    syncFolder: "path",
    maxFileSize: 5, // GB
    maxStorageSize: 5, // GB
    notifications: true,
    theme: "dark",
    overlayShortcut: "Alt+D"
  }
}
```

## UI Design

### Brutalist Principles
- Function over form, sharp edges, hard shadows
- Monospace typography (JetBrains Mono)
- High contrast, minimal decoration

### Themes
**Dark:** BG #0d0d0d, Surface #1a1a1a, Accent #ff6700 (Safety Orange)
**Light:** BG #ffffff, Surface #f7f6f3, Accent #d44800

### Routes
- `/` — Onboarding (if no profile)
- `/discovery` — Peer pairing
- `/gallery` — File sharing
- `/settings` — Configuration

### Key Components
- **TitleBar** — Custom window controls
- **Sidebar** — Navigation
- **Gallery** — Drag-and-drop file sharing
- **Settings** — Profile, storage, theme, peers
- **Overlay** — Global drop zone (Alt+D)

## Security

### Network
- All traffic encrypted via Tailscale/WireGuard
- No authentication beyond Tailscale network
- No file integrity checking

### Application
- Context isolation enabled
- Node integration disabled in renderer
- CSP: `default-src 'self'; img-src 'self' data: polyhub-file:`

## Development

### Structure
```
src/
├── main/              # Electron main process
│   ├── main.js        # Entry, IPC handlers
│   ├── peerServer.js  # TCP P2P server
│   ├── store.js       # Persistent storage
│   ├── tailscale.js   # Tailscale integration
│   ├── preload.js     # IPC bridge
│   ├── overlay.html   # Global drop overlay
│   └── notification-overlay.html  # File notifications
└── renderer/          # React UI
    ├── App.jsx
    ├── components/    # TitleBar, Sidebar
    ├── pages/         # Gallery, Settings, Discovery
    └── styles/
```

### Commands
- `npm run dev` — Start dev server + Electron
- `npm run build` — Build for production
- `npx electron-builder --win --x64` — Build Windows installer

### Installation & Updates
- NSIS installer automatically replaces old versions
- Settings stored in `%APPDATA%\poly-hub\` (preserved on update)
- Sync folder in `Documents\PolyHub\` (preserved on update)
- Auto-start on Windows boot (hidden/minimized)
- Desktop and Start Menu shortcuts created

### Adding IPC Handler
1. Define in `main.js`: `ipcMain.handle('action', async (e, arg) => {})`
2. Expose in `preload.js`: `action: (arg) => ipcRenderer.invoke('action', arg)`
3. Use in renderer: `await window.electronAPI.action(arg)`

## Features

### Current
- P2P file sharing over Tailscale
- Real-time sync to all peers
- Drag-and-drop interface
- Storage limits (5GB default)
- Global drop overlay (Alt+D, ESC to close)
- Smooth liquid animations on overlay
- Auto-hide overlay after file drop (1s delay)
- File notification overlays with accept/decline
- Auto-start on Windows boot (minimized)
- Dark/light themes
- File thumbnails
- Peer status indicators
- Auto-update installer (preserves settings)

### Planned
- File notifications with accept/decline
- Folder sync
- Resume interrupted transfers
- End-to-end encryption
- Hash check sent/recivied to double confirm it has not been tainted

## Troubleshooting
- **Files not transferring:** Check Tailscale connection, firewall (ports 47777/47778)
- **Thumbnails missing:** Verify file path, check CSP allows `polyhub-file:`
- **Peers not connecting:** Verify Tailscale running, correct IP (100.x.x.x)
- **Overlay not appearing:** Check global shortcut (Alt+D), restart app
- **Auto-start not working:** Reinstall with NSIS installer

---
*Version: 4.0.1 | Last Updated: February 2026*
