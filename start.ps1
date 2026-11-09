$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodePath = Join-Path $projectRoot '.runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
    $systemNode = Get-Command node -ErrorAction SilentlyContinue
    if ($systemNode -and ([version]((& $systemNode.Source --version).TrimStart('v')) -ge [version]'24.11.0')) {
        $nodePath = $systemNode.Source
    } else {
        Write-Host 'Downloading the portable Node.js runtime (first launch only)...'
        New-Item -ItemType Directory -Force (Join-Path $projectRoot '.runtime') | Out-Null
        Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.11.0/win-x64/node.exe' -OutFile $nodePath
    }
}
Set-Location -LiteralPath $projectRoot
$appPort = if ($env:PORT) { $env:PORT } else { '43871' }
Write-Host "Open http://localhost:$appPort in your browser. Press Ctrl+C to stop."
& $nodePath (Join-Path $projectRoot 'server.mjs')
