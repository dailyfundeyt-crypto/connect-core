@echo off
rem Connect-Adresse wechseln: Set-ConnectUrl.cmd https://projekt.vercel.app   (ohne Argument: anzeigen)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Set-ConnectUrl.ps1" %*
