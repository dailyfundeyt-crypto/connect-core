<#
  ConnectBackup.Common.ps1 - shared helpers for Backup-Connect.ps1, Restore-Connect.ps1 and
  Import-LocalToSupabase.ps1 (dot-sourced, not run on its own).

  Backup file format (*.zip.aes), version 1:
    "CNBK" | version (1 byte = 1) | PBKDF2 iterations (int32 LE) | salt (16) | IV (16) | AES-256-CBC ciphertext | HMAC-SHA256 (32)
  Key: PBKDF2-HMAC-SHA256(password, salt, iterations) -> 64 bytes = 32 AES key + 32 HMAC key.
  HMAC covers everything before it (encrypt-then-MAC), so a wrong password or a damaged file is detected
  BEFORE anything is decrypted.

  The password is NEVER in a script. It is stored DPAPI-protected (CurrentUser, this Windows account on this PC):
    %LOCALAPPDATA%\Connect\backup-password.dpapi
  Restoring on another PC needs the password itself (keep it in a password manager: Backup-Connect.ps1 -ShowPassword).
#>

Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$script:CnbkMagic     = [byte[]](0x43, 0x4E, 0x42, 0x4B)   # "CNBK"
$script:CnbkIter      = 200000
$script:PasswordFile  = Join-Path $env:LOCALAPPDATA "Connect\backup-password.dpapi"
$script:LogFile       = Join-Path $env:TEMP "connect-backup.log"
$script:Utf8NoBom     = New-Object System.Text.UTF8Encoding($false)

function Write-Log([string]$Message, [string]$Level = "INFO") {
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  try { [IO.File]::AppendAllText($script:LogFile, $line + "`r`n", $script:Utf8NoBom) } catch { }
  $color = @{ INFO = "Gray"; OK = "Green"; WARN = "Yellow"; ERROR = "Red" }[$Level]
  if (-not $color) { $color = "Gray" }
  Write-Host $line -ForegroundColor $color
}

# Runs a native exe without letting PowerShell 5.1 turn its stderr into terminating errors.
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = @($out) }
  } finally { $ErrorActionPreference = $old }
}

function Read-DotEnv([string]$Path) {
  $h = @{}
  if (-not (Test-Path $Path)) { return $h }
  foreach ($l in [IO.File]::ReadAllLines($Path)) {
    if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $v = $Matches[2].Trim()
      if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) { $v = $v.Substring(1, $v.Length - 2) }
      $h[$Matches[1]] = $v
    }
  }
  $h
}

# postgres://user:pass@host:port/db?sslmode=... -> object (password kept out of every command line; use $env:PGPASSWORD)
function ConvertFrom-PgUrl([string]$Url) {
  $u = [Uri]$Url
  $ui = $u.UserInfo -split ':', 2
  $q = @{}
  foreach ($kv in $u.Query.TrimStart('?') -split '&') { if ($kv -match '^([^=]+)=(.*)$') { $q[$Matches[1]] = [Uri]::UnescapeDataString($Matches[2]) } }
  $hostName = $u.Host
  if ($hostName -eq "localhost") { $hostName = "127.0.0.1" }
  $isRemote = -not ($hostName -in @("127.0.0.1", "::1", "[::1]"))
  $ssl = $q["sslmode"]
  if (-not $ssl) { $ssl = $(if ($isRemote) { "require" } else { "disable" }) }
  [pscustomobject]@{
    Host     = $hostName
    Port     = $(if ($u.Port -gt 0) { $u.Port } else { 5432 })
    User     = [Uri]::UnescapeDataString($ui[0])
    Password = $(if ($ui.Count -gt 1) { [Uri]::UnescapeDataString($ui[1]) } else { "" })
    Database = $u.AbsolutePath.TrimStart('/')
    SslMode  = $ssl
    IsRemote = $isRemote
    IsSupabase = ($hostName -like "*.supabase.com" -or $hostName -like "*.supabase.co")
  }
}

function Get-PgConnInfo($Db) { "host=$($Db.Host) port=$($Db.Port) dbname=$($Db.Database) user=$($Db.User) sslmode=$($Db.SslMode) connect_timeout=15" }

