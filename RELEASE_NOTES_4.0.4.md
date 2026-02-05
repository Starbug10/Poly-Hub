# Release Notes - Version 4.0.4

## Critical Bug Fix

### Fixed: Blank Screen on Startup (Production Build)
**Issue:** Versions 4.0.1, 4.0.2, and 4.0.3 failed to load in production, showing only a blank screen with no window controls.

**Root Cause:** Incorrect file path resolution in `main.js` when loading the renderer HTML file. The app was looking for `../dist/index.html` relative to the main process, but in the packaged application, the correct path is `../../dist/index.html`.

**Fix Applied:**
- Updated production HTML loading path in `src/main/main.js`
- Added comprehensive logging for debugging load failures
- Added error handler for `did-fail-load` events

### Changes in 4.0.4
- ✅ Fixed production build blank screen issue
- ✅ Enhanced logging for troubleshooting
- ✅ Improved error handling during app initialization
- ✅ Updated build date to February 5, 2026

## Installation
Download and run `Poly-Hub-Setup-4.0.4.exe` for the full installer, or `Poly-Hub-Portable-4.0.4.exe` for the portable version.

## Auto-Update
Users on versions 4.0.1-4.0.3 will need to manually download and install 4.0.4 since those versions cannot run. Future updates will work automatically.

## Technical Details
- **Build System:** Electron 28.1.0 + Vite 5.0.10
- **Target Platform:** Windows x64
- **Installer Types:** NSIS (Setup) and Portable
- **Auto-Update:** Enabled via electron-updater

---

**Note:** Versions 4.0.1, 4.0.2, and 4.0.3 are deprecated and should not be used.
