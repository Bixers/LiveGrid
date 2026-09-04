$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$archiveName = 'mpv-dev-x86_64-20260903-git-69e63f425a.7z'
$archive = Join-Path $root $archiveName
$runtime = Join-Path $root 'runtime'
$expectedHash = 'FAC135C68A35B7639E39D72C0C365104EDBAEBDEA39A0DFDD8C36E8C8E80FAEF'
$downloadUrl = "https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260903/$archiveName"
$sevenZip = @(
    (Get-Command 7z.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    (Join-Path $env:ProgramFiles '7-Zip\7z.exe'),
    'D:\7-Zip\7z.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    Start-BitsTransfer -Source $downloadUrl -Destination $archive -DisplayName 'LiveGrid libmpv runtime'
}

$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
if ($actualHash -ne $expectedHash) {
    throw "libmpv archive hash mismatch: $actualHash"
}
if (-not $sevenZip) {
    throw '7-Zip was not found. Install 7-Zip or add 7z.exe to PATH.'
}

& $sevenZip e $archive 'libmpv-2.dll' "-o$runtime" -y
if ($LASTEXITCODE -ne 0) {
    throw "libmpv extraction failed with exit code $LASTEXITCODE"
}
