# PowerShell Script to Release Version 4.0.4
# This script automates the release process for Poly-Hub

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Poly-Hub Release Script - Version 4.0.4" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if gh CLI is installed
$ghInstalled = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghInstalled) {
    Write-Host "WARNING: GitHub CLI (gh) is not installed." -ForegroundColor Yellow
    Write-Host "You can install it from: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host "Or proceed with manual deletion of old releases." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue without gh CLI? (y/n)"
    if ($continue -ne "y") {
        exit
    }
}
else {
    Write-Host "✓ GitHub CLI detected" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 1: Delete Old Broken Releases" -ForegroundColor Yellow
Write-Host "-----------------------------------" -ForegroundColor Yellow

if ($ghInstalled) {
    $deleteOld = Read-Host "Delete releases v4.0.1, v4.0.2, v4.0.3? (y/n)"
    if ($deleteOld -eq "y") {
        Write-Host "Deleting old releases..." -ForegroundColor Cyan
        
        $versions = @("v4.0.1", "v4.0.2", "v4.0.3")
        foreach ($version in $versions) {
            Write-Host "  Deleting release $version..." -ForegroundColor Gray
            gh release delete $version --yes --repo Starbug10/Poly-Hub 2>$null
            
            Write-Host "  Deleting remote tag $version..." -ForegroundColor Gray
            git push --delete origin $version 2>$null
            
            Write-Host "  Deleting local tag $version..." -ForegroundColor Gray
            git tag -d $version 2>$null
        }
        
        Write-Host "✓ Old releases deleted" -ForegroundColor Green
    }
}
else {
    Write-Host "Please delete old releases manually:" -ForegroundColor Yellow
    Write-Host "  1. Go to https://github.com/Starbug10/Poly-Hub/releases" -ForegroundColor Gray
    Write-Host "  2. Delete v4.0.1, v4.0.2, v4.0.3" -ForegroundColor Gray
    Write-Host "  3. Delete corresponding tags" -ForegroundColor Gray
    $continue = Read-Host "Press Enter when done..."
}

Write-Host ""
Write-Host "Step 2: Verify Changes" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

# Check if version.json is updated
$versionJson = Get-Content "version.json" -Raw | ConvertFrom-Json
if ($versionJson.version -eq "4.0.4") {
    Write-Host "✓ version.json is 4.0.4" -ForegroundColor Green
}
else {
    Write-Host "✗ version.json is not 4.0.4 (found: $($versionJson.version))" -ForegroundColor Red
    exit
}

# Check if package.json is updated
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
if ($packageJson.version -eq "4.0.4") {
    Write-Host "✓ package.json is 4.0.4" -ForegroundColor Green
}
else {
    Write-Host "✗ package.json is not 4.0.4 (found: $($packageJson.version))" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "Step 3: Commit and Tag" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "Uncommitted changes detected:" -ForegroundColor Cyan
    git status --short
    Write-Host ""
    
    $commit = Read-Host "Commit these changes? (y/n)"
    if ($commit -eq "y") {
        git add .
        git commit -m "Version 4.0.4 - Fix blank screen issue in production

- Fixed incorrect HTML path in production build
- Added comprehensive logging and error handling
- Updated version to 4.0.4
- Deprecated versions 4.0.1-4.0.3"
        Write-Host "✓ Changes committed" -ForegroundColor Green
    }
    else {
        Write-Host "Aborting release." -ForegroundColor Red
        exit
    }
}
else {
    Write-Host "✓ No uncommitted changes" -ForegroundColor Green
}

# Create tag
Write-Host ""
$createTag = Read-Host "Create tag v4.0.4? (y/n)"
if ($createTag -eq "y") {
    git tag v4.0.4
    Write-Host "✓ Tag v4.0.4 created" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 4: Push to GitHub" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Yellow

$push = Read-Host "Push to GitHub? This will trigger the build. (y/n)"
if ($push -eq "y") {
    Write-Host "Pushing main branch..." -ForegroundColor Cyan
    git push origin main
    
    Write-Host "Pushing tag v4.0.4..." -ForegroundColor Cyan
    git push origin v4.0.4
    
    Write-Host "✓ Pushed to GitHub" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Release process initiated!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Monitor GitHub Actions: https://github.com/Starbug10/Poly-Hub/actions" -ForegroundColor Gray
    Write-Host "  2. Wait for build to complete (~5-10 minutes)" -ForegroundColor Gray
    Write-Host "  3. Verify release: https://github.com/Starbug10/Poly-Hub/releases" -ForegroundColor Gray
    Write-Host "  4. Download and test the installer" -ForegroundColor Gray
    Write-Host ""
}
else {
    Write-Host "Release cancelled. You can push manually later:" -ForegroundColor Yellow
    Write-Host "  git push origin main" -ForegroundColor Gray
    Write-Host "  git push origin v4.0.4" -ForegroundColor Gray
}
