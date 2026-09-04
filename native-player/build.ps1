$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Join-Path $root 'runtime'
$output = Join-Path $runtime 'LiveGrid.PlayerHost.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "C# compiler not found: $compiler"
}
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'libmpv-2.dll'))) {
    throw 'libmpv-2.dll is missing. Run prepare-libmpv.ps1 first.'
}

& $compiler /nologo /target:exe /platform:x64 /optimize+ `
    /out:$output `
    /reference:System.dll `
    /reference:System.Core.dll `
    /reference:System.Drawing.dll `
    /reference:System.Net.Http.dll `
    /reference:System.Web.Extensions.dll `
    /reference:System.Windows.Forms.dll `
    (Join-Path $root 'LiveGrid.PlayerHost.cs')

if ($LASTEXITCODE -ne 0) {
    throw "Native player build failed with exit code $LASTEXITCODE"
}

Write-Output $output
