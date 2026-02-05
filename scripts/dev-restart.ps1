# Kill any existing Poly-Hub or Electron processes
Write-Host "Stopping existing Poly-Hub processes..." -ForegroundColor Yellow
Stop-Process -Name "Poly-Hub","electron" -Force -ErrorAction SilentlyContinue

# Wait a moment for ports to free
Start-Sleep -Seconds 2

Write-Host "Starting dev server..." -ForegroundColor Green
npm run dev
