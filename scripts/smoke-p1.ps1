param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8787/api",
  [string]$AgentBaseUrl = "http://127.0.0.1:8790",
  [switch]$RunVideoTask,
  [int]$TimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )

  $params = @{
    Method = $Method
    Uri = $Url
    ContentType = "application/json"
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }
  Invoke-RestMethod @params
}

Write-Host "Checking API health..."
$apiHealth = Invoke-Json -Method Get -Url "$ApiBaseUrl/health"
Write-Host "api ok: modelMode=$($apiHealth.modelMode)"

Write-Host "Checking Python Agent health..."
$agentHealth = Invoke-Json -Method Get -Url "$AgentBaseUrl/health"
Write-Host "agent ok: model_mode=$($agentHealth.model_mode)"

Write-Host "Creating smoke product..."
$product = Invoke-Json -Method Post -Url "$ApiBaseUrl/products" -Body @{
  title = "P1 Smoke Test Product"
  sellingPoints = @("portable", "clear sound", "long battery")
  targetAudience = "local demo reviewer"
  scene = "desktop smoke test"
  ratio = "9:16"
}
Write-Host "product created: $($product.id)"

Write-Host "Generating script..."
$script = Invoke-Json -Method Post -Url "$ApiBaseUrl/scripts" -Body @{
  productId = $product.id
  ratio = "9:16"
}
Write-Host "script generated: $($script.id)"

Write-Host "Requesting editing plan..."
$plan = Invoke-Json -Method Post -Url "$ApiBaseUrl/scripts/$($script.id)/editing-plan"
Write-Host "editing plan created: $($plan.id)"
Write-Host "planned shots: $($plan.shots.Count)"
$selectedMaterials = @($plan.shots | ForEach-Object { $_.sourceMaterialId } | Where-Object { $_ })
if ($selectedMaterials.Count -gt 0) {
  Write-Host "selected materials: $($selectedMaterials -join ', ')"
} else {
  Write-Host "selected materials: none"
}

if (-not $RunVideoTask) {
  Write-Host "Skipping video task. Re-run with -RunVideoTask to exercise Seedance, retry, stitching, and preview output."
  exit 0
}

Write-Host "Starting video task..."
$task = Invoke-Json -Method Post -Url "$ApiBaseUrl/tasks" -Body @{
  scriptId = $script.id
  ratio = "9:16"
  editingPlanId = $plan.id
}
Write-Host "task started: $($task.id)"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Seconds 5
  $task = Invoke-Json -Method Get -Url "$ApiBaseUrl/tasks/$($task.id)"
  Write-Host "task status: $($task.status)"
  if ($task.status -eq "succeeded") {
    Write-Host "task succeeded"
    Write-Host "outputUrl: $($task.outputUrl)"
    exit 0
  }
  if ($task.status -eq "failed") {
    throw "task failed: $($task.errorMsg)"
  }
} while ((Get-Date) -lt $deadline)

throw "task did not finish within $TimeoutSeconds seconds"
