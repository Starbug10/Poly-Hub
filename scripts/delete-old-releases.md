# Delete Old Releases Script

Since GitHub CLI or API is needed to delete releases, here are the manual steps:

## Option 1: Using GitHub Web Interface

1. Go to: https://github.com/Starbug10/Poly-Hub/releases
2. For each release (v4.0.1, v4.0.2, v4.0.3):
   - Click on the release
   - Click "Delete" button at the bottom
   - Confirm deletion
3. Go to: https://github.com/Starbug10/Poly-Hub/tags
4. Delete the corresponding tags (v4.0.1, v4.0.2, v4.0.3)

## Option 2: Using GitHub CLI (gh)

If you have GitHub CLI installed, run these commands:

```bash
# Delete releases
gh release delete v4.0.1 --yes --repo Starbug10/Poly-Hub
gh release delete v4.0.2 --yes --repo Starbug10/Poly-Hub
gh release delete v4.0.3 --yes --repo Starbug10/Poly-Hub

# Delete tags
git push --delete origin v4.0.1
git push --delete origin v4.0.2
git push --delete origin v4.0.3

# Delete local tags
git tag -d v4.0.1
git tag -d v4.0.2
git tag -d v4.0.3
```

## Option 3: Using PowerShell with GitHub API

```powershell
# Set your GitHub token
$token = "YOUR_GITHUB_TOKEN"
$repo = "Starbug10/Poly-Hub"
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# Get all releases
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Headers $headers

# Delete specific releases
$versionsToDelete = @("v4.0.1", "v4.0.2", "v4.0.3")
foreach ($version in $versionsToDelete) {
    $release = $releases | Where-Object { $_.tag_name -eq $version }
    if ($release) {
        Write-Host "Deleting release $version (ID: $($release.id))"
        Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/$($release.id)" -Method Delete -Headers $headers
    }
}

# Delete tags
foreach ($version in $versionsToDelete) {
    git push --delete origin $version
    git tag -d $version
}
```

## After Deletion

Once old releases are deleted, create the new v4.0.4 release:

```bash
git add .
git commit -m "Version 4.0.4 - Fix blank screen issue in production"
git tag v4.0.4
git push origin main
git push origin v4.0.4
```

The GitHub Actions workflow will automatically build and create the release.
