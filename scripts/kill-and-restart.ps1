# Kill any running Electron processes for Poly-Hub
Write-Host "Killing any running Poly-Hub processes..." -ForegroundColor Yellow

# Kill Electron processes
Get-Process | Where-Object { $_.ProcessName -like "*electron*" -or $_.MainWindowTitle -like "*Poly-Hub*" } | ForEach-Object {
    Write-Host "Killing process: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Red
    Stop-Process -Id $_.Id -Force
}

# Wait a moment for ports to free up
Write-Host "Waiting for ports to free up..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Check if ports are free
$port47777 = Get-NetTCPConnection -LocalPort 47777 -ErrorAction SilentlyContinue
$port47778 = Get-NetTCPConnection -LocalPort 47778 -ErrorAction SilentlyContinue

if ($port47777) {
    Write-Host "WARNING: Port 47777 is still in use!" -ForegroundColor Red
    $port47777 | ForEach-Object {
        $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "  Owned by: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Red
            Write-Host "  Killing process..." -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force
        }
    }
}

if ($port47778) {
    Write-Host "WARNING: Port 47778 is still in use!" -ForegroundColor Red
    $port47778 | ForEach-Object {
        $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "  Owned by: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Red
            Write-Host "  Killing process..." -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force
        }
    }
}

# Wait again
Start-Sleep -Seconds 2

Write-Host "`nAll processes killed. Ports should be free now." -ForegroundColor Green
Write-Host "You can now run: npm run dev" -ForegroundColor Cyan
