# Migration: Alle connect -> connect Ersetzungen, da User OAuth bereits umbenannt hat
# Idempotent: kann mehrfach ausgefuehrt werden.
# Ersetzt NUR in Source-Files, nicht in build artefacts oder archive.

$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path

$includeExt = @('*.ts','*.tsx','*.js','*.jsx','*.mjs','*.json','*.toml','*.yaml','*.yml','*.cmd','*.sh','*.ps1','*.md','*.cs','*.csproj','*.xaml','*.html','*.css','*.txt')
$excludePathRegex = '\\node_modules\\|\\.next\\|\\archive\\|apps\\landing\\.next\\|\\Connect-v2-PRE-MIGRATION\\'

$replaces = @(
    # 1. PAKET-ALIASE (spezifisch)
    @{pattern='"@connect/'; replacement='"@connect/'; description='Package scope quote'},
    @{pattern='@connect/';   replacement='@connect/';   description='Package scope bare'},

    # 2. URL-IDENTIFIER (in tests)
    @{pattern='http://connect.test'; replacement='http://connect.test'; description='Test domain'},
    @{pattern='http://connect.local'; replacement='http://connect.local'; description='Test domain local'},
    @{pattern='https://connect.test'; replacement='https://connect.test'; description='Test domain https'},

    # 3. OAUTH-CLIENT-ID + externer identifier
    @{pattern='"connect-desktop"'; replacement='"connect-desktop"'; description='OAuth client ID'},
    @{pattern="'connect-desktop'"; replacement="'connect-desktop'"; description='OAuth client ID single quote'},

    # 4. ENV-PREFIX
    @{pattern='CONNECT_'; replacement='CONNECT_'; description='ENV var prefix'},

    # 5. BRAND - zuletzt, am weitesten
    @{pattern='Connect'; replacement='Connect'; description='Brand PascalCase'},
    @{pattern='connect'; replacement='connect'; description='Brand lowerCase'}
)

function Get-IncludeFiles {
    Get-ChildItem . -Recurse -File -Include $includeExt -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch $excludePathRegex }
}

$files = @(Get-IncludeFiles)
Write-Host "Files to process: $($files.Count)"
Write-Host ""

$grandFiles = 0
$grandOcc = 0
foreach ($r in $replaces) {
    Write-Host "[$($r.description)] '$($r.pattern)' -> '$($r.replacement)'"
    $fileCount = 0
    $occCount = 0
    foreach ($f in $files) {
        $content = Get-Content -Raw -LiteralPath $f.FullName -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        $before = ([regex]::Matches($content, [regex]::Escape($r.pattern))).Count
        if ($before -gt 0) {
            $newContent = $content.Replace($r.pattern, $r.replacement)
            Set-Content -LiteralPath $f.FullName -Value $newContent -NoNewline
            $fileCount += 1
            $occCount += $before
        }
    }
    Write-Host "  $fileCount files, $occCount occurrences"
    $grandFiles += $fileCount
    $grandOcc += $occCount
}

Write-Host ""
Write-Host "=========================================="
Write-Host " DONE: $grandFiles files changed, $grandOcc total occurrences"
Write-Host "=========================================="
