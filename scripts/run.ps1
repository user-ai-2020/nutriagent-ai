$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "$root\.env")) {
  Write-Host "ERROR: .env not found at $root\.env" -ForegroundColor Red
  exit 1
}

Write-Host "Project root: $root" -ForegroundColor Cyan
Write-Host "Loading .env..." -ForegroundColor Cyan
Get-Content "$root\.env" | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

Write-Host "Building packages..." -ForegroundColor Cyan
Push-Location "$root\packages\shared"
npx tsc
Pop-Location
Push-Location "$root\packages\db"
npx tsc
Pop-Location

Write-Host "Starting Docker..." -ForegroundColor Cyan
docker compose -f "$root\docker-compose.yml" up -d

$ports = 3000..3006
foreach ($port in $ports) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
  }
}

$services = @(
  @{ Name = "GraphDB Agent";   Dir = "services\graphdb-agent" },
  @{ Name = "Text2SQL Agent";  Dir = "services\text2sql-agent" },
  @{ Name = "RAG Agent";       Dir = "services\rag-agent" },
  @{ Name = "Nutrition Agent"; Dir = "services\nutrition-agent" },
  @{ Name = "Vision Agent";    Dir = "services\vision-agent" },
  @{ Name = "Orchestrator";    Dir = "services\orchestrator" },
  @{ Name = "API Gateway";     Dir = "services\api-gateway" }
)

foreach ($svc in $services) {
  $dir = Join-Path $root $svc.Dir
  if (-not (Test-Path $dir)) {
    Write-Host "ERROR: Missing directory $dir" -ForegroundColor Red
    continue
  }
  Write-Host "Starting $($svc.Name)..." -ForegroundColor Green
  $cmd = @"
Set-Location '$dir'
`$env:DATABASE_URL='$($env:DATABASE_URL)'
`$env:REDIS_URL='$($env:REDIS_URL)'
`$env:JWT_SECRET='$($env:JWT_SECRET)'
`$env:OPENROUTER_API_KEY='$($env:OPENROUTER_API_KEY)'
`$env:OPENROUTER_MODEL='$($env:OPENROUTER_MODEL)'
`$env:OPENROUTER_VISION_MODEL='$($env:OPENROUTER_VISION_MODEL)'
`$env:ORCHESTRATOR_URL='$($env:ORCHESTRATOR_URL)'
`$env:VISION_AGENT_URL='$($env:VISION_AGENT_URL)'
`$env:NUTRITION_AGENT_URL='$($env:NUTRITION_AGENT_URL)'
`$env:RAG_AGENT_URL='$($env:RAG_AGENT_URL)'
`$env:TEXT2SQL_AGENT_URL='$($env:TEXT2SQL_AGENT_URL)'
`$env:GRAPHDB_AGENT_URL='$($env:GRAPHDB_AGENT_URL)'
npx tsx src/index.ts
"@
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Minimized
  Start-Sleep -Seconds 1
}

$adminDir = Join-Path $root "apps\admin-portal"
Write-Host "Starting Admin Portal..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$adminDir'; `$env:NEXT_PUBLIC_API_URL='http://localhost:3000'; npx next dev -p 3007" -WindowStyle Minimized

$userDir = Join-Path $root "apps\user-portal"
Write-Host "Starting User Portal..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$userDir'; `$env:NEXT_PUBLIC_API_URL='http://localhost:3000'; npx next dev -p 3008" -WindowStyle Minimized

Write-Host ""
Write-Host "NutriAgent AI is starting!" -ForegroundColor Cyan
Write-Host "  API Gateway:   http://localhost:3000"
Write-Host "  User App:      http://localhost:3008"
Write-Host "  Admin Portal:  http://localhost:3007"
Write-Host "  Demo User:     user@nutriagent.ai / user123"
Write-Host "  Demo Admin:    admin@nutriagent.ai / admin123"
Write-Host ""
Write-Host "Mobile native: cd apps/mobile; npx expo start" -ForegroundColor Yellow
