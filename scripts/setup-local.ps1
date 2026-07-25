$ErrorActionPreference = "Stop"

Write-Host "Filo Platform yerel kurulumu basliyor..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js bulunamadi. Node.js 22 LTS kurup tekrar deneyin."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker bulunamadi. Docker Desktop kurup calistirin."
}
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host ".env dosyasi olusturuldu." -ForegroundColor Green
}

docker compose up -d
npm install

Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}

npm run db:migrate
npm run db:seed
npm run typecheck
npm test

Write-Host ""
Write-Host "Kurulum tamamlandi." -ForegroundColor Green
Write-Host "Baslatmak icin: powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1"
