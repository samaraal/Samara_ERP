<#
  Samara Biometric Sync  (ERP 2.20.24)
  ------------------------------------
  Keeps easy TimePro (and so the ZKTeco machine) in line with the Samara ERP employee list:
    • new active employees in the ERP      → added to easy TimePro, in the machine's area
    • suspended in the ERP                 → moved to the "Blocked - No Access" area (cannot punch;
                                             fingerprint / face kept, restored on reinstatement)
    • resigned / terminated / disabled     → blocked and marked Resigned in easy TimePro
    • reinstated / enabled again           → restored automatically
  Machine Employee ID = number part of the ERP Employee ID (EMP-0025 -> 25).
  Department = the employee's ERP department (created in easy TimePro when missing; staff are
  moved when their ERP department changes). No ERP department -> Mogappair.
  Staff in easy TimePro that the ERP does not know are only reported, never changed.

  First time (on the PC where easy TimePro runs): right-click this file -> Run with PowerShell,
  or use the setup command from ERP -> HR -> Biometric Attendance -> Staff Sync.
  Setup asks for the ERP Staff Sync URL and the easy TimePro login, shows a test run, then
  creates a Windows scheduled task that runs every 5 minutes and when Windows starts.

  Options:  -Setup      run the setup again (new URL / password)
            -DryRun     show what would change, change nothing
            -Run        one normal run (what the scheduled task uses)
            -Uninstall  remove the scheduled task and saved settings
#>
param([switch]$Setup, [switch]$Run, [switch]$DryRun, [switch]$Uninstall, [switch]$Diagnose)

$ErrorActionPreference = 'Stop'
$AgentVersion = '2.20.24'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$AppDir     = Join-Path $env:LOCALAPPDATA 'SamaraBiometricSync'
$ConfigPath = Join-Path $AppDir 'config.json'
$CredPath   = Join-Path $AppDir 'timepro-login.xml'   # Windows-encrypted, readable only by this Windows user
$LogPath    = Join-Path $AppDir 'sync.log'
$ScriptCopy = Join-Path $AppDir 'Samara-Biometric-Sync.ps1'
$TaskName   = 'Samara Biometric Sync'
if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir | Out-Null }

function Write-Log([string]$msg) {
  $line = '{0}  {1}' -f (Get-Date -Format 'dd-MM-yyyy HH:mm:ss'), $msg
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
  if (-not $script:Quiet) { Write-Host $msg }
}
function Trim-Log {
  if (Test-Path $LogPath) {
    $lines = Get-Content $LogPath -Encoding UTF8
    if ($lines.Count -gt 3000) { $lines | Select-Object -Last 2000 | Set-Content $LogPath -Encoding UTF8 }
  }
}

