param(
  [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "release-packages")
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = "1.28.20"
$head = (git -C $root rev-parse HEAD).Trim()
$status = git -C $root status --porcelain
if ($status) { throw "Release package requires a clean Git working tree." }

$manifestPath = Join-Path $root "outputs/release-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "outputs/release-manifest.json is missing." }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.format -ne "FILO_RELEASE_MANIFEST_V3" -or $manifest.release -ne $release -or $manifest.commit -ne $head -or $manifest.dirty) {
  throw "Release manifest does not represent the clean current commit."
}

$releaseCommit = (git -C $root log -1 --format=%H --grep="^release: update Filo Platform to v1.28.20$").Trim()
if (-not $releaseCommit) { throw "The v1.28.20 release baseline commit was not found." }
$baseline = (git -C $root rev-parse "$releaseCommit^").Trim()
$tempBase = [IO.Path]::GetTempPath()
$staging = Join-Path $tempBase ("filo-release-" + [guid]::NewGuid().ToString("N"))
$resolvedTemp = [IO.Path]::GetFullPath($tempBase)
$resolvedStaging = [IO.Path]::GetFullPath($staging)
if (-not $resolvedStaging.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe staging path." }

function Copy-RelativeFiles([string[]]$Files, [string]$Destination) {
  foreach ($relative in $Files) {
    if (-not $relative -or $relative.StartsWith("outputs/")) { continue }
    $source = Join-Path $root ($relative -replace "/", [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
    $target = Join-Path $Destination ($relative -replace "/", [IO.Path]::DirectorySeparatorChar)
    $targetDirectory = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
  }
}

try {
  $fullRoot = Join-Path $staging "filo-platform-v1.28.20"
  $updateRoot = Join-Path $staging "update"
  New-Item -ItemType Directory -Force -Path $fullRoot, $updateRoot, $OutputDirectory | Out-Null
  $tracked = @(git -C $root ls-files)
  $updated = @(git -C $root diff --name-only $baseline HEAD)
  Copy-RelativeFiles $tracked $fullRoot
  Copy-RelativeFiles $updated $updateRoot
  foreach ($evidence in @("release-manifest.json", "sbom.cdx.json", "sbom-mobile-driver.cdx.json", "sbom-telematics-gateway.cdx.json")) {
    $source = Join-Path $root "outputs/$evidence"
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing release evidence: outputs/$evidence" }
    $fullEvidence = Join-Path $fullRoot "outputs/$evidence"
    $updateEvidence = Join-Path $updateRoot "outputs/$evidence"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fullEvidence), (Split-Path -Parent $updateEvidence) | Out-Null
    Copy-Item -LiteralPath $source -Destination $fullEvidence
    Copy-Item -LiteralPath $source -Destination $updateEvidence
  }
  $fullZip = Join-Path $OutputDirectory "Filo_Platform_v1.28.20_Tam_Kaynak.zip"
  $updateZip = Join-Path $OutputDirectory "Filo_Platform_v1.28.20_Guncelleme.zip"
  Compress-Archive -Path $fullRoot -DestinationPath $fullZip -CompressionLevel Optimal -Force
  Compress-Archive -Path (Join-Path $updateRoot "*") -DestinationPath $updateZip -CompressionLevel Optimal -Force
  foreach ($zip in @($fullZip, $updateZip)) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
    Set-Content -LiteralPath "$zip.sha256" -Value "$hash  $([IO.Path]::GetFileName($zip))" -Encoding ascii
  }
  Write-Output $fullZip
  Write-Output $updateZip
} finally {
  if (Test-Path -LiteralPath $resolvedStaging) { Remove-Item -LiteralPath $resolvedStaging -Recurse -Force }
}
