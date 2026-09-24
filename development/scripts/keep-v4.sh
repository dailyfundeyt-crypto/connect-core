#!/bin/bash
set -euo pipefail
export PATH="${HOME}/.bun/bin:$PATH"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
mkdir -p .logs
pkill -f 'vite.js --port 3010' >/dev/null 2>&1 || true
pkill -f 'production-entry.ts' >/dev/null 2>&1 || true
sleep 2

# Force IPv4 loopback so Windows Tauri WebView can reach them
nohup setsid bash -c 'cd app && exec bun run dev -- --host 127.0.0.1 --port 3010 --strictPort' > .logs/app.log 2>&1 < /dev/null &
echo app=$!
nohup setsid bash -c 'cd server && exec bun --env-file=../.env src/production-entry.ts' > .logs/server.log 2>&1 < /dev/null &
echo server=$!

for i in $(seq 1 90); do
  a=0; s=0
  curl -fsS --max-time 1 http://127.0.0.1:3010/ >/dev/null 2>&1 && a=1 || true
  curl -fsS --max-time 1 http://127.0.0.1:3001/api/copilotkit/info >/dev/null 2>&1 && s=1 || true
  echo "wait $i a=$a s=$s"
  if [ "$a$s" = "11" ]; then
    echo BOTH_READY_V4
    ss -ltnp | grep -E '127.0.0.1:3010|127.0.0.1:3001|:3010|:3001' || true
    while true; do sleep 30; done
  fi
  sleep 2
done
echo TIMEOUT
tail -30 .logs/app.log
tail -30 .logs/server.log
exit 1