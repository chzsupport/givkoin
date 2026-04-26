param(
  [string]$BaseUrl = 'http://127.0.0.1:10000',
  [int]$StartUsers = 500,
  [int]$MaxUsers = 5000,
  [int]$Step = 500,
  [int]$Duration = 20,
  [int]$Timeout = 3000
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$resultsDir = Join-Path $backendDir 'bench-results'
$serverOut = Join-Path $resultsDir 'current-bench-server.out.log'
$serverErr = Join-Path $resultsDir 'current-bench-server.err.log'

New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
Remove-Item $serverOut, $serverErr -Force -ErrorAction SilentlyContinue

Push-Location $backendDir
$serverProcess = $null
try {
  $existing = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*mockBenchmarkServer.js*' }
  foreach ($proc in $existing) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }

  $serverProcess = Start-Process -FilePath node `
    -ArgumentList 'scripts/mockBenchmarkServer.js' `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr `
    -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
      $resp = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 3
      if ($resp.ok -eq $true) {
        $ready = $true
        break
      }
    } catch {
    }
  }

  if (-not $ready) {
    throw 'mock bench server did not become healthy in time'
  }

  & node scripts/projectLoadSuite.js "--url=$BaseUrl" "--start=$StartUsers" "--max=$MaxUsers" "--step=$Step" "--duration=$Duration" "--timeout=$Timeout"
  if ($LASTEXITCODE -ne 0) {
    throw "projectLoadSuite exited with code $LASTEXITCODE"
  }
} finally {
  if ($serverProcess) {
    try {
      Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
  Pop-Location
}

Get-ChildItem -Path $resultsDir |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 6 Name, LastWriteTime
