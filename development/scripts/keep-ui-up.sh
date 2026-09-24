#!/bin/bash
set -euo pipefail
export PATH="/usr/local/bin:${HOME}/.bun/bin:${PATH}"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
mkdir -p .logs

# Ensure placeholder keys so server can boot (UI works; AI needs real keys later)
grep -qE '^INTELLIGENCE_API_KEY=.+' .env || echo 'INTELLIGENCE_API_KEY=ck_local_dev_placeholder' >> .env
# if key line exists but empty, fill it
if grep -qE '^INTELLIGENCE_API_KEY=$' .env || grep -qE '^INTELLIGENCE_API_KEY=["'\'']?["'\'']?$' .env; then
  sed -i 's/^INTELLIGENCE_API_KEY=.*/INTELLIGENCE_API_KEY=ck_local_dev_placeholder/' .env
fi
if grep -qE '^OPENAI_API_KEY=$' .env || grep -qE '^OPENAI_API_KEY=["'\'']?["'\'']?$' .env || ! grep -qE '^OPENAI_API_KEY=.+' .env; then
  if grep -qE '^OPENAI_API_KEY=' .env; then
    sed -i 's/^OPENAI_API_KEY=.*/OPENAI_API_KEY=sk-local-dev-placeholder/' .env
  else
    echo 'OPENAI_API_KEY=sk-local-dev-placeholder' >> .env
  fi
fi

pkill -f 'vite.js --port 3010' >/dev/null 2>&1 || true
pkill -f 'production-entry.ts' >/dev/null 2>&1 || true
sleep 1

nohup bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/app" && exec bun run dev -- --port 3010 --strictPort --host 127.0.0.1' > .logs/app.log 2>&1 &
echo "app_pid=$!"
nohup bash -c 'cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect/server" && exec bun --env-file=../.env src/production-entry.ts' > .logs/server.log 2>&1 &
echo "server_pid=$!"

for i in $(seq 1 90); do
  if curl -fsS --max-time 2 http://127.0.0.1:3010/ >/dev/null 2>&1; then
    echo APP_READY
    curl -fsS --max-time 2 -o /dev/null -w "app=%{http_code}\n" http://127.0.0.1:3010/ || true
    curl -fsS --max-time 2 -o /dev/null -w "server=%{http_code}\n" http://127.0.0.1:3001/api/copilotkit/info || echo "server_info=fail"
    # keep this session alive so nothing reaps children oddly; processes are nohup anyway
    echo KEEP_ALIVE
    while curl -fsS --max-time 2 http://127.0.0.1:3010/ >/dev/null 2>&1; do sleep 30; done
    echo APP_DIED
    exit 1
  fi
  sleep 2
done
echo APP_TIMEOUT
tail -n 50 .logs/app.log || true
tail -n 50 .logs/server.log || true
exit 1