@echo off
rem Connect (Helium) - eine Datenbank: startet bei Bedarf die Connect App (Backend 3101) und Helium. Rueckfall alte Dev-Umgebung: Start-Connect.cmd -Fallback
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Connect.ps1" %*
