# Task 13 — enable `pnpm` on Windows without admin / corepack EPERM.
# Run once:  powershell -ExecutionPolicy Bypass -File scripts/setup-pnpm-windows.ps1
# Then open a NEW terminal and run:  pnpm --version

$ErrorActionPreference = "Stop"
$npmPrefix = npm config get prefix 2>$null
if (-not $npmPrefix) { $npmPrefix = "$env:APPDATA\npm" }

Write-Host "npm global prefix: $npmPrefix"

# Option A: install pnpm to user-writable prefix (no admin)
Write-Host "Installing pnpm@9.15.4 to $npmPrefix ..."
npm install -g pnpm@9.15.4

# Ensure prefix is on USER Path (persistent)
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$npmPrefix*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$npmPrefix", "User")
  Write-Host "Added $npmPrefix to user PATH"
} else {
  Write-Host "User PATH already contains npm prefix"
}

# Option B fallback: PowerShell function in profile
$profileDir = Split-Path $PROFILE -Parent
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
$shim = @'

function pnpm { npx --yes pnpm@9.15.4 @args }
'@
if (-not (Test-Path $PROFILE) -or -not (Select-String -Path $PROFILE -Pattern "function pnpm" -Quiet)) {
  Add-Content -Path $PROFILE -Value $shim
  Write-Host "Added pnpm { npx ... } fallback to $PROFILE"
}

Write-Host "Done. Open a NEW PowerShell window and run: pnpm --version"
