#!/bin/bash
set -euo pipefail
export PATH="${HOME}/.bun/bin:$PATH"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
mkdir -p .logs

pkill -f 'vite.js --port 3010' >/dev/null 2>&1 || true
pkill -f 'production-entry.ts' >/dev/null 2>&1 || true
sleep 2

# Detach fully from this TTY
nohup setsid bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/app" && exec bun run dev -- --port 3010 --strictPort' > .logs/app.log 2>&1 < /dev/null &
echo app_pid=$!
nohup setsid bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/server" && exec env HOST=0.0.0.0 bun --env-file=../.env src/production-entry.ts' > .logs/server.log 2>&1 < /dev/null &
echo server_pid=$!

# Wait until both answer inside WSL
for i in $(seq 1 90); do
  a=0; s=0
  curl -fsS --max-time 1 http://127.0.0.1:3010/ >/dev/null 2>&1 && a=1 || true
  curl -fsS --max-time 1 http://127.0.0.1:3001/api/copilotkit/info >/dev/null 2>&1 && s=1 || true
  echo "wait $i app=$a api=$s"
  if [ "$a" = 1 ] && [ "$s" = 1 ]; then
    echo BOTH_READY
    ss -ltnp | grep -E ':3010|:3001' || true
    # stay alive forever so Cursor shell keeps WSL session warm
    while true; do
      curl -fsS --max-time 2 http://127.0.0.1:3010/ >/dev/null 2>&1 || echo APP_DOWN
      curl -fsS --max-time 2 http://127.0.0.1:3001/api/copilotkit/info >/dev/null 2>&1 || echo API_DOWN
      sleep 20
    done
  fi
  sleep 2
done
echo TIMEOUT
tail -n 40 .logs/app.log
tail -n 40 .logs/server.log
exit 1