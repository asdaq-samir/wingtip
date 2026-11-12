# One replay on the trial's instance, sent by `trial.sh run` through SSM Run
# Command (AWS-RunPowerShellScript, as SYSTEM). It builds the agent from
# the kit trial.sh put in the bucket, has the signed-in Administrator's
# desktop (Windows signs in by itself, template.yaml) start OBS and the
# simulator and run the agent there, since a game draws on a desktop and
# SYSTEM has none, then puts the recording, the agent's log and summary
# in s3://<bucket>/runs/<run>/, whatever happened.
param(
  [Parameter(Mandatory)] [string] $Bucket,
  [Parameter(Mandatory)] [string] $Run,
  [Parameter(Mandatory)] [string] $Region,
  [string] $Resolution = '1440p',
  [string] $Shots = '',
  [int] $TimeoutMin = 90
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = 'C:\wingtip'
$out = "$root\runs\$Run"
New-Item -ItemType Directory -Force $out | Out-Null
Start-Transcript -Path "$out\run.log" -Append
function Step($what) { Write-Output "$(Get-Date -Format o) $what" }
$task = "Wingtip replay $Run"
$code = 1
try {
  Step "run $Run at $Resolution"
  if (-not (query user 2>$null | Select-String -Quiet 'Administrator')) {
    throw 'No one is signed in on the desktop: Windows should sign Administrator in by itself (template.yaml); reboot, or connect once with DCV.'
  }

  Step 'the kit: the agent''s source and the track'
  Read-S3Object -BucketName $Bucket -KeyPrefix kit/msfs-agent -Folder "$root\msfs-agent" -Region $Region | Out-Null
  Read-S3Object -BucketName $Bucket -Key kit/track.json -File "$out\track.json" -Region $Region | Out-Null

  Step 'build against the MSFS 2024 SDK''s SimConnect'
  $sdk = [Environment]::GetEnvironmentVariable('MSFS2024_SDK', 'Machine')
  if (-not $sdk) { throw 'The MSFS 2024 SDK is not installed (README step 5): MSFS2024_SDK is not set.' }
  & 'C:\Program Files\dotnet\dotnet.exe' publish "$root\msfs-agent\Replay.Agent" -c Release -r win-x64 --self-contained false -o "$root\agent" "-p:SimConnectDir=$sdk\SimConnect SDK\lib\managed"
  if ($LASTEXITCODE -ne 0) { throw "the agent did not build ($LASTEXITCODE)" }

  # What the desktop runs: OBS and the simulator if they are not up, then
  # the agent, its exit code left in a file for this script to read.
  $session = @"
`$ErrorActionPreference = 'Continue'
if (-not (Get-Process obs64 -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath 'C:\Program Files\obs-studio\bin\64bit\obs64.exe' -WorkingDirectory 'C:\Program Files\obs-studio\bin\64bit' -ArgumentList '--minimize-to-tray', '--disable-shutdown-check', '--disable-missing-files-check'
}
if (-not (Get-Process FlightSimulator2024 -ErrorAction SilentlyContinue)) {
  # MSFS 2024's Steam app (store.steampowered.com/app/2537590).
  Start-Process 'steam://rungameid/2537590'
}
Start-Sleep -Seconds 20
& '$root\agent\wingtip-replay.exe' --track '$out\track.json' --out '$out' --resolution '$Resolution' $(if ($Shots) { "--shots '$Shots'" }) --obs-password-file '$root\obs-password.txt' --wait-sim-min 30 *> '$out\agent.console.txt'
Set-Content -Path '$out\exit.txt' -Value `$LASTEXITCODE
"@
  Set-Content -Path "$out\session.ps1" -Value $session

  Step 'start it on the desktop'
  $action = New-ScheduledTaskAction -Execute powershell.exe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$out\session.ps1`""
  $principal = New-ScheduledTaskPrincipal -UserId Administrator -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $task

  $deadline = (Get-Date).AddMinutes($TimeoutMin)
  while (-not (Test-Path "$out\exit.txt")) {
    if ((Get-Date) -gt $deadline) { throw "no end after $TimeoutMin minutes: see agent.log.jsonl" }
    Start-Sleep -Seconds 15
  }
  $code = [int](Get-Content "$out\exit.txt")
  Step "the agent ended with $code"
} catch {
  Step "FAILED: $_"
} finally {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  Stop-Transcript
  # Everything the run made: the recording, agent.log.jsonl, summary.json,
  # the console and this script's log.
  Write-S3Object -BucketName $Bucket -KeyPrefix "runs/$Run" -Folder $out -Recurse -Region $Region | Out-Null
}
exit $code
