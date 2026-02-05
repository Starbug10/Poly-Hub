# Quick Start - Release v4.0.4

## TL;DR - Run This Script

```powershell
# Navigate to project root
cd path\to\Poly-Hub

# Run the automated release script
.\scripts\release-4.0.4.ps1
```

The script will:
1. Delete old broken releases (v4.0.1-4.0.3)
2. Verify version numbers
3. Commit changes
4. Create and push tag v4.0.4
5. Trigger GitHub Actions build

## Manual Steps (If Script Fails)

### 1. Delete Old Releases

**Using GitHub CLI:**
```bash
gh release delete v4.0.1 --yes --repo Starbug10/Poly-Hub
gh release delete v4.0.2 --yes --repo Starbug10/Poly-Hub
gh release delete v4.0.3 --yes --repo Starbug10/Poly-Hub

git push --delete origin v4.0.1
git push --delete origin v4.0.2
git push --delete origin v4.0.3

git tag -d v4.0.1
git tag -d v4.0.2
git tag -d v4.0.3
```

**Or manually:**
- Go to https://github.com/Starbug10/Poly-Hub/releases
- Delete each release (v4.0.1, v4.0.2, v4.0.3)
- Go to https://github.com/Starbug10/Poly-Hub/tags
- Delete each tag

### 2. Create Release

```bash
# Commit all changes
git add .
git commit -m "Version 4.0.4 - Fix blank screen issue in production"

# Create tag
git tag v4.0.4

# Push
git push origin main
git push origin v4.0.4
```

### 3. Monitor Build

1. Go to: https://github.com/Starbug10/Poly-Hub/actions
2. Wait for "Build and Release" workflow to complete (~5-10 minutes)
3. Check for errors

### 4. Verify Release

1. Go to: https://github.com/Starbug10/Poly-Hub/releases
2. Verify v4.0.4 exists with both installers:
   - Poly-Hub-Setup-4.0.4.exe
   - Poly-Hub-Portable-4.0.4.exe
   - latest.yml

### 5. Test

1. Download Poly-Hub-Setup-4.0.4.exe
2. Install on Windows
3. Verify app opens (no blank screen!)
4. Test basic features

## What Was Fixed

**Problem:** Blank screen on startup in production builds

**Cause:** Wrong HTML file path in `src/main/main.js`

**Fix:** Changed from `../dist/index.html` to `../../dist/index.html`

## Files Modified

- ✅ `src/main/main.js` - Fixed path + added logging
- ✅ `version.json` - Updated to 4.0.4
- ✅ `overview.md` - Added troubleshooting
- ✅ `README.md` - Added notice
- ✅ Created release docs

## Need Help?

See detailed documentation:
- `FIX_SUMMARY.md` - Technical details of the fix
- `RELEASE_CHECKLIST.md` - Complete step-by-step guide
- `RELEASE_NOTES_4.0.4.md` - User-facing release notes
- `scripts/delete-old-releases.md` - Detailed deletion instructions

## Rollback (If Needed)

```bash
gh release delete v4.0.4 --yes --repo Starbug10/Poly-Hub
git push --delete origin v4.0.4
git tag -d v4.0.4

# Fix issue, then re-release
git add .
git commit -m "Fix issue"
git tag v4.0.4
git push origin main
git push origin v4.0.4
```
