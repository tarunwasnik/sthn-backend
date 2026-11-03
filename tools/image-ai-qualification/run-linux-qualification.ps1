param(
  [switch]$Smoke,
  [string]$OutputRoot = "evaluation-output/image-moderation/i3b-5f-linux-qualification"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $root
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required. Install/start a compatible local Docker runtime, then rerun this script."
}

$tag = "sthn-adamcodd-v2-linux-qualification:local"
docker build --file "tools/image-ai-qualification/Dockerfile" --tag $tag .
if ($LASTEXITCODE -ne 0) { throw "Docker image build failed with exit code $LASTEXITCODE." }

$runId = "run-$(Get-Date -Format 'yyyyMMddTHHmmss')"
$hostOutput = Join-Path $root (Join-Path $OutputRoot $runId)
New-Item -ItemType Directory -Force -Path $hostOutput | Out-Null
$records = @()
foreach ($limit in @("512m", "1g", "1536m")) {
  $name = "sthn-adamcodd-v2-q-$($limit.Replace('m','m').Replace('g','g'))-$PID"
  $containerOutput = "/app/evaluation-output/image-moderation/i3b-5f-linux-qualification/$limit"
  $args = @("run", "--name", $name, "--memory", $limit, "--memory-swap", $limit, "--mount", "type=bind,src=$hostOutput,dst=/app/evaluation-output/image-moderation/i3b-5f-linux-qualification", $tag)
  if ($Smoke) { $args += "--smoke" }
  $args += @("--output-dir", $containerOutput)
  & docker @args
  $dockerExit = $LASTEXITCODE
  $inspection = & docker inspect $name --format '{{json .State}}' 2>$null
  $records += [pscustomobject]@{ memoryLimit = $limit; dockerExitCode = $dockerExit; state = $inspection }
  & docker rm $name | Out-Null
}
$records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $hostOutput "container-execution.json") -Encoding utf8
$records | Format-Table -AutoSize
