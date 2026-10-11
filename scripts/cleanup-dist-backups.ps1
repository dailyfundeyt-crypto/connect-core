<#
.SYNOPSIS
    Prueft und raeumt dist.bak-* Ordner unter apps/connect-app/runtime/connect/apps/app/.

.DESCRIPTION
    Connect.INK (Port 3101) hat keinen Quellcode — es serviert ausschliesslich
    dist/. Jeder Build von apps/app wird dorthin gespiegelt und ueberschreibt den
    vorherigen Stand. Deshalb wachsen hier Backup-Ordner an.

    WICHTIG: Ohne -WhatIf wird NICHTS geloescht. Das Skript zeigt nur, was es
    tun wuerde. Loeschen passiert ausschliesslich mit -Apply.

    Es loescht nie ungefragt den neuesten Ordner und nie ungefragt einen Ordner,
    der als "bekannt gut" markiert ist (Namensbestandteil 'good' oder 'known-good').

.PARAMETER Keep
    Wie viele der neuesten Ordner behalten werden. Standard 2.

.PARAMETER OlderThanDays
    Zusaetzlich nur loeschen, was aelter ist als so viele Tage. Standard 0 = kein Altersfilter.

.PARAMETER Apply
    Ohne dieses Flag: reine Anzeige (das ist der Normalfall).

.EXAMPLE
    .\scripts\cleanup-dist-backups.ps1
    Zeigt die Vorschau.

.EXAMPLE
    .\scripts\cleanup-dist-backups.ps1 -Apply -Keep 2
    Loescht alles ausser den zwei neuesten.

.EXAMPLE
    .\scripts\cleanup-dist-backups.ps1 -Apply -Keep 1 -OlderThanDays 7
    Loescht nur, was aelter als eine Woche ist, und laesst den neuesten stehen.
#>
[CmdletBinding()]
param(
    [int] $Keep = 2,
    [int] $OlderThanDays = 0,
    [switch] $Apply
)

$ErrorActionPreference = 'Stop'

# Pfad relativ zum Repo-Root, damit das Skript nicht von seinem eigenen Standort abhaengt.
$repoRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $repoRoot 'apps\connect-app\runtime\connect\apps\app'

if (-not (Test-Path $backupRoot)) {
    throw "Zielordner nicht gefunden: $backupRoot"
}

$all = Get-ChildItem -Path $backupRoot -Directory -Filter 'dist.bak-*' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

if (-not $all) {
    Write-Host 'Keine dist.bak-* Ordner gefunden.' -ForegroundColor DarkGray
    return
}

$totalMb = [math]::Round(
    ($all | ForEach-Object {
        (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object Length -Sum).Sum
    } | Measure-Object -Sum).Sum / 1MB, 1
)

Write-Host ''
Write-Host "Backup-Ordner in $backupRoot" -ForegroundColor Cyan
Write-Host "Anzahl: $($all.Count)   Gesamt: $totalMb MB" -ForegroundColor Cyan
Write-Host ''

$cutoff = if ($OlderThanDays -gt 0) { (Get-Date).AddDays(-$OlderThanDays) } else { $null }

$candidates = @()
$rowNumber = 0

foreach ($dir in $all) {
    $rowNumber++
    $sizeMb = [math]::Round(
        (Get-ChildItem $dir.FullName -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object Length -Sum).Sum / 1MB, 1
    )

    # Zwei unabhaengige Schutzregeln. Beide muessen ausreichen, damit etwas geloescht wird.
    #   1. "good" im Namen  -> von Hand als funktionierend markiert, nie antasten.
    #   2. unter den -Keep neuesten -> der Stand, aus dem man notfalls zurueck kann.
    $isMarkedGood = $dir.Name -match 'good'
    $isWithinKeep = $rowNumber -le $Keep
    $isProtected = $isMarkedGood -or $isWithinKeep
    $isTooYoung = $cutoff -and ($dir.LastWriteTime -gt $cutoff)

    if ($isMarkedGood) {
        $line = '  [ behalten ]  {0,-46} {1,6} MB   {2}' -f $dir.Name, $sizeMb, 'als gut markiert'
        Write-Host $line -ForegroundColor Green
    }
    elseif ($isWithinKeep) {
        $line = '  [ behalten ]  {0,-46} {1,6} MB   {2}' -f $dir.Name, $sizeMb, "behaelt (neueste $Keep)"
        Write-Host $line -ForegroundColor Green
    }
    elseif ($isTooYoung) {
        $line = '  [ behalten ]  {0,-46} {1,6} MB   {2}' -f $dir.Name, $sizeMb, "juenger als $OlderThanDays Tage"
        Write-Host $line -ForegroundColor DarkGray
    }
    else {
        $line = '  [ LOESCHEN ]  {0,-46} {1,6} MB   {2}' -f $dir.Name, $sizeMb, $dir.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
        Write-Host $line -ForegroundColor Yellow
        $candidates += $dir
    }
}

if (-not $candidates) {
    Write-Host ''
    Write-Host 'Nichts zu tun.' -ForegroundColor Green
    return
}

$freedMb = [math]::Round(
    ($candidates | ForEach-Object {
        (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object Length -Sum).Sum
    } | Measure-Object -Sum).Sum / 1MB, 1
)

Write-Host ''
Write-Host "$($candidates.Count) Ordner, $freedMb MB wuerden freikommen." -ForegroundColor Yellow

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Nichts geloescht — das war eine Vorschau.' -ForegroundColor Cyan
    Write-Host 'Wirklich loeschen mit:' -ForegroundColor Cyan
    $hint = "  .\$($MyInvocation.MyCommand.Name) -Apply -Keep $Keep"
    if ($OlderThanDays -gt 0) { $hint += " -OlderThanDays $OlderThanDays" }
    Write-Host $hint -ForegroundColor White
    if ($candidates.Count -gt 0) {
        Write-Host ''
        Write-Host 'Zu loeschen: ' -ForegroundColor Yellow
        foreach ($dir in $candidates) { Write-Host "  $($dir.Name)" -ForegroundColor DarkYellow }
    }
    return
}

Write-Host ''
foreach ($dir in $candidates) {
    Remove-Item $dir.FullName -Recurse -Force
    Write-Host "  entfernt: $($dir.Name)" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host "$freed MB freigeräumt." -ForegroundColor Green
