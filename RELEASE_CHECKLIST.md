# Release Checklist for Version 4.0.4

## Pre-Release Steps

### 1. Delete Old Broken Releases
Follow the instructions in `scripts/delete-old-releases.md` to remove v4.0.1, v4.0.2, and v4.0.3.

**Quick method using GitHub CLI:**
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

### 2. Verify Changes
- [x] Fixed production HTML path in `src/main/main.js`
- [x] Added logging for debugging
- [x] Added error handler for load failures
- [x] Updated `version.json` to 4.0.4
- [x] Updated `package.json` to 4.0.4
- [x] Updated `overview.md` with troubleshooting info
- [x] Created release notes

### 3. Test Locally (Optional but Recommended)
```bash
# Install dependencies
npm install

# Test dev mode
npm run dev

# Build production
npm run build

# Test the built app
# The installer will be in dist-electron/
```

## Release Steps

### 4. Commit and Tag
```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Version 4.0.4 - Fix blank screen issue in production

- Fixed incorrect HTML path in production build
- Added comprehensive logging and error handling
- Updated version to 4.0.4
- Deprecated versions 4.0.1-4.0.3"

# Create tag
git tag v4.0.4

# Push to GitHub
git push origin main
git push origin v4.0.4
```

### 5. Monitor GitHub Actions
1. Go to: https://github.com/Starbug10/Poly-Hub/actions
2. Watch the "Build and Release" workflow
3. Ensure it completes successfully
4. Check for any errors in the build logs

### 6. Verify Release
1. Go to: https://github.com/Starbug10/Poly-Hub/releases
2. Verify v4.0.4 release was created
3. Check that both installers are attached:
   - `Poly-Hub-Setup-4.0.4.exe`
   - `Poly-Hub-Portable-4.0.4.exe`
4. Verify `latest.yml` is present (for auto-updates)

### 7. Test the Release
1. Download `Poly-Hub-Setup-4.0.4.exe`
2. Install on a clean Windows machine
3. Verify the app opens correctly (no blank screen)
4. Test basic functionality:
   - Window controls work
   - Settings page loads
   - Gallery page loads
   - Onboarding appears if no profile

## Post-Release

### 8. Update Documentation
- [x] Release notes created (`RELEASE_NOTES_4.0.4.md`)
- [ ] Update README.md if needed
- [ ] Announce the fix to users

### 9. Monitor for Issues
- Check for any user reports of issues
- Monitor GitHub Issues
- Be ready to create 4.0.5 if needed

## Rollback Plan (If Needed)

If 4.0.4 has issues:
```bash
# Delete the bad release
gh release delete v4.0.4 --yes --repo Starbug10/Poly-Hub
git push --delete origin v4.0.4
git tag -d v4.0.4

# Fix the issue
# ... make changes ...

# Re-release
git add .
git commit -m "Version 4.0.4 - Fix [issue]"
git tag v4.0.4
git push origin main
git push origin v4.0.4
```

## Notes

- **Auto-update will NOT work for users on 4.0.1-4.0.3** because those versions don't run. Users must manually download 4.0.4.
- Once users are on 4.0.4, future auto-updates will work correctly.
- The NSIS installer will automatically replace any existing installation.
- User settings and files in `Documents/PolyHub` are preserved during updates.
