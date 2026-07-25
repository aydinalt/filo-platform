$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  throw ".env bulunamadi. Once scripts\setup-local.ps1 calistirin."
}

Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}

Write-Host "Web: http://localhost:5173" -ForegroundColor Cyan
Write-Host "API: http://localhost:3001/health" -ForegroundColor Cyan
npm run dev
