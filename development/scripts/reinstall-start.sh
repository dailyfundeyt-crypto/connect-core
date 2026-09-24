#!/bin/bash
set -euo pipefail
export PATH="${HOME}/.bun/bin:$PATH"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
mkdir -p .logs

pkill -f 'vite.js --port 3010' >/dev/null 2>&1 || true
pkill -f 'production-entry.ts' >/dev/null 2>&1 || true
sleep 1

echo "[1] reinstall deps in WSL (clean root node_modules only if needed)"
# Prefer reinstall without full wipe first
bun install 2>&1 | tail -20

echo "[2] try server once for error"
(cd server && bun --env-file=../.env src/production-entry.ts > ../.logs/server-once.log 2>&1 &) 
SPID=$!
sleep 8
if curl -fsS --max-time 2 http://127.0.0.1:3001/api/copilotkit/info >/dev/null 2>&1; then
  echo SERVER_OK
else
  echo SERVER_FAIL
  tail -40 ../.logs/server-once.log || tail -40 .logs/server-once.log
  kill $SPID 2>/dev/null || true
fi

# Start durable v4 pair
nohup setsid bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/app" && exec bun run dev -- --host 127.0.0.1 --port 3010 --strictPort' > .logs/app.log 2>&1 < /dev/null &
nohup setsid bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/server" && exec bun --env-file=../.env src/production-entry.ts' > .logs/server.log 2>&1 < /dev/null &

for i in $(seq 1 60); do
  a=0;s=0
  curl -fsS --max-time 1 http://127.0.0.1:3010/ >/dev/null 2>&1 && a=1 || true
  curl -fsS --max-time 1 http://127.0.0.1:3001/api/copilotkit/info >/dev/null 2>&1 && s=1 || true
  echo "wait $i a=$a s=$s"
  [ "$a$s" = "11" ] && echo BOTH_OK && while true; do sleep 30; done
  sleep 2
done
echo GIVE_UP
tail -50 .logs/server.log
tail -20 .logs/app.log
exit 1