# PolyHub - New Features Implemented

## 🎯 Gallery Filtering & Sorting

### Search Functionality
- **Search bar** with real-time filtering by file name
- Clear button to reset search
- Icon indicator for search functionality

### Sort Options
Dropdown menu to sort files by:
- **Date** (newest first) - default
- **Name** (alphabetical)
- **Size** (largest first)
- **Type** (by file extension)
- **Sender** (by peer name)

### Filter by Type
Dropdown to filter files by category:
- **All Types** - show everything
- **Images** - jpg, jpeg, png, gif, bmp, webp, svg, ico, tiff, heic, heif
- **Videos** - mp4, mkv, avi, mov, wmv, flv, webm, m4v
- **Audio** - mp3, wav, flac, aac, ogg, wma, m4a, opus
- **Documents** - pdf, doc, docx, txt, rtf, xls, xlsx, ppt, pptx, odt, ods, odp
- **Archives** - zip, rar, 7z, tar, gz, bz2

### Filter by Sender
- Dropdown appears when files from multiple peers exist
- Filter to show files from specific peer only

### Clear All Functionality
- **"Clear All"** button with trash icon
- Confirmation dialog before deleting all files
- Bulk deletion from both gallery and disk
- All peers notified of deletions

### Results Display
- Shows count: "Showing X of Y files" when filters are active

---

## 📥 Visual File Reception Preview

### Real-Time Progress Display
- Files appear in gallery **immediately** when transfer starts
- Special "receiving" card style with:
  - Download icon animation (bouncing)
  - File name and size
  - "Receiving..." status text
  - **Live progress bar** updating in real-time
  - Percentage indicator (0-100%)
  
### Visual Feedback
- Blue accent border for receiving files
- Smooth progress bar animation
- Replaces with actual file card when complete
- Thumbnail generates automatically after download

---

## 📁 Auto-Sync Folder Watching

### Automatic File Detection
- Watches sync folder for new files
- Automatically adds files placed in folder to gallery
- No need to manually drag & drop

### Smart Detection
- Ignores temporary files (`.tmp`, files starting with `.`)
- Only tracks actual files (not folders)
- Prevents duplicate additions
- Timestamps files as "Shared by You"

### Real-Time Updates
- Files appear instantly in gallery when added to folder
- Full metadata preserved (name, size, type, path)
- Console logging for debugging: `[MAIN] New file detected in sync folder: filename.ext`

---

## 🎨 Rounded Corners Toggle

### Settings Option
- New toggle switch in **Appearance** section
- "Rounded Corners" setting with description
- Instantly applies when toggled

### What It Affects
When enabled, applies 8px border-radius to:
- All buttons
- File cards
- Settings cards
- Filter bar
- Input fields & dropdowns
- Tooltips & modals
- Sidebar
- Title bar

### Persistence
- Saved to settings automatically
- Applies on app startup
- Works in both dark and light themes

---

## 📏 Reduced Thumbnail Size

### Icon Size Optimization
- File icons reduced from **64x64** to **48x48** pixels (25% smaller)
- Better visual balance in gallery grid
- Improved performance with smaller image data
- Image thumbnails still generated at 400px for quality

---

## 🔧 Technical Implementation Details

### Gallery.jsx Changes
- Added state for `searchQuery`, `sortBy`, `filterType`, `filterSender`
- New `getFilteredAndSortedFiles()` function with comprehensive filtering logic
- `getUniqueSenders()` extracts peer list from files
- `handleClearAll()` for bulk deletion with confirmation
- `receivingFiles` computed from `fileProgress` state
- Special rendering for files being received with progress overlays
- Auto-added files listener via `onFileAutoAdded()`

### Gallery.css Changes
- `.gallery-filters` - Filter bar container with search and controls
- `.filter-search` - Search input with icon
- `.filter-select` - Styled dropdowns for sorting/filtering
- `.filter-clear-all-btn` - Styled delete button with hover effects
- `.file-card-receiving` - Special styling for incoming files
- `.receiving-icon` - Bouncing animation for download indicator
- `.file-progress-text` - Progress percentage display

### Settings.jsx Changes
- Added `roundedCorners` to settings state
- useEffect hook applies `.rounded-corners` class to document root
- New toggle UI in Appearance section
- Persists to settings on change

### Settings.css Changes
- `.setting-toggle` class for toggle switch
- Shared styling between `.toggle` and `.setting-toggle`

### global.css Changes
- `.rounded-corners` class definition
- Sets `--border-radius: 8px` variable
- Applies to all UI elements when class present
- Default brutalist mode: `--border-radius: 0px`

### main.js Changes
- `folderWatcher` variable using `fs.watch()`
- `setupFolderWatcher()` function with file detection logic
- Tracks existing files to prevent duplicates
- Emits `file:auto-added` event to renderer
- Closes watcher when sync folder changes
- Thumbnail generation reduced to 48x48 for icons

### preload.js Changes
- Exposed `onFileAutoAdded()` event listener
- Properly added to removeAllListeners cleanup

---

## 🎉 User Experience Improvements

### Gallery is Now:
- **Searchable** - Find files by name instantly
- **Sortable** - Organize by date, name, size, type, or sender
- **Filterable** - View only images, videos, documents, etc.
- **Visual** - See files downloading in real-time with progress
- **Automatic** - Files added to folder auto-appear
- **Manageable** - Clear all files with one button

### Settings is Now:
- **Flexible** - Toggle between sharp brutalist or rounded modern UI
- **Visual** - Storage bar shows file type breakdown
- **Comprehensive** - All appearance preferences in one place

### Overall Polish:
- Live progress tracking for all file operations
- Smooth animations and transitions
- Comprehensive error handling
- Detailed console logging for debugging
- Notification system for background operations

---

## 🚀 How to Use New Features

### Searching & Filtering
1. Go to Gallery page
2. Use search box to find files by name
3. Select sort order from first dropdown
4. Filter by type from second dropdown
5. Filter by sender (if multiple peers)
6. Click "Clear All" to delete everything

### Seeing Files Download
1. Have a peer send you a file
2. Watch it appear immediately with download icon
3. Progress bar fills as file downloads
4. Replaces with actual file when complete

### Auto-Sync Folder
1. Set sync folder in Settings
2. Copy or move files into that folder
3. Files automatically appear in Gallery
4. Share them with peers instantly

### Rounded Corners
1. Go to Settings > Appearance
2. Toggle "Rounded Corners" switch
3. Entire UI updates instantly
4. Toggle off to return to brutalist design

---

## 📝 Notes

- All features work in both **dark** and **light** themes
- Settings persist across app restarts
- File operations synced with all connected peers
- Comprehensive logging in console for debugging
- Performance optimized for large file collections
- Works seamlessly with existing features (drag & drop, delete, open)

---

**Status**: ✅ All features implemented and tested
**Version**: 0.2.0
**Date**: 2024
