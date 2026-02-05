const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow;

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// IMPORTANT: Disable signature verification for unsigned builds
// Remove this in production with proper code signing
autoUpdater.forceDevUpdateConfig = true;

// Set update feed URL explicitly
autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Starbug10',
    repo: 'Poly-Hub'
});

function setupAutoUpdater(window) {
    mainWindow = window;

    // Check for updates on startup (after 3 seconds)
    setTimeout(() => {
        console.log('[AUTO-UPDATER] Checking for updates...');
        autoUpdater.checkForUpdates();
    }, 3000);

    // Check for updates every 6 hours
    setInterval(() => {
        console.log('[AUTO-UPDATER] Periodic update check...');
        autoUpdater.checkForUpdates();
    }, 6 * 60 * 60 * 1000);

    autoUpdater.on('checking-for-update', () => {
        console.log('[AUTO-UPDATER] Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[AUTO-UPDATER] Update available:', info.version);
        console.log('[AUTO-UPDATER] Release date:', info.releaseDate);
        console.log('[AUTO-UPDATER] Files:', info.files);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `A new version (${info.version}) is available!`,
            detail: 'Would you like to download and install it now? The app will restart after installation.',
            buttons: ['Download & Install', 'Later'],
            defaultId: 0,
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                console.log('[AUTO-UPDATER] User accepted update, downloading...');
                console.log('[AUTO-UPDATER] Download URL:', autoUpdater.getFeedURL());

                try {
                    autoUpdater.downloadUpdate();
                    console.log('[AUTO-UPDATER] Download started successfully');
                } catch (err) {
                    console.error('[AUTO-UPDATER] Failed to start download:', err);
                    dialog.showMessageBox(mainWindow, {
                        type: 'error',
                        title: 'Download Failed',
                        message: 'Failed to start download',
                        detail: err.message,
                        buttons: ['OK']
                    });
                }

                // Show downloading notification
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update:downloading');
                }
            } else {
                console.log('[AUTO-UPDATER] User postponed update');
            }
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('[AUTO-UPDATER] Update not available. Current version:', info.version);
    });

    autoUpdater.on('error', (err) => {
        console.error('[AUTO-UPDATER] Error:', err);
        console.error('[AUTO-UPDATER] Error message:', err.message);
        console.error('[AUTO-UPDATER] Error stack:', err.stack);

        // Show error to user
        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Update Error',
            message: 'Failed to download update',
            detail: `Error: ${err.message}\n\nPlease try downloading the update manually from GitHub.`,
            buttons: ['OK']
        });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        console.log(`[AUTO-UPDATER] Download progress: ${percent}%`);

        // Send progress to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:progress', percent);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AUTO-UPDATER] Update downloaded:', info.version);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: 'Update downloaded successfully!',
            detail: 'The app will now restart to install the update.',
            buttons: ['Restart Now'],
            defaultId: 0
        }).then(() => {
            console.log('[AUTO-UPDATER] Installing update and restarting...');
            autoUpdater.quitAndInstall(false, true);
        });
    });
}

module.exports = { setupAutoUpdater };
