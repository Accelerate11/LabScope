# Retry loop for the wedged WSL VM. Uses --cd /root so the probe does not
# depend on the Windows CWD (/mnt/d) being responsive.
# Appends one line per attempt to docs/m0/artifacts/wsl-recovery.log.
$ErrorActionPreference = 'Continue'
$env:WSL_UTF8 = 1
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$log = Join-Path $repoRoot 'docs/m0/artifacts/wsl-recovery.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

for ($i = 1; $i -le 30; $i++) {
  $stamp = (Get-Date).ToString('o')
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'wsl.exe'
  $psi.Arguments = '-d Ubuntu-22.04 -u root --cd /root -- bash -c "echo ALIVE; uptime"'
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $proc = [System.Diagnostics.Process]::Start($psi)
  if ($proc.WaitForExit(25000)) {
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    if ($proc.ExitCode -eq 0 -and $out -match 'ALIVE') {
      Add-Content -Path $log -Value "$stamp RECOVERED $(($out.Trim() -replace '\s+', ' '))"
      exit 0
    }
    Add-Content -Path $log -Value "$stamp exit=$($proc.ExitCode) err=$(($err.Trim() -replace '\s+', ' '))"
  } else {
    try { $proc.Kill() } catch {}
    Add-Content -Path $log -Value "$stamp timeout"
  }
  Start-Sleep -Seconds 25
}
Add-Content -Path $log -Value "$((Get-Date).ToString('o')) GAVE_UP"
exit 1
