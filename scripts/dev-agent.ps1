$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot "apps\api\.env"

if (Test-Path $envFile) {
  Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $name, $value = $line -split "=", 2
    $name = $name.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

$env:MODEL_MODE = if ($env:MODEL_MODE) { $env:MODEL_MODE } else { "live" }

$missing = @()
foreach ($name in @("ARK_API_KEY", "ARK_TEXT_MODEL", "ARK_VIDEO_MODEL")) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
    $missing += $name
  }
}

if ($missing.Count -gt 0) {
  Write-Warning ("Missing live model env: " + ($missing -join ", "))
}

conda run --no-capture-output -n tiktop_agent_p1 python -m uvicorn agent_app.main:app --app-dir apps/agent/src --host 127.0.0.1 --port 8790
