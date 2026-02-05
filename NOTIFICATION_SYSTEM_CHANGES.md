# Notification System Overhaul

## Overview
Replaced the old separate notification windows system with a modern **system overlay** notification system that displays styled windows on top of all applications, even when PolyHub is minimized or in the system tray.

## Recent Fixes (February 2026)
- **Converted to system overlay windows**: Notifications now appear as separate always-on-top windows that work even when app is minimized
- **Increased countdown to 10 seconds**: Changed from 5 to 10 seconds for auto-accept
- **Fixed decline behavior**: Declining a file now properly deletes it from disk before it's added to the gallery
- **Fixed crash caused by missing React dependencies**: Added proper `useCallback` hooks and dependency arrays to prevent stale closures
- **Added null safety checks**: All notification data fields now have fallback values to prevent crashes from malformed data
- **Improved error handling**: Wrapped event handlers and cleanup functions in try-catch blocks
- **Fixed notifications not showing**: Changed notification check from `settings.notifications` to `settings.notifications !== false` to default to enabled when undefined (backwards compatibility)
- **Fixed hook initialization order**: Moved `useCallback` definitions before `useEffect` hooks that depend on them to prevent "Cannot access before initialization" errors

## Status
✅ **FULLY FUNCTIONAL** - Notifications now display as system overlays with 10-second auto-accept countdown

## Key Features 

### 1. **System Overlay Notifications**
- Notifications appear as separate always-on-top windows
- Visible even when PolyHub is minimized or in system tray
- Stack vertically in the bottom-right corner of the screen
- Automatically reposition when notifications are dismissed

### 2. **Queue System**
- Multiple notifications stack vertically
- Each notification is an independent window
- Notifications automatically reposition when one closes

### 3. **10-Second Auto-Accept Countdown**
- Visual countdown timer with circular progress indicator
- Auto-accepts file after 10 seconds if no action is taken
- Countdown is displayed in the accept button: "ACCEPT (10s)"

### 4. **Brutalist Design**
- Dark theme with safety orange accents
- Monospace typography (JetBrains Mono)
- Sharp edges and high contrast
- Matches PolyHub's design language

### 5. **Rich File Information**
- Displays sender's profile picture or initial
- Shows sender name and IP address
- File thumbnail/icon with emoji indicators
- File size and type information
- Warning messages for files exceeding limits

### 6. **User Actions**
- **Accept**: Adds file to gallery and records transfer stats
- **Decline**: Deletes the file from disk immediately (file never appears in gallery)
- **Auto-accept**: After 10 seconds, file is automatically accepted

## Technical Implementation

### New Files Created

1. **`src/main/notification-window.html`**
   - Standalone HTML file for notification windows
   - Self-contained with inline CSS and JavaScript
   - Handles countdown timer and user interactions
   - Communicates with main process via IPC

### Modified Files

1. **`src/main/main.js`**
   - Added `notificationWindows` array to track active notification windows
   - Added `createNotificationWindow()` function to create system overlay windows
   - Added `repositionNotifications()` to restack windows when one closes
   - Updated `file-received` handler to create notification windows instead of sending to renderer
   - Removed old in-app notification IPC handlers

2. **`src/main/store.js`**
   - Updated `getSettings()` to ensure `notifications` defaults to `true` when undefined

### Removed Dependencies

- **In-app notification components** (NotificationManager.jsx, FileNotification.jsx) are no longer used
- Can be kept for future reference or removed

## Behavior Changes

### Before
- Notifications appeared inside the main app window
- Only visible when app window was open and focused
- Required app to be running in foreground

### After
- Notifications appear as system overlay windows
- Always visible on top of all applications
- Work even when app is minimized to system tray
- 10-second countdown (increased from 5 seconds)
- Declining properly deletes file from disk

## Settings Integration

The notification system respects the existing settings:
- **Enable Notifications**: Controls whether notification windows appear at all
- When disabled, files are auto-accepted without showing notifications

## Testing Recommendations

1. Test with notifications enabled/disabled
2. Test with multiple files sent simultaneously (stacking)
3. Test with files exceeding size limits (warning display)
4. Test with app minimized to tray
5. Test with app completely closed (should still work if app is running in background)
6. Test accept/decline actions
7. Test auto-accept countdown (10 seconds)
8. Test that declined files are deleted from disk

## Future Enhancements (Optional)

- Add sound effects for incoming files
- Add notification history/log
- Add "Accept All" button when multiple files are queued
- Add notification preferences (countdown duration, position, etc.)
- Add theme support (light/dark mode)
