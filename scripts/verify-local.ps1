$ErrorActionPreference = "Stop"

Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}

npm run typecheck
npm test
npm run build
Get-Content "packages/database/tenant-isolation-test.sql" -Raw |
  docker compose exec -T postgres psql -U filo -d filo
Write-Host "Tum yerel dogrulamalar tamamlandi." -ForegroundColor Green
