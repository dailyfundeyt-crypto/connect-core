<#
  Sync-AppToSupabase.ps1 - Connect App (lokale DB 127.0.0.1:5544) ADDITIV nach Supabase (connect-core, .env.supabase,
  das Backend von connect-kunc-preview.vercel.app) uebernehmen. Wiederholbar: ein zweiter Lauf findet 0 Aenderungen.

  Regeln:
    * Nichts wird geloescht. Fehlende Zeilen werden eingefuegt (ON CONFLICT DO NOTHING).
    * Gibt es eine Zeile auf beiden Seiten mit verschiedenem Inhalt: die neuere (updated_at) gewinnt, die andere
      Version landet in conflicts.json. Workspace-Werte (connect_workspace_kv) werden zusammengefuehrt (Vereinigung
      nach id, nichts faellt weg); nur einzelne Felder entscheidet updated_at.
    * Jede Aenderung an einer bestehenden Supabase-Zeile prueft, dass sie seit dem Export unveraendert ist
      (updated_at). Hat Stefan online inzwischen etwas geaendert -> Abbruch, ROLLBACK, nichts geschrieben.
    * Benutzer werden ueber die E-Mail zugeordnet (dailyfunde.yt -> derselbe Benutzer online). Bestehende
      Online-Benutzer werden nie veraendert.
    * Nicht synchronisiert: Login-Tokens/Sitzungen (accounts, sessions, verifications), Rollen (user_roles; kommen
      aus INITIAL_ADMIN_EMAILS), Protokoll (audit_events), Warteschlange (work_items), Paket-Zeilen (components,
      deployment_packages, Paket-Agents), lokale MCP-Tabellen und verschluesselte Zugangsdaten (credentials,
      mcp_user_credentials; anderer KEY_ENCRYPTION_KEY). Klare Testdaten (Persistenz-Test, App-Test) werden
      uebersprungen und im Bericht aufgelistet, nicht geloescht.
    * Vorher: verschluesselte Supabase-Sicherung (pg_dump public+drizzle -> AES, Backup-Passwort wie
      Backup-Connect.ps1) nach H:\Meine Ablage\Connect-Backups, geprueft (Entschluesseln + SHA-256 + Zeilenzahlen).

  Aufruf:  Sync-AppToSupabase.ps1            Probelauf (alles in einer Transaktion, dann ROLLBACK)
           Sync-AppToSupabase.ps1 -Commit    wirklich schreiben
  Ausgabe: <Kopie>\backups\sbsync-<Zeit>\ (sync.sql, conflicts.json, report.json; Ordner ist gitignored)
#>
param([switch]$Commit, [string]$BackupTarget = "H:\Meine Ablage\Connect-Backups")
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ConnectBackup.Common.ps1")
$Root  = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$work  = Join-Path $Root "backups\sbsync-$stamp"; $exp = Join-Path $work "export"
New-Item -ItemType Directory -Force $exp | Out-Null
$pgBin = Find-PgBin $Root; $psql = Join-Path $pgBin "psql.exe"; $pgDump = Join-Path $pgBin "pg_dump.exe"
$bun   = Join-Path $Root "apps\connect-app\runtime\bun\bun.exe"
$appE  = Read-DotEnv "$env:LOCALAPPDATA\ConnectApp\data\connect.env"
$app   = ConvertFrom-PgUrl "postgres://connect:$($appE['CONNECT_APP_DB_PASSWORD'])@127.0.0.1:5544/connect"
$sb    = ConvertFrom-PgUrl (Read-DotEnv (Join-Path $Root ".env.supabase"))["DATABASE_URL"]
if (-not $sb.IsSupabase) { throw "Ziel ist kein Supabase-Host: $($sb.Host)" }
if (-not (Test-TcpPort "127.0.0.1" 5544)) { throw "Connect App (Postgres 5544) laeuft nicht - erst die Connect App starten." }
Write-Log ("Sync App -> Supabase startet ({0}), Modus {1}" -f $sb.Host, $(if ($Commit) { "COMMIT" } else { "PROBELAUF" }))

function Psql($Db, [string[]]$a) {
  $env:PGPASSWORD = $Db.Password
  try { $r = Invoke-Native $psql (@("-X", "-v", "ON_ERROR_STOP=1", "-d", (Get-PgConnInfo $Db)) + $a) } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  if ($r.ExitCode -ne 0) { throw "psql ($($Db.Host)) fehlgeschlagen: $(($r.Output | Select-Object -Last 5) -join ' | ')" }
  $r.Output
}

