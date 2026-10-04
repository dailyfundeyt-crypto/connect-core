<#
  Import-LocalToSupabase.ps1 - Connect-Daten der Kopie (lokale Docker-DB 127.0.0.1:5433) nach Supabase
  (Projekt connect-core, Zugang aus .env.supabase) uebernehmen.

  STANDARD = PROBELAUF: alles wird in EINER Transaktion eingespielt, die Zeilenzahlen werden geprueft, dann
  ROLLBACK - in Supabase bleibt nichts zurueck. Erst mit -Commit wird wirklich geschrieben, und auch dann nur,
  wenn jede Tabelle exakt  (Zeilen im Ziel vorher) + (Zeilen im Dump)  hat; sonst ROLLBACK.

  Sicherheitsregeln:
    * Vorher je ein Backup: lokale DB (komplett) und Supabase (public + drizzle) nach <Kopie>\backups\
    * Abbruch, wenn in Supabase schon Benutzer existieren (dann wurde das gehostete Connect schon benutzt;
      Import muss VOR der ersten Anmeldung auf https://connect-kunc-preview.vercel.app laufen).
    * Die beim Serverstart automatisch angelegten Zeilen (deployment_packages, verifications ...) werden im Ziel
      innerhalb der Transaktion geleert; audit_events ist append-only und bleibt, die lokalen kommen dazu.
    * Die lokale DB wird nur gelesen. Die Original-Installation (OpenBot-v2) wird nicht angefasst.

  Aufruf:  Import-LocalToSupabase.ps1            (Probelauf)
           Import-LocalToSupabase.ps1 -Commit    (echter Import, erst nach OK)
#>
param([switch]$Commit)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ConnectBackup.Common.ps1")
$Root   = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$bkDir  = Join-Path $Root "backups"
New-Item -ItemType Directory -Path $bkDir -Force | Out-Null

$mainEnv = Read-DotEnv (Join-Path $Root ".env")
$local = ConvertFrom-PgUrl $mainEnv["DATABASE_URL"]
if ($local.IsRemote) { throw ".env DATABASE_URL zeigt nicht auf die lokale DB ($($local.Host)). Import nur von lokal." }
$sbEnv = Read-DotEnv (Join-Path $Root ".env.supabase")
if (-not $sbEnv["DATABASE_URL"]) { throw ".env.supabase mit DATABASE_URL fehlt." }
$sb = ConvertFrom-PgUrl $sbEnv["DATABASE_URL"]
if (-not $sb.IsSupabase) { throw "Ziel ist kein Supabase-Host: $($sb.Host)" }

$pgBin  = Find-PgBin $Root
$pgDump = Join-Path $pgBin "pg_dump.exe"
$psql   = Join-Path $pgBin "psql.exe"

function Dump($Db, [string]$File, [string[]]$Extra) {
  $env:PGPASSWORD = $Db.Password
  try { $r = Invoke-Native $pgDump (@("-d", (Get-PgConnInfo $Db), "--no-owner", "--no-privileges", "--encoding=UTF8", "-f", $File) + $Extra) }
  finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  if ($r.ExitCode -ne 0 -or -not (Test-Path $File) -or (Get-Item $File).Length -lt 500) { throw "pg_dump fehlgeschlagen ($File): $(($r.Output | Select-Object -First 6) -join ' | ')" }
  $r.Output | Where-Object { $_ -match 'warning|circular' } | ForEach-Object { Write-Log "pg_dump: $_" "WARN" }
}

Write-Log ("Import lokal -> Supabase ({0}) startet, Modus: {1}" -f $sb.Host, $(if ($Commit) { "COMMIT" } else { "PROBELAUF (Rollback)" }))

# 1) safety backups (both sides)
$bkLocal = Join-Path $bkDir "$stamp-pre-import-local.sql"
$bkSb    = Join-Path $bkDir "$stamp-pre-import-supabase.sql"
Dump $local $bkLocal @()
Dump $sb $bkSb @("-n", "public", "-n", "drizzle")
Write-Log ("Backups: {0} ({1:N0} B), {2} ({3:N0} B)" -f $bkLocal, (Get-Item $bkLocal).Length, $bkSb, (Get-Item $bkSb).Length) "OK"

# 2) data-only dump of Connect's public schema (drizzle's migration journal already exists in Supabase)
#    Tables the local server created at runtime (CREATE TABLE IF NOT EXISTS, e.g. connect_agent_settings) that do
#    not exist in Supabase yet: skipped if EMPTY (the hosted server creates them itself), otherwise abort.
$preLocal = Get-TableCounts $pgBin $local
$preSb    = Get-TableCounts $pgBin $sb
$skipArgs = @(); $skipped = @()
foreach ($t in @($preLocal.Keys | Where-Object { $_ -like "public.*" -and -not $preSb.Contains($_) })) {
  if ([int64]$preLocal[$t] -ne 0) { throw "Tabelle $t hat lokal $($preLocal[$t]) Zeilen, fehlt aber in Supabase. Erst anlegen." }
  $skipArgs += "--exclude-table=$t"; $skipped += $t
}
if ($skipped.Count) { Write-Log "Leere, nur lokal vorhandene Tabellen uebersprungen: $($skipped -join ', ')" "WARN" }
$data = Join-Path $bkDir "$stamp-import-data.sql"
Dump $local $data (@("--data-only", "--schema=public") + $skipArgs)

# rows per table in the dump (COPY text format: one line per row, embedded newlines are escaped)
$dumpRows = [ordered]@{}; $cur = $null; $n = 0
foreach ($line in [IO.File]::ReadLines($data)) {
  if ($null -eq $cur) {
    if ($line -match '^COPY public\.("?)([A-Za-z0-9_]+)\1 .* FROM stdin;$') { $cur = $Matches[2]; $n = 0 }
  } elseif ($line -eq '\.') { $dumpRows[$cur] = $n; $cur = $null } else { $n++ }
}
$liveLocal = Get-TableCounts $pgBin $local
foreach ($k in $dumpRows.Keys) {
  if ($liveLocal["public.$k"] -ne $dumpRows[$k]) { Write-Log "Hinweis: public.$k lokal jetzt $($liveLocal["public.$k"]) Zeilen, im Dump $($dumpRows[$k]) (lokaler Server schreibt gerade?) - massgeblich ist der Dump." "WARN" }
}
$sumDump = 0; foreach ($v in $dumpRows.Values) { $sumDump += $v }
Write-Log "Dump: $($dumpRows.Count) Tabellen mit Daten, $sumDump Zeilen."

# drizzle journals must match (same 43 migrations)
$sbCountsBefore = Get-TableCounts $pgBin $sb
if ($sbCountsBefore["drizzle.__drizzle_migrations"] -ne $liveLocal["drizzle.__drizzle_migrations"]) {
  throw "Migrationsstand verschieden: lokal $($liveLocal['drizzle.__drizzle_migrations']), Supabase $($sbCountsBefore['drizzle.__drizzle_migrations']). Erst angleichen."
}
$missing = @($dumpRows.Keys | Where-Object { -not $sbCountsBefore.Contains("public.$_") })
if ($missing.Count) { throw "Tabellen fehlen in Supabase: $($missing -join ', ')" }

# 3) one transaction: guard, clear boot rows, load, compare, COMMIT/ROLLBACK
$expectedValues = ($dumpRows.Keys | ForEach-Object { "('{0}', {1})" -f $_, $dumpRows[$_] }) -join ",`n  "
if (-not $expectedValues) { $expectedValues = "('__none__', 0)" }
$endTx = $(if ($Commit) { "COMMIT;" } else { "ROLLBACK;" })
$wrapper = Join-Path $bkDir "$stamp-import-run.sql"
$sql = @"
\set ON_ERROR_STOP on
BEGIN;
DO `$`$ BEGIN
  IF EXISTS (SELECT 1 FROM public.users) THEN
    RAISE EXCEPTION 'Supabase hat schon Benutzer - Abbruch (Import nur vor der ersten gehosteten Anmeldung).';
  END IF;
END `$`$;
DO `$`$ DECLARE l text; BEGIN
  SELECT string_agg(format('public.%I', tablename), ', ') INTO l FROM pg_tables
   WHERE schemaname = 'public' AND tablename <> 'audit_events';
  EXECUTE 'TRUNCATE ' || l;
END `$`$;
CREATE TEMP TABLE _base (t text PRIMARY KEY, n bigint) ON COMMIT DROP;
DO `$`$ DECLARE r record; c bigint; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO c;
    INSERT INTO _base VALUES (r.tablename, c);
  END LOOP;
END `$`$;
CREATE TEMP TABLE _dump (t text PRIMARY KEY, n bigint) ON COMMIT DROP;
INSERT INTO _dump VALUES
  $expectedValues;
\i '$($data.Replace('\', '/'))'
SET search_path = public, extensions;
SET client_min_messages = notice;
DO `$`$ DECLARE r record; c bigint; bad text := ''; BEGIN
  FOR r IN SELECT b.t, b.n + coalesce(d.n, 0) AS want FROM pg_temp._base b LEFT JOIN pg_temp._dump d USING (t) ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.t) INTO c;
    IF c <> r.want THEN bad := bad || format('%s: erwartet %s, ist %s; ', r.t, r.want, c); END IF;
    RAISE NOTICE 'CHECK % = % (erwartet %)', r.t, c, r.want;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'Zeilenzahlen stimmen nicht: %', bad; END IF;
  RAISE NOTICE 'ZEILENZAHLEN OK';
