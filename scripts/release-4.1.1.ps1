# Release script for version 4.1.1
# This script commits version changes, creates a tag, and pushes to trigger the GitHub Actions release workflow

Write-Host "Starting release process for v4.1.1..." -ForegroundColor Green

# Check if there are uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "Committing version changes..." -ForegroundColor Yellow
    git add package.json version.json RELEASE_NOTES_4.1.1.md
    git commit -m "chore: bump version to 4.1.1"
} else {
    Write-Host "No changes to commit" -ForegroundColor Yellow
}

# Create and push tag
Write-Host "Creating tag v4.1.1..." -ForegroundColor Yellow
git tag -a v4.1.1 -m "Release version 4.1.1"

Write-Host "Pushing changes and tag to GitHub..." -ForegroundColor Yellow
git push origin main
git push origin v4.1.1

Write-Host ""
Write-Host "Release process initiated!" -ForegroundColor Green
Write-Host "GitHub Actions will now build and create the release." -ForegroundColor Green
Write-Host "Monitor progress at: https://github.com/Starbug10/Poly-Hub/actions" -ForegroundColor Cyan
