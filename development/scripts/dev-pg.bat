@echo off
cd /d "C:\Users\Kunc GmbH\Downloads\OpenBot-v2"
call bun development\scripts\dev-pg.mjs > "%USERPROFILE%\dev-pg.out.log" 2>&1