END `$`$;
$endTx
"@
[IO.File]::WriteAllText($wrapper, $sql, $script:Utf8NoBom)

$env:PGPASSWORD = $sb.Password
try { $r = Invoke-Native $psql @("-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", (Get-PgConnInfo $sb), "-f", $wrapper) }
finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
$r.Output | Where-Object { $_ -match 'CHECK|ZEILENZAHLEN|ERROR|FEHLER|Abbruch' } | ForEach-Object { Write-Host "  $_" }
Remove-Item $wrapper -Force -ErrorAction SilentlyContinue
if ($r.ExitCode -ne 0 -or -not ($r.Output -match 'ZEILENZAHLEN OK')) {
  Write-Log "Import NICHT durchgefuehrt (Rollback). Exit $($r.ExitCode): $(($r.Output | Select-Object -Last 4) -join ' | ')" "ERROR"
  exit 1
}

# 4) after commit: independent recount in Supabase
if ($Commit) {
  $after = Get-TableCounts $pgBin $sb
  $bad = @()
  foreach ($k in $dumpRows.Keys) {
    $want = $dumpRows[$k]; if ($k -eq "audit_events") { $want += $sbCountsBefore["public.audit_events"] }
    if ($after["public.$k"] -ne $want) { $bad += "$k (Supabase $($after["public.$k"]), erwartet $want)" }
  }
  if ($bad.Count) { Write-Log "Nachkontrolle abweichend: $($bad -join '; ')" "ERROR"; exit 1 }
  Write-Log "Import ABGESCHLOSSEN: alle $($dumpRows.Count) Tabellen stimmen. Rueckweg: $bkSb" "OK"
} else {
  Write-Log "PROBELAUF ok: Zeilenzahlen stimmen, alles zurueckgerollt. Echter Import: -Commit" "OK"
}
Write-Host "Klartext-Daten liegen in $bkDir ($stamp-*); Ordner ist gitignored." -ForegroundColor Yellow
