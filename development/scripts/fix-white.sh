#!/bin/bash
set -euo pipefail
export PATH="${HOME}/.bun/bin:$PATH"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
mkdir -p .logs

# kill previous
pkill -f 'vite.js --port 3010' >/dev/null 2>&1 || true
pkill -f 'production-entry.ts' >/dev/null 2>&1 || true
pkill -f 'src/index.ts' >/dev/null 2>&1 || true
sleep 2

# App: dual-stack (::) as vite.config intends — do NOT force 127.0.0.1
nohup bash -c 'cd app && exec bun run dev -- --port 3010 --strictPort' > .logs/app.log 2>&1 &
echo app=$!

# Server: Bun should listen; force hostname if supported via env
# Many stacks use HOSTNAME=0.0.0.0 — try both HOST and hostname
export HOST=0.0.0.0
nohup bash -c 'cd server && exec bun --env-file=../.env src/production-entry.ts' > .logs/server.log 2>&1 &
echo server=$!

for i in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:3010/ >/dev/null 2>&1 || curl -fsS --max-time 2 http://[::1]:3010/ >/dev/null 2>&1; then
    echo APP_UP
    break
  fi
  sleep 2
done

echo '--- listen check from wsl ---'
ss -ltnp | grep -E ':3010|:3001' || netstat -ltnp 2>/dev/null | grep -E ':3010|:3001' || true
curl -fsS --max-time 3 -o /dev/null -w "app4=%{http_code}\n" http://127.0.0.1:3010/ || echo app4=fail
curl -fsS --max-time 3 -o /dev/null -w "api4=%{http_code}\n" http://127.0.0.1:3001/api/copilotkit/info || echo api4=fail
curl -fsS --max-time 3 -o /dev/null -w "api6=%{http_code}\n" http://[::1]:3001/api/copilotkit/info || echo api6=fail
tail -n 15 .logs/server.log
tail -n 15 .logs/app.log