<#
.SYNOPSIS
  Clean restart of the NutriAgent local dev stack.

.DESCRIPTION
  Runs services from source with `pnpm dev` (hot reload, no Docker image builds),
  keeping only Postgres and Redis in Docker. Handles the failure modes that bite
  repeatedly on Windows:
    - leftover `pnpm dev` sessions holding ports 3000-3008 (EADDRINUSE)
    - Postgres/Redis not running
    - missing Prisma migrations (P2021 "table does not exist")
    - missing LangGraph checkpoint tables (relation "public.checkpoints" ...)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-restart.ps1

.EXAMPLE
  # Skip the DB steps when you know the schema is already current
  powershell -ExecutionPolicy Bypass -File scripts\dev-restart.ps1 -SkipDb
#>
[CmdletBinding()]
param(
  [switch]$SkipDb,
  # Don't start `pnpm dev` — just clean up ports and prepare the database.
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$ports = 3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
Write-Step "Stopping leftover Node processes (frees ports 3000-3008)"
# A previous `pnpm dev` keeps listening and causes EADDRINUSE on every restart.
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcs) {
  $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Host "Stopped $($nodeProcs.Count) node process(es)."
  Start-Sleep -Seconds 2
} else {
  Write-Host "No node processes running."
}

$stillBound = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
if ($stillBound) {
  Write-Warning "These ports are still in use by another program:"
  $stillBound |
    Select-Object LocalPort, OwningProcess,
      @{ n = 'Process'; e = { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } } |
    Format-Table -AutoSize | Out-String | Write-Host
  Write-Warning "Stop them (or `docker compose stop <service>`) before continuing."
} else {
  Write-Host "All app ports are free." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
Write-Step "Ensuring Postgres and Redis containers are up"
try {
  docker compose up -d postgres redis
  if ($LASTEXITCODE -ne 0) { throw "docker compose exited with $LASTEXITCODE" }
} catch {
  Write-Warning "Could not start Postgres/Redis: $_"
  Write-Warning "Is Docker Desktop running? The app needs Postgres on 127.0.0.1:5433."
  exit 1
}

Write-Host "Waiting for Postgres to accept connections..."
$ready = $false
foreach ($attempt in 1..30) {
  docker compose exec -T postgres pg_isready -U nutriagent *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  Write-Warning "Postgres did not become ready in 30s. Check: docker compose logs postgres"
  exit 1
}
Write-Host "Postgres is ready." -ForegroundColor Green

# ---------------------------------------------------------------------------
if (-not $SkipDb) {
  Write-Step "Applying Prisma migrations"
  # `migrate deploy` (not `dev`) — applies pending migrations with no interactive
  # prompt and no chance of offering to reset the database.
  pnpm db:migrate:deploy
  if ($LASTEXITCODE -ne 0) { Write-Warning "Migrations failed - see output above."; exit 1 }

  Write-Step "Ensuring LangGraph checkpoint tables exist"
  # Required by the Vision branch's interrupt/resume flow.
  pnpm db:setup:checkpointer
  if ($LASTEXITCODE -ne 0) { Write-Warning "Checkpointer setup failed - see output above."; exit 1 }
}

# ---------------------------------------------------------------------------
if ($NoStart) {
  Write-Step "Ready. Start the stack with: pnpm dev"
  exit 0
}

Write-Step "Starting all services (pnpm dev)"
Write-Host "User portal:  http://127.0.0.1:3008" -ForegroundColor Green
Write-Host "Admin portal: http://127.0.0.1:3007" -ForegroundColor Green
Write-Host "Login: user@nutriagent.ai / user123    (admin@nutriagent.ai / admin123)"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

pnpm dev