# 1) verschluesselte, gepruefte Supabase-Sicherung
$plain = Join-Path $work "supabase-pre-sync.sql"
$countsBefore = Get-TableCounts $pgBin $sb
$env:PGPASSWORD = $sb.Password
try { $r = Invoke-Native $pgDump @("-d", (Get-PgConnInfo $sb), "--no-owner", "--no-privileges", "--encoding=UTF8", "-n", "public", "-n", "drizzle", "-f", $plain) } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
if ($r.ExitCode -ne 0 -or (Get-Item $plain).Length -lt 500) { throw "pg_dump Supabase fehlgeschlagen: $(($r.Output | Select-Object -First 4) -join ' | ')" }
$dumpRows = @{}; $cur = $null; $n = 0
foreach ($line in [IO.File]::ReadLines($plain)) {
  if ($null -eq $cur) { if ($line -match '^COPY (public|drizzle)\.("?)([A-Za-z0-9_]+)\2 .* FROM stdin;$') { $cur = "$($Matches[1]).$($Matches[3])"; $n = 0 } }
  elseif ($line -eq '\.') { $dumpRows[$cur] = $n; $cur = $null } else { $n++ }
}
$volatile = "public.sessions", "public.verifications", "public.audit_events", "public.work_items"
foreach ($k in $countsBefore.Keys) { $want = [int64]$countsBefore[$k]; $got = [int64]($dumpRows[$k]); if ($want -ne $got -and $volatile -notcontains $k) { throw "Sicherung unvollstaendig: $k live $want, im Dump $got" } }
if (-not (Test-Path $BackupTarget)) { $BackupTarget = Join-Path $env:USERPROFILE "Documents\Connect-Backups" }
New-Item -ItemType Directory -Force $BackupTarget | Out-Null
$enc = Join-Path $BackupTarget "supabase-pre-sync-$stamp.sql.aes"
$pw = Get-BackupPassword -CreateIfMissing
Protect-BackupFile $plain $enc $pw
$chk = Join-Path $work "verify.sql"; Unprotect-BackupFile $enc $pw $chk
if ((Get-FileHash $plain -Algorithm SHA256).Hash -ne (Get-FileHash $chk -Algorithm SHA256).Hash) { throw "Sicherung $enc laesst sich nicht 1:1 entschluesseln" }
Remove-Item $plain, $chk -Force
Write-Log ("Supabase-Sicherung: {0} ({1:N0} B), entschluesselt geprueft, {2} Tabellen mit Daten" -f $enc, (Get-Item $enc).Length, $dumpRows.Count) "OK"

# 2) Export beider Seiten (JSON)
$tables = "users","user_roles","agents","agent_profiles","channels","channel_agents","channel_memberships","intelligence_channel_mappings","work_items","connect_workspace_kv","components","connect_media","audit_events","connect_agent_mcp","connect_mcp_servers","deployment_packages","credentials","mcp_user_credentials","composio_connections","accounts","sessions","verifications"
$meta = "select json_agg(json_build_object('t',c.table_name,'col',c.column_name,'type',c.data_type,'pos',c.ordinal_position,'pk',(select bool_or(true) from information_schema.key_column_usage k join information_schema.table_constraints tc on tc.constraint_name=k.constraint_name and tc.table_schema=k.table_schema where tc.constraint_type='PRIMARY KEY' and k.table_schema='public' and k.table_name=c.table_name and k.column_name=c.column_name)) order by c.table_name,c.ordinal_position) from information_schema.columns c where c.table_schema='public'"
$secretTables = "accounts","sessions","verifications","credentials","mcp_user_credentials","composio_connections"
foreach ($side in @(@{ n = "app"; db = $app }, @{ n = "sb"; db = $sb })) {
  [IO.File]::WriteAllText((Join-Path $exp "$($side.n)-meta.json"), ((Psql $side.db @("-At", "-c", $meta)) -join "`n"), $script:Utf8NoBom)
  $have = (Psql $side.db @("-At", "-c", "select string_agg(tablename, ',') from pg_tables where schemaname='public'")) -split ','
  foreach ($t in $tables) {
    if ($have -notcontains $t) { continue }
    # Geheimnis-Tabellen: nur Schluessel/Anzahl, nie Tokens im Klartext exportieren
    $sel = if ($secretTables -contains $t) { "select coalesce(json_agg(json_build_object('n',1)),'[]') from public.$t" } else { "select coalesce(json_agg(to_jsonb(x)),'[]') from public.$t x" }
    [IO.File]::WriteAllText((Join-Path $exp "$($side.n)-$t.json"), ((Psql $side.db @("-At", "-c", $sel)) -join "`n"), $script:Utf8NoBom)
  }
}

# 3) Plan + SQL
$planOut = Join-Path $work "plan"
$r = Invoke-Native $bun @((Join-Path $PSScriptRoot "sync-plan.js"), $exp, $planOut, $(if ($Commit) { "1" } else { "0" }))
$r.Output | ForEach-Object { Write-Host "  $_" }
if ($r.ExitCode -ne 0) { throw "Planung fehlgeschlagen" }
$opsLine = $r.Output | Where-Object { $_ -match '^PLAN ops=(\d+)' } | Select-Object -First 1
$opsN = [int]([regex]::Match($opsLine, 'ops=(\d+)').Groups[1].Value)

# 4) Ausfuehren (eine Transaktion)
if ($opsN -eq 0) { Write-Log "Nichts zu tun: Supabase enthaelt schon alles (Lauf ist idempotent)." "OK" }
else {
  $out = Psql $sb @("-q", "-f", (Join-Path $planOut "sync.sql"))
  $out | Where-Object { $_ -match 'CHECK|SYNC OK|ERROR|FEHLER' } | ForEach-Object { Write-Host "  $_" }
  if (-not ($out -match 'SYNC OK')) { throw "Sync NICHT ausgefuehrt (Rollback)." }
  if ($Commit) { Write-Log "Sync GESCHRIEBEN: $opsN Operationen. Rueckweg: $enc" "OK" } else { Write-Log "PROBELAUF ok ($opsN Operationen geprueft, zurueckgerollt). Echt: -Commit" "OK" }
}

# 5) Nachkontrolle: Zeilenzahlen + erneute Planung muss 0 ergeben
$after = Get-TableCounts $pgBin $sb; $appC = Get-TableCounts $pgBin $app
$rows = foreach ($k in (@($appC.Keys) + @($after.Keys) | Sort-Object -Unique)) { [pscustomobject]@{ Tabelle = $k; App = $appC[$k]; SupabaseVorher = $countsBefore[$k]; SupabaseNachher = $after[$k] } }
$rows | Where-Object { $_.App -or $_.SupabaseNachher } | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
$rows | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $work "counts.json")
Write-Host "Bericht: $planOut (report.json, conflicts.json)" -ForegroundColor Yellow
