# Notification System Overhaul

## Overview
Replaced the old separate notification windows system with a modern in-app notification system that displays styled modals in the top-right corner of the main window.

## Key Features

### 1. **In-App Notifications**
- Notifications now appear as styled modals within the main window (top-right corner)
- No more separate notification windows that can get lost or misplaced

### 2. **Queue System**
- Maximum of 2 notifications visible on screen at once
- Additional notifications are queued and shown automatically when space becomes available
- Each notification only starts its countdown when it becomes visible

### 3. **5-Second Auto-Accept Countdown**
- Visual countdown timer with circular progress indicator
- Auto-accepts file after 5 seconds if no action is taken
- Countdown is displayed in the accept button: "ACCEPT (5s)"

### 4. **Theme Integration**
- Notifications automatically match the user's selected theme (dark/light)
- Uses the user's chosen accent color for borders, buttons, and highlights
- Supports rounded corners setting
- Fully responsive to theme changes

### 5. **Rich File Information**
- Displays sender's profile picture or initial
- Shows sender name and IP address
- File thumbnail/icon with emoji indicators
- File size and type information
- Warning messages for files exceeding limits

### 6. **User Actions**
- **Accept**: Adds file to gallery and records transfer stats
- **Decline**: Deletes the file from disk immediately
- **Auto-accept**: After 5 seconds, file is automatically accepted

## Technical Implementation

### New Files Created

1. **`src/renderer/components/FileNotification.jsx`**
   - Individual notification component
   - Handles countdown timer and animations
   - Displays file info, sender details, and action buttons

2. **`src/renderer/components/FileNotification.css`**
   - Styled to match app theme
   - Slide-in/slide-out animations
   - Responsive positioning for stacked notifications

3. **`src/renderer/components/NotificationManager.jsx`**
   - Manages notification queue
   - Limits visible notifications to 2 at a time
   - Handles IPC communication with main process

### Modified Files

1. **`src/renderer/App.jsx`**
   - Added `NotificationManager` component
   - Renders notification system when user is logged in

2. **`src/main/preload.js`**
   - Added `acceptFile()` and `declineFile()` IPC methods
   - Added `onFileNotification()` event listener

3. **`src/main/main.js`**
   - Removed `notificationWindows` array and `createNotificationWindow()` function
   - Updated `file-received` handler to send notifications to renderer instead of creating windows
   - Changed notification IPC handlers from `ipcMain.on()` to `ipcMain.handle()` for better async handling
   - Notifications now always show when enabled (not just for files exceeding limits)

### Removed Files
- **`src/main/notification-overlay.html`** - No longer needed (can be deleted)

## Behavior Changes

### Before
- Separate notification windows appeared as floating overlays
- Only showed notifications for files exceeding limits
- 30-second timeout that declined the file
- Windows could get lost behind other applications

### After
- Notifications appear in-app at top-right corner
- Shows notifications for ALL incoming files when notifications are enabled
- 5-second countdown that auto-accepts the file
- Always visible within the main window
- Queue system prevents notification overload
- Matches user's theme and accent color preferences

## Settings Integration

The notification system respects the existing settings:
- **Enable Notifications**: Controls whether notifications appear at all
- **Theme**: Dark/light mode automatically applied
- **Accent Color**: Used for borders, buttons, and highlights
- **Rounded Corners**: Applied to notification borders and buttons

## Testing Recommendations

1. Test with notifications enabled/disabled
2. Test with multiple files sent simultaneously (queue system)
3. Test with files exceeding size limits (warning display)
4. Test theme switching while notifications are visible
5. Test accent color changes
6. Test auto-accept countdown
7. Test accept/decline actions
8. Test with app minimized to tray (notifications should queue until window is shown)

## Future Enhancements (Optional)

- Add sound effects for incoming files
- Add notification history/log
- Add "Accept All" button when multiple files are queued
- Add drag-to-reorder for queued notifications
- Add notification preferences (countdown duration, max visible, etc.)