# PostgreSQL 17 client tools (pg_dump/psql). Prefers the installed Connect App, then the bundle in the copy.
function Find-PgBin([string]$RepoRoot) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Connect App\runtime\pgsql\bin"),
    (Join-Path $RepoRoot "apps\connect-app\runtime\pgsql\bin"),
    (Join-Path $RepoRoot "apps\connect-app\_build\pgsql\bin")
  )
  foreach ($c in $candidates) { if (Test-Path (Join-Path $c "pg_dump.exe")) { return $c } }
  throw "pg_dump.exe (PostgreSQL 17) nicht gefunden. Gesucht: $($candidates -join '; ')"
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMs = 1500) {
  $c = New-Object Net.Sockets.TcpClient
  try { $ar = $c.BeginConnect($HostName, $Port, $null, $null); if (-not $ar.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }; $c.EndConnect($ar); return $true }
  catch { return $false } finally { $c.Close() }
}

# ---------- password (DPAPI) ----------
function Get-BackupPassword([switch]$CreateIfMissing) {
  if (Test-Path $script:PasswordFile) {
    $enc = [IO.File]::ReadAllBytes($script:PasswordFile)
    $raw = [Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    return [Text.Encoding]::UTF8.GetString($raw)
  }
  if (-not $CreateIfMissing) { return $null }
  $bytes = New-Object byte[] 30
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pw = [Convert]::ToBase64String($bytes).Replace('+', 'x').Replace('/', 'y')
  Set-BackupPassword $pw
  Write-Log "Neues Backup-Passwort erzeugt und per DPAPI gespeichert ($($script:PasswordFile)). Fuer Wiederherstellung auf einem anderen PC: Backup-Connect.ps1 -ShowPassword und im Passwort-Manager ablegen." "WARN"
  $pw
}

function Set-BackupPassword([string]$Password) {
  if ($Password.Length -lt 12) { throw "Backup-Passwort zu kurz (mindestens 12 Zeichen)." }
  $dir = Split-Path $script:PasswordFile
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $enc = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($Password), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($script:PasswordFile, $enc)
}

function ConvertFrom-SecureStringPlain([Security.SecureString]$s) {
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

# ---------- crypto ----------
function Get-DerivedKeys([string]$Password, [byte[]]$Salt, [int]$Iterations) {
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($Password, $Salt, $Iterations, [Security.Cryptography.HashAlgorithmName]::SHA256)
  try { $k = $kdf.GetBytes(64) } finally { $kdf.Dispose() }
  ,@([byte[]]$k[0..31], [byte[]]$k[32..63])
}

function Protect-BackupFile([string]$InFile, [string]$OutFile, [string]$Password) {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $salt = New-Object byte[] 16; $rng.GetBytes($salt)
  $iv   = New-Object byte[] 16; $rng.GetBytes($iv)
  $keys = Get-DerivedKeys $Password $salt $script:CnbkIter
  $aes = [Security.Cryptography.Aes]::Create()
  $aes.KeySize = 256; $aes.Mode = "CBC"; $aes.Padding = "PKCS7"; $aes.Key = $keys[0]; $aes.IV = $iv
  $fs = [IO.File]::Open($OutFile, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite)
  try {
    $fs.Write($script:CnbkMagic, 0, 4)
    $fs.WriteByte(1)
    $fs.Write([BitConverter]::GetBytes([int]$script:CnbkIter), 0, 4)
    $fs.Write($salt, 0, 16); $fs.Write($iv, 0, 16)
    $cs = New-Object Security.Cryptography.CryptoStream($fs, $aes.CreateEncryptor(), [Security.Cryptography.CryptoStreamMode]::Write)
    $src = [IO.File]::OpenRead($InFile)
    try { $src.CopyTo($cs) } finally { $src.Dispose() }
    $cs.FlushFinalBlock()
    $fs.Flush()
    $fs.Position = 0
    $hmac = New-Object Security.Cryptography.HMACSHA256(,$keys[1])
    $tag = $hmac.ComputeHash($fs)        # reads header + ciphertext
    $fs.Position = $fs.Length
    $fs.Write($tag, 0, 32)
  } finally { $fs.Dispose(); $aes.Dispose() }
}

# Verifies the HMAC (throws on wrong password / damaged file). With -OutFile also decrypts.
function Unprotect-BackupFile([string]$InFile, [string]$Password, [string]$OutFile) {
  $fs = [IO.File]::OpenRead($InFile)
  try {
    if ($fs.Length -lt 4 + 1 + 4 + 32 + 16 + 32) { throw "Datei zu klein: $InFile" }
    $hdr = New-Object byte[] 41
    [void]$fs.Read($hdr, 0, 41)
    if ([BitConverter]::ToString($hdr, 0, 4) -ne [BitConverter]::ToString($script:CnbkMagic)) { throw "Keine Connect-Backup-Datei (Magic fehlt): $InFile" }
    if ($hdr[4] -ne 1) { throw "Unbekannte Backup-Version $($hdr[4])" }
    $iter = [BitConverter]::ToInt32($hdr, 5)
    $salt = [byte[]]$hdr[9..24]; $iv = [byte[]]$hdr[25..40]
    $keys = Get-DerivedKeys $Password $salt $iter
    $bodyLen = $fs.Length - 32
    $hmac = New-Object Security.Cryptography.HMACSHA256(,$keys[1])
    $fs.Position = 0
    $buf = New-Object byte[] 65536
    $left = $bodyLen
    while ($left -gt 0) {
      $n = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $left))
      if ($n -le 0) { throw "Unerwartetes Dateiende" }
      [void]$hmac.TransformBlock($buf, 0, $n, $null, 0); $left -= $n
    }
    [void]$hmac.TransformFinalBlock((New-Object byte[] 0), 0, 0)
    $tag = New-Object byte[] 32; [void]$fs.Read($tag, 0, 32)
    $diff = 0; for ($i = 0; $i -lt 32; $i++) { $diff = $diff -bor ($tag[$i] -bxor $hmac.Hash[$i]) }
    if ($diff -ne 0) { throw "HMAC stimmt nicht: falsches Passwort oder beschaedigte Datei ($InFile)" }
    if (-not $OutFile) { return $true }
    $aes = [Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256; $aes.Mode = "CBC"; $aes.Padding = "PKCS7"; $aes.Key = $keys[0]; $aes.IV = $iv
    $fs.Position = 41
    $out = [IO.File]::Open($OutFile, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    try {
      $cs = New-Object Security.Cryptography.CryptoStream($out, $aes.CreateDecryptor(), [Security.Cryptography.CryptoStreamMode]::Write)
      $left = $bodyLen - 41
      while ($left -gt 0) {
        $n = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $left))
        $cs.Write($buf, 0, $n); $left -= $n
      }
      $cs.FlushFinalBlock()
    } finally { $out.Dispose(); $aes.Dispose() }
    return $true
  } finally { $fs.Dispose() }
}

# Row counts of every table in public + drizzle (exact count(*), returned as ordered hashtable "schema.table" -> n)
function Get-TableCounts([string]$PgBin, $Db) {
  $sql = @'
DO $$ BEGIN END $$;
SELECT format('SELECT %L || E''\t'' || count(*) FROM %I.%I;', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','drizzle') ORDER BY 1 \gexec
'@
  $tmp = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($tmp, $sql, $script:Utf8NoBom)
    $env:PGPASSWORD = $Db.Password
    $r = Invoke-Native (Join-Path $PgBin "psql.exe") @("-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", (Get-PgConnInfo $Db), "-f", $tmp)
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue; Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  if ($r.ExitCode -ne 0) { throw "Zeilen zaehlen fehlgeschlagen ($($Db.Host):$($Db.Port)): $($r.Output -join ' | ')" }
  $h = [ordered]@{}
  foreach ($l in $r.Output) { if ($l -match '^([^\t]+)\t(\d+)$') { $h[$Matches[1]] = [long]$Matches[2] } }
  $h
}
