# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common commands

### Prerequisites (runtime)
- The app expects **Tailscale** to be installed and running (the main process calls the `tailscale` CLI).

### Install
- `npm install`

### Develop (Electron + Vite)
- `npm run dev`
  - Runs the Vite dev server (`npm run dev:renderer`) and then launches Electron (`npm run dev:main`).
  - Renderer dev server is expected at `http://localhost:5173`.

Useful sub-commands:
- `npm run dev:renderer` (Vite only)
- `npm run dev:main` (Electron only)

### Production build / packaging
- `npm run build`
  - `vite build` outputs the renderer bundle to `dist/` (see `vite.config.js`).
  - `electron-builder` packages the Electron app and writes artifacts to `dist-electron/`.

- `npm run preview` (preview the Vite build)

### Build Windows installers explicitly
- `npx electron-builder --win --x64`

### Release (GitHub Actions)
- Creating/pushing a tag matching `v*` triggers `.github/workflows/release.yml` (Windows build + GitHub Release).
- There is a one-off helper script for the 4.0.4 release: `scripts/release-4.0.4.ps1`.

### Icons
- `node scripts/create-ico.js` (generates `assets/icon.ico` from `assets/icon.png`)

### Linting / tests
- There are currently no `lint` / `test` scripts in `package.json`.

## High-level architecture

Poly-Hub is an Electron app with:
- **Main process** (Node/Electron): networking, file IO, persistence, auto-update, global shortcuts.
- **Renderer** (React + Vite): UI, routing, and calling main-process functionality via IPC.

### Key directories / entry points
- `src/main/main.js`: Electron entrypoint (creates windows, registers IPC handlers, starts the peer server, manages overlay/notifications, sets up auto-updater in production).
- `src/main/preload.js`: the IPC bridge exposed as `window.electronAPI` (all renderer→main calls should go through here).
- `src/renderer/main.jsx`: renderer entrypoint; uses `HashRouter`.
- `src/renderer/App.jsx`: top-level app shell; routes and initial bootstrapping (profile load, Tailscale status, theme/settings application).

### UI routes
- Routes are defined in `src/renderer/App.jsx`:
  - `#/gallery`
  - `#/settings`
- Onboarding (Tailscale check + profile creation) is shown when no profile exists.
- There is a standalone pairing UI in `src/renderer/pages/Discovery.jsx`, but current navigation is driven from the Settings page/Sidebar.

### Renderer ↔ Main communication
- Renderer calls into main via `window.electronAPI.*` (defined in `src/main/preload.js`).
- Main pushes events back to renderer with IPC events like:
  - `peer:added`, `peer:updated`
  - `file:received`, `file:deleted`, `file:progress`, `file:blocked`, `file:auto-added`

When adding a new capability, the usual flow is:
1. Add an `ipcMain.handle(...)` (or `ipcMain.on(...)`) handler in `src/main/main.js`.
2. Expose it in `src/main/preload.js`.
3. Consume it from the renderer via `window.electronAPI`.

### Persistence / state
- `src/main/store.js` wraps `electron-store`.
  - Stores: `profile`, `peers`, `sharedFiles`, `settings`.
- Default sync folder is created under the user’s Documents: `Documents/PolyHub` (set/used in `src/main/main.js`).

### Custom protocols
- `polyhub-file://` is registered in the main process to allow the renderer to load thumbnails/icons from disk.
- Pairing links are encoded as `polyhub://pair/<base64url(json)>` (generated/parsed in `src/main/main.js`).

### Networking + file transfer
- `src/main/peerServer.js` implements TCP servers:
  - **47777**: control messages (JSON) for pairing, delete, profile updates.
  - **47778**: streaming file transfer (4-byte header length + JSON header + raw bytes).
- `src/main/tailscale.js` shells out to the Tailscale CLI (`tailscale ip -4`, `tailscale status --json`) to detect connectivity + the `100.x.x.x` Tailscale IP.

### File sharing flow (conceptual)
- UI selects files/folders → renderer calls `window.electronAPI.shareFiles(...)` / `shareFolder(...)`.
- Main copies files into the configured sync folder, adds metadata to `electron-store`, then sends the file to each peer over port **47778**.
- Receiving side writes to sync folder and emits `file:progress` and `file:received` events back to the renderer.

### Special windows / UX
- `src/main/main.js` creates additional windows besides the main BrowserWindow:
  - **Overlay** (`src/main/overlay.html`): a global “quick drop” target toggled via a global shortcut (default `Alt+D`).
  - **Notification overlay** (`src/main/notification-overlay.html`): per-file accept/decline UI when limits are exceeded.

### Auto-update
- `src/main/autoUpdater.js` configures `electron-updater` to pull releases from GitHub (`Starbug10/Poly-Hub`).
- In production (`app.isPackaged`), the updater is initialized from `src/main/main.js`.

## Build system notes
- Vite config (`vite.config.js`):
  - `root: 'src/renderer'`
  - build output: `dist/` (relative to repo root)
  - alias: `@` → `src/renderer`
- Electron production load path is `dist/index.html` (see `src/main/main.js`).
