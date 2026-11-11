<#
  Samara Biometric Sync  (ERP 2.20.24)
  ------------------------------------
  Keeps easy TimePro (and so the ZKTeco machine) in line with the Samara ERP employee list:
    • new active employees in the ERP      → added to easy TimePro, in the machine's area
    • suspended in the ERP                 → moved to the "Blocked - No Access" area (cannot punch;
                                             fingerprint / face kept, restored on reinstatement)
    • resigned / terminated / disabled     → blocked and marked Resigned in easy TimePro
    • reinstated / enabled again           → restored automatically
  Machine number = the number linked to the employee in ERP -> HR -> Biometric Attendance -> Link Staff
  (the machine's own numbers are kept). Active ERP staff with no machine number are added with the
  next free number and linked automatically. Unlinked machine numbers are never changed.
  Department = the employee's ERP department (created in easy TimePro when missing; staff are
  moved when their ERP department changes). No ERP department -> Mogappair (or easy TimePro's first department).
  Staff in easy TimePro not linked to an ERP employee are only reported, never changed.

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
$AgentVersion = '2.20.26'
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
function Get-ZkEncrypt([string]$data, [string]$key) {
  # easy TimePro login scrambling (RC4 with the form key, then Base64) - same as zkEncrypt() in easy-login.min.js
  $s = New-Object int[] 256
  for ($i = 0; $i -lt 256; $i++) { $s[$i] = $i }
  $j = 0
  for ($i = 0; $i -lt 256; $i++) {
    $j = ($j + $s[$i] + [int][char]$key[$i % $key.Length]) % 256
    $t = $s[$i]; $s[$i] = $s[$j]; $s[$j] = $t
  }
  $i = 0; $j = 0
  $out = New-Object byte[] $data.Length
  for ($r = 0; $r -lt $data.Length; $r++) {
    $i = ($i + 1) % 256
    $j = ($j + $s[$i]) % 256
    $t = $s[$i]; $s[$i] = $s[$j]; $s[$j] = $t
    $out[$r] = [byte](([int][char]$data[$r] -bxor $s[($s[$i] + $s[$j]) % 256]) -band 0xFF)
  }
  return [Convert]::ToBase64String($out)
}
function ConvertTo-FormValue([string]$v) { return ([Uri]::EscapeDataString($v) -replace '%20', '+') }
function Connect-TpWebSession($base, $user, $pass) {
  # The same sign-in as the easy TimePro page in the browser (sees every department / area / employee).
  $sess = $null
  $page = Invoke-WebRequest -Uri ($base + '/login/') -SessionVariable sess -UseBasicParsing -TimeoutSec 30
  $m = [regex]::Match($page.Content, 'name=["'']csrfmiddlewaretoken["''][^>]*value=["'']([^"'']+)')
  if (-not $m.Success) { $m = [regex]::Match($page.Content, 'value=["'']([^"'']+)["''][^>]*name=["'']csrfmiddlewaretoken') }
  if (-not $m.Success) { throw 'login page without form key' }
  $formKey = $m.Groups[1].Value
  # easy TimePro's login page scrambles the whole form with its form key before sending (see Get-ZkEncrypt)
  $plain = 'csrfmiddlewaretoken=' + (ConvertTo-FormValue $formKey) + '&username=' + (ConvertTo-FormValue $user) +
           '&password=' + (ConvertTo-FormValue $pass) + '&template10=&login_type=pwd'
  $body = 'encrypt_data=' + [Uri]::EscapeDataString((Get-ZkEncrypt $plain $formKey)) + '&csrfmiddlewaretoken=' + [Uri]::EscapeDataString($formKey)
  $cookieKey = $formKey
  foreach ($c in $sess.Cookies.GetCookies([Uri]($base + '/'))) { if ($c.Name -eq 'csrftoken') { $cookieKey = $c.Value } }
  $resp = Invoke-WebRequest -Uri ($base + '/login/') -Method Post -Body $body -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' -WebSession $sess `
    -Headers @{ Referer = ($base + '/login/'); 'X-Requested-With' = 'XMLHttpRequest'; 'X-CSRFToken' = $cookieKey; Accept = 'application/json, text/javascript, */*; q=0.01' } -UseBasicParsing -TimeoutSec 30
  try { $ans = $resp.Content | ConvertFrom-Json } catch { $ans = $null }
  if ($ans -and $null -ne $ans.ret -and [string]$ans.ret -ne '0') { throw ("easy TimePro said: {0}" -f $ans.message) }
  $test = Invoke-WebRequest -Uri ($base + '/personnel/api/departments/') -WebSession $sess -Headers @{ Accept = 'application/json' } -UseBasicParsing -TimeoutSec 30
  if ($test.Content -notmatch '^\s*\{') { throw 'browser-style sign-in was not accepted (check the user name / password)' }
  $csrf = ''
  foreach ($c in $sess.Cookies.GetCookies([Uri]($base + '/'))) { if ($c.Name -eq 'csrftoken') { $csrf = $c.Value } }
  $script:TpSession = $sess
  $script:TpScheme = 'Web'
  return @{ 'X-CSRFToken' = $csrf; Referer = ($base + '/'); Accept = 'application/json' }
}
function Get-PlainUser($cred) {
  # the Windows login box can return "\admin" or "PC\admin" - easy TimePro wants just "admin"
  $u = [string]$cred.GetNetworkCredential().UserName
  if (-not $u) { $u = [string]$cred.UserName }
  return ($u -replace '^.*\\', '').Trim()
}
function Get-TpAuthHeader($cfg) {
  $cred = Import-Clixml $CredPath
  $user = Get-PlainUser $cred
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
function Get-AreaCodes($emp) {
  # this easy TimePro version works with area / department / employee CODES
  return @($emp.area | Where-Object { $null -ne $_ } | ForEach-Object {
    if ($_ -is [System.Management.Automation.PSCustomObject]) {
      if ($_.area_code) { [string]$_.area_code } else { $id = $_.id; [string](($script:Areas | Where-Object { $_.id -eq $id } | Select-Object -First 1).area_code) }
    } else { $id = $_; [string](($script:Areas | Where-Object { [string]$_.id -eq [string]$id } | Select-Object -First 1).area_code) }
  })
}
function Get-DeptName([string]$name) {
  # easy TimePro refuses "&" in a department name -> "and"
  return (($name -replace '\s*&\s*', ' and ') -replace '\s+', ' ').Trim()
}
function Get-DeptCode($name, [bool]$dry) {
  # easy TimePro department code for an ERP department name (matched by name; created when missing)
  $n = Get-DeptName ([string]$name)
  if (-not $n) { return [string]$script:FallbackDept.dept_code }
  $key = $n.ToLower()
  if ($script:DeptCache.ContainsKey($key)) { return $script:DeptCache[$key] }
  $d = $script:DeptList | Where-Object { (Get-DeptName ([string]$_.dept_name)).ToLower() -eq $key } | Select-Object -First 1
  if ($d) { $script:DeptCache[$key] = [string]$d.dept_code; return [string]$d.dept_code }
  $codes = @($script:DeptList | ForEach-Object { $c = 0; if ([int]::TryParse([string]$_.dept_code, [ref]$c)) { $c } })
  $next = 10; if ($codes.Count -gt 0) { $next = [Math]::Max(10, ($codes | Measure-Object -Maximum).Maximum + 1) }
  if ($dry) {
    Write-Log ("  (test) would create department {0} '{1}' in easy TimePro" -f $next, $n)
    $script:DeptList += [pscustomobject]@{ id = -1; dept_code = [string]$next; dept_name = $n }
    $script:DeptCache[$key] = [string]$next; return [string]$next
  }
  Invoke-Tp 'Post' '/personnel/api/departments/' @{ dept_code = [string]$next; dept_name = $n } | Out-Null
  Write-Log ("  Created department {0} '{1}' in easy TimePro" -f $next, $n)
  $script:DeptList = Get-TpAll '/personnel/api/departments/'
  $script:DeptCache[$key] = [string]$next; return [string]$next
}
function Set-TpEmployee([string]$code, $fields) {
  # edit one employee (looked up by its machine number); this version needs department + area in every edit
  $cur = Invoke-Tp 'Get' ("/personnel/api/employees/{0}/" -f $code)
  if ([string]$cur.emp_code -ne $code) { throw "easy TimePro returned machine no. $($cur.emp_code) for $code - edit skipped" }
  Invoke-Tp 'Patch' ("/personnel/api/employees/{0}/" -f $code) $fields | Out-Null
}
function Move-TpArea([string]$code, [string]$areaCode) {
  Invoke-Tp 'Post' '/personnel/api/employees/adjust_area/' @{ emp_code = @($code); area_code = @($areaCode) } | Out-Null
}
function Get-ShortName($name) { $n = ([string]$name).Trim(); return $n.Substring(0, [Math]::Min(25, $n.Length)) }
function Ensure-Area([string]$code, [string]$name, [bool]$dry) {
  $a = $script:Areas | Where-Object { [string]$_.area_code -eq $code } | Select-Object -First 1
  if ($a) { return [string]$a.area_code }
  if ($dry) { Write-Log "  (test) would create area $code '$name' in easy TimePro"; return $code }
  $new = Invoke-Tp 'Post' '/personnel/api/areas/' @{ area_code = $code; area_name = $name }
  $id = $new.id; if (-not $id -and $new.data) { $id = $new.data.id }
  Write-Log "  Created area $code '$name' in easy TimePro"
  $script:Areas = Get-TpAll '/personnel/api/areas/'
  return $code
}

# ---------------- one sync run ----------------
function Invoke-Sync([bool]$dry) {
  $script:Cfg = Read-Config
  if (-not $script:Cfg) { throw 'Not set up yet. Run this file with -Setup.' }
  Write-Log ("easy TimePro: {0} on {1}" -f $script:Cfg.TimeProUrl, $env:COMPUTERNAME)
  $actions = New-Object System.Collections.ArrayList
  $errors  = New-Object System.Collections.ArrayList
  $links   = New-Object System.Collections.ArrayList
  $deviceUsers = New-Object System.Collections.ArrayList
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
    # department for staff with no ERP department: Mogappair if it exists, else easy TimePro's first department (never created)
    $dept = $depts | Where-Object { [string]$_.dept_name -eq 'Mogappair' } | Select-Object -First 1
    if (-not $dept) { $dept = $depts | Where-Object { [string]$_.dept_code -eq [string]$script:Cfg.DepartmentCode } | Select-Object -First 1 }
    if (-not $dept) { $dept = $depts | Sort-Object { [string]$_.dept_code } | Select-Object -First 1 }
    if (-not $dept) { throw 'easy TimePro has no departments.' }
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

    $maxCode = 0
    foreach ($k in (@($tpEmps.Keys) + @($resigned.Keys))) { $n = 0; if ([int]::TryParse([string]$k, [ref]$n) -and $n -gt $maxCode) { $maxCode = $n } }
    foreach ($k in $tpEmps.Keys) { [void]$deviceUsers.Add(@{ emp_code = [string]$k; name = [string]$tpEmps[$k].first_name }) }

    $linkedCodes = @{}; foreach ($s in $staff) { if ($s.emp_code) { $linkedCodes[[string]$s.emp_code] = $true } }
    foreach ($s in $staff) {
      if (-not $s.emp_code) {
        # active ERP employee with no machine number yet -> add with the next free number and link it in the ERP
        if ($s.status -ne 'active') { continue }
        # already added by an earlier run whose report did not reach the ERP? -> just link it again
        $short = Get-ShortName $s.name
        $prev = $tpEmps.Values | Where-Object { -not $linkedCodes.ContainsKey([string]$_.emp_code) -and ([string]$_.first_name).Trim() -ceq $short -and (-not $s.mobile -or [string]$_.mobile -eq [string]$s.mobile) } | Select-Object -First 1
        if ($prev) {
          if (-not $dry) { [void]$links.Add(@{ profile_id = [string]$s.profile_id; emp_code = [string]$prev.emp_code; name = $short }) }
          $linkedCodes[[string]$prev.emp_code] = $true
          [void]$actions.Add(@{ type = 'updated'; emp_code = [string]$prev.emp_code; name = $s.name; note = ("Linked to machine no. {0} (already in easy TimePro)" -f $prev.emp_code) })
          $summary.updated++
          Write-Log ("LINKED    {0} ({1}) -> machine no. {2}" -f $s.name, $s.employee_id, $prev.emp_code)
          continue
        }
        $maxCode++
        $code = [string]$maxCode
        $label = "{0} ({1}, new machine no. {2})" -f $s.name, $s.employee_id, $code
        try {
          $body = [ordered]@{ emp_code = $code; first_name = (Get-ShortName $s.name); department = (Get-DeptCode $s.department $dry); area = @($activeArea) }
          if ($pos) { $body.position = [string]$pos.position_code }
          if ($s.date_of_joining) { $body.hire_date = [string]$s.date_of_joining }
          if ($s.gender) { $body.gender = [string]$s.gender }
          if ($s.mobile) { $body.mobile = [string]$s.mobile }
          if (-not $dry) {
            Invoke-Tp 'Post' '/personnel/api/employees/' $body | Out-Null
            [void]$links.Add(@{ profile_id = [string]$s.profile_id; emp_code = $code; name = (Get-ShortName $s.name) })
          }
          [void]$actions.Add(@{ type = 'added'; emp_code = $code; name = $s.name; note = ("Added to easy TimePro as machine no. {0} - enrol fingerprint / face on the machine" -f $code) })
          $summary.added++
          Write-Log "ADDED     $label"
        } catch {
          [void]$errors.Add(@{ emp_code = $code; name = $s.name; message = $_.Exception.Message })
          Write-Log "ERROR     $label : $($_.Exception.Message)"
        }
        continue
      }
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
              # linked number not in easy TimePro (deleted there?) -> add it back under the same number
              $body = [ordered]@{ emp_code = $code; first_name = (Get-ShortName $s.name); department = (Get-DeptCode $s.department $dry); area = @($activeArea) }
              if ($pos) { $body.position = [string]$pos.position_code }
              if ($s.date_of_joining) { $body.hire_date = [string]$s.date_of_joining }
              if ($s.gender) { $body.gender = [string]$s.gender }
              if ($s.mobile) { $body.mobile = [string]$s.mobile }
              if (-not $dry) { Invoke-Tp 'Post' '/personnel/api/employees/' $body | Out-Null }
              [void]$actions.Add(@{ type = 'added'; emp_code = $code; name = $s.name; note = 'New employee added to easy TimePro' })
              $summary.added++
              Write-Log "ADDED     $label"
              continue
            }
            $ids = @(Get-AreaCodes $e)
            $changed = $false
            if ($ids.Count -ne 1 -or $ids[0] -ne $activeArea) {
              if (-not $dry) { Move-TpArea $code $activeArea }
              $note = 'Moved to the machine area'
              if ($wasResigned) { $note = 'Back on the machine' }
              elseif ($ids -contains $blockedArea) { $note = 'Unblocked (suspension over) - back on the machine' }
              [void]$actions.Add(@{ type = 'restored'; emp_code = $code; name = $s.name; note = $note })
              $summary.restored++; $changed = $true
              Write-Log "AREA      $label -> $note"
            }
            $want = Get-ShortName $s.name
            $patch = @{}
            if ([string]$e.first_name -ne $want) { $patch.first_name = $want }
            if ($s.mobile -and [string]$e.mobile -ne [string]$s.mobile) { $patch.mobile = [string]$s.mobile }
            $wantDept = Get-DeptCode $s.department $dry
            $haveDept = $null; if ($e.department -is [System.Management.Automation.PSCustomObject]) { $haveDept = [string]$e.department.dept_code } elseif ($e.department) { $haveDept = [string]$e.department }
            if ($haveDept -ne $wantDept) { $patch.department = $wantDept }
            if ($patch.Count -gt 0) {
              if (-not $dry) {
                $full = @{ first_name = $want; department = $wantDept; area = @($activeArea) }
                if ($s.mobile) { $full.mobile = [string]$s.mobile }
                Set-TpEmployee $code $full
              }
              $what = ($patch.Keys | Sort-Object | ForEach-Object { if ($_ -eq 'department') { "department -> $($s.department)" } else { $_ } }) -join ', '
              [void]$actions.Add(@{ type = 'updated'; emp_code = $code; name = $s.name; note = ('Updated ' + $what) })
              $summary.updated++; $changed = $true
              Write-Log "UPDATED   $label ($what)"
            }
            if (-not $changed) { $summary.unchanged++ }
          }
          'suspended' {
            if ($e) {
              $ids = @(Get-AreaCodes $e)
              if ($resigned.ContainsKey($code)) { $summary.unchanged++ }
              elseif ($ids.Count -ne 1 -or $ids[0] -ne $blockedArea) {
                if (-not $dry) { Move-TpArea $code $blockedArea }
                [void]$actions.Add(@{ type = 'blocked'; emp_code = $code; name = $s.name; note = 'Suspended - removed from the machine (fingerprint kept)' })
                $summary.blocked++
                Write-Log "BLOCKED   $label (suspended)"
              } else { $summary.unchanged++ }
            } else { $summary.unchanged++ }
          }
          'exited' {
            if ($e -and -not $resigned.ContainsKey($code)) {
              $ids = @(Get-AreaCodes $e)
              if (-not $dry) {
                if ($ids.Count -ne 1 -or $ids[0] -ne $blockedArea) { Move-TpArea $code $blockedArea }
                $rtype = 1; if ($s.reason -eq 'Termination') { $rtype = 2 }
                Invoke-Tp 'Post' '/personnel/api/resigns/' @{ employee = $code; resign_date = $today; report_generation_end_date = $today; resign_type = $rtype; disableatt = $true; reason = ('Samara ERP: ' + [string]$s.reason) } | Out-Null
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

    $known = $linkedCodes
    foreach ($code in $tpEmps.Keys) {
      if (-not $known.ContainsKey([string]$code) -and -not $resigned.ContainsKey([string]$code)) {
        $summary.not_in_erp++
        [void]$actions.Add(@{ type = 'not_in_erp'; emp_code = [string]$code; name = [string]$tpEmps[$code].first_name; note = 'Not linked to an ERP employee - left unchanged (link it in Link Staff if it is staff)' })
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
               links = @($links); device_users = @($deviceUsers);
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
  $tpUser = (Read-Host 'easy TimePro user name [press Enter for admin]').Trim()
  if (-not $tpUser) { $tpUser = 'admin' }
  $tpPass = Read-Host 'easy TimePro password (hidden while you type)' -AsSecureString
  if (-not $tpPass -or $tpPass.Length -eq 0) { throw 'No password entered.' }
  $cred = New-Object System.Management.Automation.PSCredential($tpUser, $tpPass)
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
  $user = Get-PlainUser $cred; $pass = $cred.GetNetworkCredential().Password
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
