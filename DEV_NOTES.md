# Developer Notes

## Port Conflict Issues ("EADDRINUSE")

### Problem
If you see this error when starting the app:
```
Error: listen EADDRINUSE: address already in use 0.0.0.0:47777
```

This means another instance of Poly-Hub is already running and occupying ports 47777 (peer server) and 47778 (file transfer).

### Quick Fix
Use the convenience script that automatically kills old processes:

```powershell
npm run dev:restart
```

### Manual Fix
If you prefer to do it manually:

```powershell
# Kill all Poly-Hub processes
Stop-Process -Name "Poly-Hub" -Force

# Wait a moment
Start-Sleep -Seconds 2

# Start dev server
npm run dev
```

### What Was Fixed
1. **Better error messages**: The app now shows a clear dialog if ports are in use
2. **Graceful shutdown**: The peer server properly closes both TCP servers on quit
3. **Auto-quit on conflict**: If ports are in use, the app will show an error dialog and quit rather than leaving a broken instance running
4. **Dev helper script**: `npm run dev:restart` automatically cleans up old processes before starting

### Architecture Notes
- **Port 47777**: Main peer-to-peer communication (pairing, metadata, deletion notifications)
- **Port 47778**: File transfer server (actual file data streaming)
- Both servers must be available for the app to function correctly
- The app uses TCP sockets (not HTTP) for peer communication over Tailscale

## System Tray & Background Mode

### Behavior
- **Closing the window** now minimizes to system tray instead of quitting
- The app continues running in the background so you can receive files
- Right-click the tray icon to access quick shortcuts or quit
- Double-click the tray icon to restore the window

### Tray Menu Options
1. **Show Poly-Hub** - Restore and focus the main window
2. **Transfers** - Jump directly to the Transfers page
3. **Statistics** - Jump directly to the Statistics page
4. **Quit Poly-Hub** - Fully quit the application

### First-Time User Experience
- On the first minimize to tray, users see a notification explaining the behavior
- This notification only shows once (tracked in settings)

## Tailscale Auto-Start

### What It Does
- Poly-Hub automatically attempts to start Tailscale when launched
- Checks common installation locations:
  - `C:\Program Files\Tailscale\tailscale-ipn.exe`
  - `C:\Program Files (x86)\Tailscale\tailscale-ipn.exe`
  - `%LOCALAPPDATA%\Tailscale\tailscale-ipn.exe`

### Error Handling
- If Tailscale is already running, the error is logged but ignored (expected behavior)
- If Tailscale isn't found, a warning is logged but the app continues normally
- The app will still work if Tailscale is started manually later
