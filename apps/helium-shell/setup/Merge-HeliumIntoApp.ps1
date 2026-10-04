<#
  Merge-HeliumIntoApp.ps1 - Daten der Helium-Kopie (Docker 5433) in die Connect-App-DB (5544) uebernehmen
  und alles auf Stefans Google-Benutzer (dailyfunde.yt, Xx3D...) legen. Eine Transaktion; ohne -Commit ROLLBACK.
  Nichts wird geloescht: Konflikte -> INSERT ... ON CONFLICT DO NOTHING, kv-Konflikte zusaetzlich als *.from-*-Archiv.
#>
param([switch]$Commit)
$ErrorActionPreference = "Stop"
$Root = 'C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium'
. "$Root\apps\helium-shell\setup\ConnectBackup.Common.ps1"
$pgBin = Find-PgBin $Root; $psql = Join-Path $pgBin "psql.exe"; $pgDump = Join-Path $pgBin "pg_dump.exe"
$work = Join-Path $env:TEMP "cc-merge"; $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$copy = ConvertFrom-PgUrl (Read-DotEnv "$Root\.env")["DATABASE_URL"]
$appE = Read-DotEnv "$env:LOCALAPPDATA\ConnectApp\data\connect.env"
$app  = ConvertFrom-PgUrl "postgres://connect:$($appE['CONNECT_APP_DB_PASSWORD'])@127.0.0.1:5544/connect"
$X = 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu'

$bk = Join-Path "$env:LOCALAPPDATA\ConnectApp\data\backups" "pre-merge-helium-$stamp.dump"
$env:PGPASSWORD = $app.Password
& $pgDump -d (Get-PgConnInfo $app) -Fc -f $bk; if ($LASTEXITCODE -ne 0) { throw "pg_dump App fehlgeschlagen" }
Write-Host "App-Sicherung: $bk ($((Get-Item $bk).Length) B)"

$rows = Join-Path $work "copy-rows-$stamp.sql"
$env:PGPASSWORD = $copy.Password
$tables = "users","accounts","user_roles","agents","agent_profiles","channels","channel_agents","channel_memberships","intelligence_channel_mappings","work_items"
$targs = @(); foreach ($t in $tables) { $targs += "-t"; $targs += "public.$t" }
& $pgDump (@("-d", (Get-PgConnInfo $copy), "--data-only", "--inserts", "--on-conflict-do-nothing", "--no-owner", "--no-privileges", "-f", $rows) + $targs)
if ($LASTEXITCODE -ne 0) { throw "pg_dump Kopie fehlgeschlagen" }

$kv = Join-Path $work "kv-merge.sql"
$end = $(if ($Commit) { "COMMIT;" } else { "ROLLBACK;" })
$wrapper = Join-Path $work "merge-run-$stamp.sql"
$sqlText = @"
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _before AS SELECT 'agents' t, count(*) n FROM public.agents UNION ALL SELECT 'channels', count(*) FROM public.channels UNION ALL SELECT 'kv', count(*) FROM public.connect_workspace_kv UNION ALL SELECT 'users', count(*) FROM public.users;
\i '$($rows.Replace('\','/'))'
SET search_path = public;
SET client_min_messages = notice;
INSERT INTO public.user_roles(user_id, role) VALUES ('$X', 'admin') ON CONFLICT DO NOTHING;
UPDATE public.agent_profiles SET owner_user_id = '$X' WHERE owner_user_id = 'dev-local-user';
UPDATE public.channel_memberships SET user_id = '$X' WHERE user_id = 'dev-local-user';
UPDATE public.intelligence_channel_mappings SET user_id = '$X' WHERE user_id = 'dev-local-user';
UPDATE public.agent_preferences SET user_id = '$X' WHERE user_id = 'dev-local-user';
UPDATE public.skills SET owner_user_id = '$X' WHERE owner_user_id = 'dev-local-user';
UPDATE public.routines SET owner_user_id = '$X' WHERE owner_user_id = 'dev-local-user';
UPDATE public.user_instructions SET user_id = '$X' WHERE user_id = 'dev-local-user';
UPDATE public.attachments SET uploaded_by = '$X' WHERE uploaded_by = 'dev-local-user';
UPDATE public.mcp_user_credentials SET user_id = '$X' WHERE user_id = 'dev-local-user';
\i '$($kv.Replace('\','/'))'
DO `$`$ DECLARE r record; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = '$X' AND email = 'dailyfunde.yt@gmail.com') THEN RAISE EXCEPTION 'Google-Benutzer fehlt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = '$X' AND provider_id = 'google') THEN RAISE EXCEPTION 'Google-Konto fehlt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = 'agent_b3a45862-1825-469f-ac71-4f114c34432a') THEN RAISE EXCEPTION 'Agent Man fehlt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.channels WHERE id = 'channel_80d3640c-2788-4324-82f1-7e0ae85b3847') THEN RAISE EXCEPTION 'Kanal Man fehlt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.connect_workspace_kv WHERE key = 'u:${X}:connect.companies.custom') THEN RAISE EXCEPTION 'Unternehmen fehlen'; END IF;
  IF EXISTS (SELECT 1 FROM public.channel_memberships WHERE user_id = 'dev-local-user') THEN RAISE EXCEPTION 'Remap unvollstaendig'; END IF;
  FOR r IN SELECT b.t, b.n, CASE b.t WHEN 'agents' THEN (SELECT count(*) FROM public.agents) WHEN 'channels' THEN (SELECT count(*) FROM public.channels) WHEN 'kv' THEN (SELECT count(*) FROM public.connect_workspace_kv) ELSE (SELECT count(*) FROM public.users) END AS a FROM _before b LOOP
    RAISE NOTICE 'COUNT % vorher % nachher %', r.t, r.n, r.a;
    IF r.a < r.n THEN RAISE EXCEPTION 'Zeilen verloren in %', r.t; END IF;
  END LOOP;
  RAISE NOTICE 'MERGE OK';
END `$`$;
$end
"@
[IO.File]::WriteAllText($wrapper, $sqlText, (New-Object System.Text.UTF8Encoding($false)))
$env:PGPASSWORD = $app.Password
$ErrorActionPreference = "Continue"
& $psql -X -q -v ON_ERROR_STOP=1 -d (Get-PgConnInfo $app) -f $wrapper 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -match 'NOTICE|ERROR|FEHLER' }
"exit=$LASTEXITCODE mode=$(if ($Commit) {'COMMIT'} else {'ROLLBACK'})"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
