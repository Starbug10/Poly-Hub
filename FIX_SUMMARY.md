# Fix Summary - Blank Screen Issue (v4.0.1-4.0.3)

## Problem
Versions 4.0.1, 4.0.2, and 4.0.3 failed to launch in production, showing only a blank screen with no window controls or UI elements.

## Root Cause
**Incorrect file path in production build**

In `src/main/main.js`, the app was trying to load the renderer HTML from:
```javascript
mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
```

However, in the packaged Electron app, the directory structure is:
```
app.asar/
├── src/
│   └── main/
│       └── main.js  (this is __dirname)
└── dist/
    └── index.html
```

The correct path should be `../../dist/index.html` (up two levels from `src/main/`).

## Solution Applied

### 1. Fixed Production Path
**File:** `src/main/main.js` (lines 38-48)

**Before:**
```javascript
} else {
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  if (!process.argv.includes('--hidden')) {
    mainWindow.show();
  }
}
```

**After:**
```javascript
} else {
  // In production, dist is at the app root level
  const indexPath = path.join(__dirname, '../../dist/index.html');
  console.log('[MAIN] Loading production HTML from:', indexPath);
  mainWindow.loadFile(indexPath);
  // Check if app was started with --hidden flag or on startup
  if (!process.argv.includes('--hidden')) {
    mainWindow.show();
  }
}
```

### 2. Enhanced Logging
**File:** `src/main/main.js` (lines 50-60)

Added comprehensive logging to help debug future issues:
```javascript
mainWindow.once('ready-to-show', () => {
  console.log('[MAIN] Window ready to show');
  if (!process.argv.includes('--hidden') || isDev) {
    mainWindow.show();
    console.log('[MAIN] Window shown');
  } else {
    console.log('[MAIN] Window hidden (started with --hidden flag)');
  }
});

mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
  console.error('[MAIN] Failed to load:', errorCode, errorDescription);
});
```

### 3. Version Updates
- **version.json**: Updated to 4.0.4 with build date 2026-02-05
- **package.json**: Already at 4.0.4
- **overview.md**: Added troubleshooting entry for blank screen issue

## Files Changed
1. `src/main/main.js` - Fixed path and added logging
2. `version.json` - Updated version and date
3. `overview.md` - Added troubleshooting info
4. `README.md` - Added notice about the fix
5. Created release documentation:
   - `RELEASE_NOTES_4.0.4.md`
   - `RELEASE_CHECKLIST.md`
   - `scripts/delete-old-releases.md`
   - `scripts/release-4.0.4.ps1`

## Testing Recommendations

### Before Release
1. Build the app: `npm run build`
2. Check `dist-electron/` for the installers
3. Install on a clean Windows machine
4. Verify the app opens without blank screen
5. Test basic functionality (navigation, settings, etc.)

### After Release
1. Download from GitHub releases
2. Install and verify
3. Check auto-update functionality
4. Monitor for user reports

## Why This Happened

The issue likely occurred during one of these scenarios:
1. Vite config change that modified output directory
2. Electron-builder packaging structure change
3. Path was never tested in production (only dev mode)
4. Copy-paste error from another project with different structure

## Prevention for Future

1. **Always test production builds** before releasing
2. **Add path validation** in development to catch these issues
3. **Use absolute paths** or `app.getAppPath()` for critical resources
4. **Add comprehensive logging** for debugging production issues
5. **Test installers** on clean machines, not just dev environments

## Impact

- **Affected versions**: 4.0.1, 4.0.2, 4.0.3
- **Severity**: Critical (app completely unusable)
- **Users affected**: All users who installed these versions
- **Workaround**: None (must upgrade to 4.0.4)
- **Auto-update**: Will NOT work for affected versions (they can't run)

## Release Plan

1. Delete broken releases (4.0.1, 4.0.2, 4.0.3) from GitHub
2. Delete corresponding tags
3. Commit fixes and create v4.0.4 tag
4. Push to trigger GitHub Actions build
5. Verify release artifacts
6. Test downloaded installer
7. Announce fix to users

## Additional Notes

- The NSIS installer will automatically replace old installations
- User settings in `%APPDATA%\poly-hub\` are preserved
- Sync folder in `Documents\PolyHub\` is preserved
- Once users upgrade to 4.0.4, future auto-updates will work correctly