# ---------------- settings ----------------
function Read-Config {
  if (-not (Test-Path $ConfigPath)) { return $null }
  return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
function Save-Config($cfg) { $cfg | ConvertTo-Json -Depth 4 | Set-Content $ConfigPath -Encoding UTF8 }

# ---------------- easy TimePro API ----------------
function ConvertTo-JsonBody($obj) {
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  return ,([Text.Encoding]::UTF8.GetBytes($json))   # the comma keeps it one byte[] (PowerShell would unroll it)
}
function Connect-TpWebSession($base, $user, $pass) {
  # The same sign-in as the easy TimePro page in the browser (sees every department / area / employee).
  $sess = $null
  $page = Invoke-WebRequest -Uri ($base + '/login/') -SessionVariable sess -UseBasicParsing -TimeoutSec 30
  $m = [regex]::Match($page.Content, 'name=["'']csrfmiddlewaretoken["''][^>]*value=["'']([^"'']+)')
  if (-not $m.Success) { $m = [regex]::Match($page.Content, 'value=["'']([^"'']+)["''][^>]*name=["'']csrfmiddlewaretoken') }
  if (-not $m.Success) { throw 'login page without form key' }
  $form = @{ csrfmiddlewaretoken = $m.Groups[1].Value; username = $user; password = $pass; template10 = ''; login_type = 'pwd' }
  Invoke-WebRequest -Uri ($base + '/login/') -Method Post -Body $form -WebSession $sess -Headers @{ Referer = ($base + '/login/') } -UseBasicParsing -TimeoutSec 30 | Out-Null
  $test = Invoke-WebRequest -Uri ($base + '/personnel/api/departments/') -WebSession $sess -Headers @{ Accept = 'application/json' } -UseBasicParsing -TimeoutSec 30
  if ($test.Content -notmatch '^\s*\{') { throw 'browser-style sign-in was not accepted (check the user name / password)' }
  $csrf = ''
  foreach ($c in $sess.Cookies.GetCookies([Uri]($base + '/'))) { if ($c.Name -eq 'csrftoken') { $csrf = $c.Value } }
  $script:TpSession = $sess
  $script:TpScheme = 'Web'
  return @{ 'X-CSRFToken' = $csrf; Referer = ($base + '/'); Accept = 'application/json' }
}
function Get-TpAuthHeader($cfg) {
  $cred = Import-Clixml $CredPath
  $user = $cred.UserName
  $pass = $cred.GetNetworkCredential().Password
  $script:TpSession = $null
  try { return (Connect-TpWebSession $cfg.TimeProUrl.TrimEnd('/') $user $pass) } catch { $webErr = $_.Exception.Message }
  $body = ConvertTo-JsonBody @{ username = $user; password = $pass }
  $form = 'username=' + [Uri]::EscapeDataString($user) + '&password=' + [Uri]::EscapeDataString($pass)
  foreach ($try in @(@{ path = '/jwt-api-token-auth/'; scheme = 'JWT'; form = $false }, @{ path = '/jwt-api-token-auth/'; scheme = 'JWT'; form = $true }, @{ path = '/api-token-auth/'; scheme = 'Token'; form = $false })) {
    try {
      if ($try.form) { $r = Invoke-RestMethod -Method Post -Uri ($cfg.TimeProUrl.TrimEnd('/') + $try.path) -Body $form -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 30 }
      else { $r = Invoke-RestMethod -Method Post -Uri ($cfg.TimeProUrl.TrimEnd('/') + $try.path) -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 30 }
      if ($r.token) { $script:TpScheme = $try.scheme; return @{ Authorization = ('{0} {1}' -f $try.scheme, $r.token) } }
    } catch { $last = $_.Exception.Message }
  }
  throw "easy TimePro login failed ($webErr; $last). Check that easy TimePro is open at $($cfg.TimeProUrl) and run setup again if the password changed."
}
function Invoke-Tp($method, [string]$path, $body = $null) {
  $uri = $script:Cfg.TimeProUrl.TrimEnd('/') + $path
  $p = @{ Method = $method; Uri = $uri; Headers = $script:TpAuth; TimeoutSec = 60 }
  if ($script:TpSession) { $p.WebSession = $script:TpSession }
  if ($null -ne $body) { $p.Body = (ConvertTo-JsonBody $body); $p.ContentType = 'application/json; charset=utf-8' }
  try { return Invoke-RestMethod @p }
  catch {
    $detail = ''
    try { $detail = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
    throw ("easy TimePro {0} {1} failed: {2} {3}" -f $method, $path, $_.Exception.Message, $detail)
  }
}
function Get-TpAll([string]$path) {
  $all = @(); $page = 1
  while ($true) {
    $sep = '?'; if ($path.Contains('?')) { $sep = '&' }
    $r = Invoke-Tp 'Get' ("{0}{1}page={2}&page_size=100" -f $path, $sep, $page)
    if ($null -ne $r.code -and [string]$r.code -ne '0' -and -not $r.data) { throw ("easy TimePro {0}: {1} (code {2})" -f $path, $r.msg, $r.code) }
    if ($null -eq $r.data -and $null -eq $r.count) { throw ("easy TimePro {0} gave an unexpected answer: {1}" -f $path, (($r | ConvertTo-Json -Depth 3 -Compress) -replace '\s+',' ').Substring(0, [Math]::Min(300, (($r | ConvertTo-Json -Depth 3 -Compress)).Length))) }
    if ($r.data) { $all += @($r.data) }
    if (-not $r.next -or $page -gt 100) { break }
    $page++
  }
  return ,$all
}
function Get-AreaIds($emp) { return @($emp.area | Where-Object { $null -ne $_ } | ForEach-Object { if ($_ -is [System.Management.Automation.PSCustomObject]) { [int]$_.id } else { [int]$_ } }) }
function Get-DeptId($name, [bool]$dry) {
  # easy TimePro department for an ERP department name (matched by name; created when missing)
  $n = ([string]$name).Trim()
  if (-not $n) { return [int]$script:FallbackDept.id }
  $key = $n.ToLower()
  if ($script:DeptCache.ContainsKey($key)) { return $script:DeptCache[$key] }
  $d = $script:DeptList | Where-Object { ([string]$_.dept_name).Trim().ToLower() -eq $key } | Select-Object -First 1
  if ($d) { $script:DeptCache[$key] = [int]$d.id; return [int]$d.id }
  $codes = @($script:DeptList | ForEach-Object { $c = 0; if ([int]::TryParse([string]$_.dept_code, [ref]$c)) { $c } })
  $next = 10; if ($codes.Count -gt 0) { $next = [Math]::Max(10, ($codes | Measure-Object -Maximum).Maximum + 1) }
  if ($dry) {
    Write-Log ("  (test) would create department {0} '{1}' in easy TimePro" -f $next, $n)
    $fake = -1000 - $script:DeptCache.Count
    $script:DeptList += [pscustomobject]@{ id = $fake; dept_code = [string]$next; dept_name = $n }
    $script:DeptCache[$key] = $fake; return $fake
  }
  Invoke-Tp 'Post' '/personnel/api/departments/' @{ dept_code = [string]$next; dept_name = $n } | Out-Null
  Write-Log ("  Created department {0} '{1}' in easy TimePro" -f $next, $n)
  $script:DeptList = Get-TpAll '/personnel/api/departments/'
  $d = $script:DeptList | Where-Object { ([string]$_.dept_name).Trim().ToLower() -eq $key } | Select-Object -First 1
  if (-not $d) { throw "Could not create department '$n' in easy TimePro." }
  $script:DeptCache[$key] = [int]$d.id; return [int]$d.id
}
function Get-ShortName($name) { $n = ([string]$name).Trim(); return $n.Substring(0, [Math]::Min(25, $n.Length)) }
function Ensure-Area([string]$code, [string]$name, [bool]$dry) {
  $a = $script:Areas | Where-Object { [string]$_.area_code -eq $code } | Select-Object -First 1
  if ($a) { return [int]$a.id }
  if ($dry) { Write-Log "  (test) would create area $code '$name' in easy TimePro"; return -1 }
  $new = Invoke-Tp 'Post' '/personnel/api/areas/' @{ area_code = $code; area_name = $name }
  $id = $new.id; if (-not $id -and $new.data) { $id = $new.data.id }
  Write-Log "  Created area $code '$name' in easy TimePro"
  $script:Areas = Get-TpAll '/personnel/api/areas/'
  if (-not $id) { $id = ($script:Areas | Where-Object { [string]$_.area_code -eq $code } | Select-Object -First 1).id }
  return [int]$id
}

# ---------------- one sync run ----------------
function Invoke-Sync([bool]$dry) {
  $script:Cfg = Read-Config
  if (-not $script:Cfg) { throw 'Not set up yet. Run this file with -Setup.' }
  Write-Log ("easy TimePro: {0} on {1}" -f $script:Cfg.TimeProUrl, $env:COMPUTERNAME)
  $actions = New-Object System.Collections.ArrayList
  $errors  = New-Object System.Collections.ArrayList
  $summary = [ordered]@{ added = 0; restored = 0; blocked = 0; resigned = 0; updated = 0; unchanged = 0; not_in_erp = 0 }
  $erpUrl = $script:Cfg.ErpUrl
  try {
    $feed = Invoke-RestMethod -Method Get -Uri $erpUrl -TimeoutSec 60
    if (-not $feed.ok) { throw "ERP said: $($feed.message)" }
    $staff = @($feed.employees)
    if (@($staff | Where-Object { $_.status -eq 'active' }).Count -eq 0) { throw 'ERP sent no active employees - nothing changed (safety stop).' }
    $today = [string]$feed.today

    $script:TpAuth = Get-TpAuthHeader $script:Cfg
    $script:Areas = Get-TpAll '/personnel/api/areas/'
    $depts = Get-TpAll '/personnel/api/departments/'
    $positions = Get-TpAll '/personnel/api/positions/'
    $dept = $depts | Where-Object { [string]$_.dept_code -eq [string]$script:Cfg.DepartmentCode } | Select-Object -First 1
    if (-not $dept) { $dept = $depts | Where-Object { [string]$_.dept_name -eq 'Mogappair' } | Select-Object -First 1 }
    if (-not $dept) {
      if ($dry) {
        Write-Log ("  (test) would create department {0} 'Mogappair' in easy TimePro" -f $script:Cfg.DepartmentCode)
        $dept = [pscustomobject]@{ id = -1; dept_code = [string]$script:Cfg.DepartmentCode; dept_name = 'Mogappair' }
      } else {
        $nd = Invoke-Tp 'Post' '/personnel/api/departments/' @{ dept_code = [string]$script:Cfg.DepartmentCode; dept_name = 'Mogappair' }
        Write-Log ("  Created department {0} 'Mogappair' in easy TimePro" -f $script:Cfg.DepartmentCode)
        $dept = (Get-TpAll '/personnel/api/departments/') | Where-Object { [string]$_.dept_code -eq [string]$script:Cfg.DepartmentCode } | Select-Object -First 1
        if (-not $dept) { throw 'Could not create the Mogappair department in easy TimePro.' }
      }
    }
    $script:DeptList = @($depts)
    $script:DeptCache = @{}
    $script:FallbackDept = $dept
    $pos = $positions | Where-Object { [string]$_.position_code -eq [string]$script:Cfg.PositionCode } | Select-Object -First 1
    $activeArea  = Ensure-Area ([string]$script:Cfg.ActiveAreaCode)  ([string]$script:Cfg.ActiveAreaName)  $dry
    $blockedArea = Ensure-Area ([string]$script:Cfg.BlockedAreaCode) ([string]$script:Cfg.BlockedAreaName) $dry

    $tpEmps = @{}
    foreach ($e in (Get-TpAll '/personnel/api/employees/')) { $tpEmps[[string]$e.emp_code] = $e }
    $resigned = @{}
    foreach ($r in (Get-TpAll '/personnel/api/resigns/')) {
      $code = $null; $eid = $null
      if ($r.employee -is [System.Management.Automation.PSCustomObject]) { $code = $r.employee.emp_code; $eid = $r.employee.id } else { $eid = $r.employee }
      if (-not $code) { $code = $r.emp_code }
      if ($code) { $resigned[[string]$code] = @{ id = $r.id; employee_id = $eid } }
    }

    foreach ($s in $staff) {
      $code = [string]$s.emp_code
      $label = "{0} ({1}, machine {2})" -f $s.name, $s.employee_id, $code
      $e = $tpEmps[$code]
      try {
        switch ($s.status) {
          'active' {
            $wasResigned = $false
            if ($resigned.ContainsKey($code)) {
              $wasResigned = $true
              [void]$actions.Add(@{ type = 'restored'; emp_code = $code; name = $s.name; note = 'Reinstated in easy TimePro (was Resigned)' })
              $summary.restored++
              Write-Log "RESTORED  $label"
              if ($dry) { continue }
              Invoke-Tp 'Post' '/personnel/api/resigns/reinstatement/' @{ resigns = @([int]$resigned[$code].id) } | Out-Null
              $e = @((Invoke-Tp 'Get' ("/personnel/api/employees/?emp_code=" + $code)).data) | Where-Object { [string]$_.emp_code -eq $code } | Select-Object -First 1
              if (-not $e) { throw 'Reinstated, but the employee was not found afterwards.' }
            }
            if (-not $e) {
              $body = [ordered]@{ emp_code = $code; first_name = (Get-ShortName $s.name); department = (Get-DeptId $s.department $dry); area = @($activeArea) }
              if ($pos) { $body.position = [int]$pos.id }
              if ($s.date_of_joining) { $body.hire_date = [string]$s.date_of_joining }
              if ($s.gender) { $body.gender = [string]$s.gender }
              if ($s.mobile) { $body.mobile = [string]$s.mobile }
              if (-not $dry) { Invoke-Tp 'Post' '/personnel/api/employees/' $body | Out-Null }
              [void]$actions.Add(@{ type = 'added'; emp_code = $code; name = $s.name; note = 'New employee added to easy TimePro' })
              $summary.added++
              Write-Log "ADDED     $label"
              continue
            }
            $ids = Get-AreaIds $e
            $changed = $false
            if ($activeArea -lt 0 -or $ids.Count -ne 1 -or $ids[0] -ne $activeArea) {
              if (-not $dry) { Invoke-Tp 'Post' '/personnel/api/employees/adjust_area/' @{ employees = @([int]$e.id); areas = @($activeArea) } | Out-Null }
              $note = 'Moved to the machine area'
              if ($wasResigned) { $note = 'Back on the machine' }
              elseif ($blockedArea -gt 0 -and $ids -contains $blockedArea) { $note = 'Unblocked (suspension over) - back on the machine' }
              [void]$actions.Add(@{ type = 'restored'; emp_code = $code; name = $s.name; note = $note })
              $summary.restored++; $changed = $true
              Write-Log "AREA      $label -> $note"
            }
            $want = Get-ShortName $s.name
            $patch = @{}
            if ([string]$e.first_name -ne $want) { $patch.first_name = $want }
            if ($s.mobile -and [string]$e.mobile -ne [string]$s.mobile) { $patch.mobile = [string]$s.mobile }
            $wantDept = Get-DeptId $s.department $dry
            $haveDept = $null; if ($e.department -is [System.Management.Automation.PSCustomObject]) { $haveDept = [int]$e.department.id } elseif ($e.department) { $haveDept = [int]$e.department }
            if ($haveDept -ne $wantDept) { $patch.department = $wantDept }
            if ($patch.Count -gt 0) {
              if (-not $dry) { Invoke-Tp 'Patch' ("/personnel/api/employees/{0}/" -f $e.id) $patch | Out-Null }
              $what = ($patch.Keys | Sort-Object | ForEach-Object { if ($_ -eq 'department') { "department -> $($s.department)" } else { $_ } }) -join ', '
              [void]$actions.Add(@{ type = 'updated'; emp_code = $code; name = $s.name; note = ('Updated ' + $what) })
              $summary.updated++; $changed = $true
              Write-Log "UPDATED   $label ($what)"
            }
            if (-not $changed) { $summary.unchanged++ }
          }
          'suspended' {
            if ($e) {
              $ids = Get-AreaIds $e
              if ($blockedArea -lt 0 -or $ids.Count -ne 1 -or $ids[0] -ne $blockedArea) {
                if (-not $dry) { Invoke-Tp 'Post' '/personnel/api/employees/adjust_area/' @{ employees = @([int]$e.id); areas = @($blockedArea) } | Out-Null }
                [void]$actions.Add(@{ type = 'blocked'; emp_code = $code; name = $s.name; note = 'Suspended - removed from the machine (fingerprint kept)' })
                $summary.blocked++
                Write-Log "BLOCKED   $label (suspended)"
              } else { $summary.unchanged++ }
            } else { $summary.unchanged++ }
          }
          'exited' {
            if ($e -and -not $resigned.ContainsKey($code)) {
              $ids = Get-AreaIds $e
              if (-not $dry) {
                if ($blockedArea -gt 0 -and ($ids.Count -ne 1 -or $ids[0] -ne $blockedArea)) {
                  Invoke-Tp 'Post' '/personnel/api/employees/adjust_area/' @{ employees = @([int]$e.id); areas = @($blockedArea) } | Out-Null
                }
                $rtype = 1; if ($s.reason -eq 'Termination') { $rtype = 2 }
                Invoke-Tp 'Post' '/personnel/api/resigns/' @{ employee = [int]$e.id; resign_date = $today; resign_type = $rtype; disableatt = $true; reason = ('Samara ERP: ' + [string]$s.reason) } | Out-Null
              }
              [void]$actions.Add(@{ type = 'resigned'; emp_code = $code; name = $s.name; note = ('Blocked and marked Resigned (' + [string]$s.reason + ')') })
              $summary.resigned++
              Write-Log "RESIGNED  $label ($($s.reason))"
            } else { $summary.unchanged++ }
          }
        }
      } catch {
        [void]$errors.Add(@{ emp_code = $code; name = $s.name; message = $_.Exception.Message })
        Write-Log "ERROR     $label : $($_.Exception.Message)"
      }
    }

    $known = @{}; foreach ($s in $staff) { $known[[string]$s.emp_code] = $true }
    foreach ($code in $tpEmps.Keys) {
      if (-not $known.ContainsKey([string]$code)) {
        $summary.not_in_erp++
        [void]$actions.Add(@{ type = 'not_in_erp'; emp_code = [string]$code; name = [string]$tpEmps[$code].first_name; note = 'In easy TimePro but not in the ERP - left unchanged' })
      }
    }
  } catch {
    [void]$errors.Add(@{ message = $_.Exception.Message })
    Write-Log "ERROR     $($_.Exception.Message)"
  }

  # Report to the ERP (HR -> Biometric Attendance -> Staff Sync). "not_in_erp" lines alone do not count as changes.
  $real = @($actions | Where-Object { $_.type -ne 'not_in_erp' })
  $send = $real
  if ($real.Count -gt 0 -or $errors.Count -gt 0 -or $dry) { $send = @($actions) }
  $report = @{ ok = ($errors.Count -eq 0); dry_run = $dry; summary = $summary; actions = @($send); errors = @($errors);
               agent = ("Samara Biometric Sync {0} on {1}" -f $AgentVersion, $env:COMPUTERNAME) }
  try { Invoke-RestMethod -Method Post -Uri $erpUrl -Body (ConvertTo-JsonBody $report) -ContentType 'application/json; charset=utf-8' -TimeoutSec 60 | Out-Null }
  catch { Write-Log "Could not send the result to the ERP: $($_.Exception.Message)" }

  $mode = ''; if ($dry) { $mode = ' (TEST - nothing changed)' }
  Write-Log ("Done{0}: added {1}, restored {2}, blocked {3}, resigned {4}, updated {5}, unchanged {6}, not in ERP {7}, errors {8}" -f $mode,
    $summary.added, $summary.restored, $summary.blocked, $summary.resigned, $summary.updated, $summary.unchanged, $summary.not_in_erp, $errors.Count)
  return ($errors.Count -eq 0)
}

# ---------------- setup / uninstall ----------------
function Invoke-Setup {
  Write-Host ''
  Write-Host '=== Samara Biometric Sync - setup ===' -ForegroundColor Magenta
  Write-Host 'Step 1. In the ERP open HR -> Biometric Attendance -> Staff Sync and press "Copy Staff Sync URL".'
  $url = (Read-Host 'Paste the Staff Sync URL here and press Enter').Trim()
  if ($url -notmatch '^https://.+/functions/v1/biometric-staff-sync\?key=\w+') { throw 'That does not look like the Staff Sync URL. Copy it again from the ERP.' }
  $tp = (Read-Host 'easy TimePro address [press Enter for http://127.0.0.1:8081]').Trim()
  if (-not $tp) { $tp = 'http://127.0.0.1:8081' }
  Write-Host 'Step 2. Enter the easy TimePro login (the one you use to open easy TimePro, e.g. admin).'
  $cred = Get-Credential -Message 'easy TimePro login (saved encrypted for this Windows user only)'
  if (-not $cred) { throw 'No login entered.' }
  $cred | Export-Clixml -Path $CredPath
  $old = Read-Config
  $cfg = [ordered]@{
    ErpUrl = $url; TimeProUrl = $tp.TrimEnd('/')
    DepartmentCode = '2'                  # Mogappair
    PositionCode = '1'
    ActiveAreaCode = '2'; ActiveAreaName = 'Samara Mogappair'          # put the biometric machine in this area
    BlockedAreaCode = '99'; BlockedAreaName = 'Blocked - No Access'    # never put a machine in this area
  }
  if ($old) { foreach ($k in 'DepartmentCode','PositionCode','ActiveAreaCode','ActiveAreaName','BlockedAreaCode','BlockedAreaName') { if ($old.$k) { $cfg[$k] = $old.$k } } }
  Save-Config $cfg
  if ($PSCommandPath -and ($PSCommandPath -ne $ScriptCopy)) { Copy-Item -Path $PSCommandPath -Destination $ScriptCopy -Force }

  Write-Host ''
  Write-Host 'Step 3. Test run - nothing is changed:' -ForegroundColor Magenta
  $ok = Invoke-Sync $true
  if (-not $ok) { Write-Host 'The test run had errors (see above). Fix them and run setup again.' -ForegroundColor Red; return }
  Write-Host ''
  $ans = Read-Host 'Apply these changes now and run automatically every 5 minutes? (Y/N)'
  if ($ans -notmatch '^[Yy]') { Write-Host 'Nothing changed. Run setup again when ready.'; return }

  Invoke-Sync $false | Out-Null
  # a tiny launcher so no window flashes on the screen every 5 minutes
  $vbs = Join-Path $AppDir 'run-hidden.vbs'
  $cmd = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{0}"" -Run' -f $ScriptCopy
  Set-Content -Path $vbs -Encoding ASCII -Value ('CreateObject("WScript.Shell").Run "{0}", 0, True' -f $cmd)
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}"' -f $vbs)
  $t1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  $t2 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($t1, $t2) -Settings $set -Description 'Samara ERP staff list -> easy TimePro (biometric access). Runs every 5 minutes.' -Force | Out-Null
  Write-Host ''
  Write-Host "Done. '$TaskName' now runs every 5 minutes and at Windows sign-in." -ForegroundColor Green
  Write-Host "Results show in the ERP (HR -> Biometric Attendance -> Staff Sync). Log file: $LogPath"
}
function Invoke-Uninstall {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item $ConfigPath, $CredPath -ErrorAction SilentlyContinue
  Write-Host 'Samara Biometric Sync removed (easy TimePro data is not touched).'
}


# ---------------- diagnose (prints what easy TimePro answers; never prints the password or token) ----------------
function Invoke-Diagnose {
  $cfg = Read-Config; if (-not $cfg) { throw 'Not set up yet.' }
  $cred = Import-Clixml $CredPath
  $user = $cred.UserName; $pass = $cred.GetNetworkCredential().Password
  $base = $cfg.TimeProUrl.TrimEnd('/')
  $json = ConvertTo-JsonBody @{ username = $user; password = $pass }
  $form = 'username=' + [Uri]::EscapeDataString($user) + '&password=' + [Uri]::EscapeDataString($pass)
  $tests = @(@{ n = 'JWT json'; p = '/jwt-api-token-auth/'; s = 'JWT'; b = $json; c = 'application/json' },
             @{ n = 'JWT form'; p = '/jwt-api-token-auth/'; s = 'JWT'; b = $form; c = 'application/x-www-form-urlencoded' },
             @{ n = 'Token json'; p = '/api-token-auth/'; s = 'Token'; b = $json; c = 'application/json' })
  Write-Host ''
  Write-Host ("--- browser-style sign-in as '{0}'" -f $user) -ForegroundColor Magenta
  try {
    $wh = Connect-TpWebSession $base $user $pass
    foreach ($path in '/personnel/api/departments/', '/personnel/api/areas/', '/personnel/api/employees/?page_size=100') {
      $d = Invoke-RestMethod -Method Get -Uri ($base + $path) -Headers $wh -WebSession $script:TpSession -TimeoutSec 30
      $items = @($d.data) | ForEach-Object { if ($_.dept_code) { "$($_.dept_code)=$($_.dept_name)" } elseif ($_.area_code) { "$($_.area_code)=$($_.area_name)" } else { "$($_.emp_code)" } }
      Write-Host ("  {0}: count={1} -> {2}" -f $path, $d.count, ($items -join ', '))
    }
  } catch { Write-Host "  FAILED: $($_.Exception.Message)" }
  foreach ($t in $tests) {
    Write-Host ''
    Write-Host ("--- login {0} ({1}) as '{2}'" -f $t.n, $t.p, $user) -ForegroundColor Magenta
    try {
      $r = Invoke-RestMethod -Method Post -Uri ($base + $t.p) -Body $t.b -ContentType $t.c -TimeoutSec 30
      $keys = ($r.PSObject.Properties | ForEach-Object { $_.Name }) -join ', '
      if (-not $r.token) { Write-Host "  no token. Answer keys: $keys"; continue }
      Write-Host "  OK (answer keys: $keys)"
      $h = @{ Authorization = ('{0} {1}' -f $t.s, $r.token) }
      foreach ($path in '/personnel/api/departments/', '/personnel/api/areas/', '/personnel/api/employees/?page_size=100') {
        try {
          $d = Invoke-RestMethod -Method Get -Uri ($base + $path) -Headers $h -TimeoutSec 30
          $items = @($d.data) | ForEach-Object { if ($_.dept_code) { "$($_.dept_code)=$($_.dept_name)" } elseif ($_.area_code) { "$($_.area_code)=$($_.area_name)" } else { "$($_.emp_code)" } }
          Write-Host ("  {0}: count={1} code={2} msg={3} next={4} -> {5}" -f $path, $d.count, $d.code, $d.msg, $d.next, ($items -join ', '))
        } catch { Write-Host ("  {0}: ERROR {1}" -f $path, $_.Exception.Message) }
      }
    } catch {
      $detail = ''; try { $detail = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
      if ($detail.Length -gt 300) { $detail = $detail.Substring(0, 300) }
      Write-Host ("  FAILED: {0} {1}" -f $_.Exception.Message, $detail)
    }
  }
}

# ---------------- start ----------------
try {
  if ($Uninstall) { Invoke-Uninstall; exit 0 }
  if ($Diagnose) { Invoke-Diagnose; Read-Host 'Press Enter to close' | Out-Null; exit 0 }
  if ($Run) {
    $script:Quiet = $true
    # only one run at a time
    $mutex = New-Object System.Threading.Mutex($false, 'Local\SamaraBiometricSync')
    if (-not $mutex.WaitOne(0)) { exit 0 }
    try { $ok = Invoke-Sync $false; Trim-Log } finally { $mutex.ReleaseMutex() }
    if ($ok) { exit 0 } else { exit 1 }
  }
  if ($DryRun) { Invoke-Sync $true | Out-Null; exit 0 }
  if ($Setup -or -not (Test-Path $ConfigPath) -or -not (Test-Path $CredPath)) { Invoke-Setup }
  else {
    Write-Host 'Samara Biometric Sync is already set up. Running once now...' -ForegroundColor Magenta
    Invoke-Sync $false | Out-Null
    Write-Host 'To change the URL or password run again with -Setup.'
  }
} catch {
  Write-Log "ERROR $($_.Exception.Message)"
  if (-not $script:Quiet) { Write-Host $_.Exception.Message -ForegroundColor Red }
}
if (-not $Run -and -not $script:Quiet -and $Host.Name -eq 'ConsoleHost') { Read-Host 'Press Enter to close' | Out-Null }
