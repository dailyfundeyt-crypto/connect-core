#!/bin/bash
set -euo pipefail
export PATH="/root/.bun/bin:/usr/local/bin:$PATH"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
pkill -f production-entry.ts >/dev/null 2>&1 || true
sleep 1
# ensure app still up
if ! curl -fsS --max-time 1 http://127.0.0.1:3010/ >/dev/null 2>&1; then
  nohup setsid bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/app" && exec bun run dev -- --host 127.0.0.1 --port 3010 --strictPort' > .logs/app.log 2>&1 < /dev/null &
fi
nohup setsid bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/server" && exec bun --env-file=../.env src/production-entry.ts' > .logs/server.log 2>&1 < /dev/null &
echo server_started
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3001/api/copilotkit/info >/dev/null 2>&1; then
    echo API_OK
    curl -fsS --max-time 2 http://127.0.0.1:3001/api/copilotkit/info | head -c 200
    echo
    exit 0
  fi
  sleep 1
done
echo API_FAIL
tail -40 .logs/server.log
exit 1