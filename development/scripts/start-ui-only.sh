#!/bin/bash
set -euo pipefail
export PATH="/usr/local/bin:${HOME}/.bun/bin:${PATH}"
cat > /usr/local/bin/docker << 'EOF'
#!/bin/bash
exec "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe" "$@"
EOF
chmod +x /usr/local/bin/docker

cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
mkdir -p .logs

# Start app (UI) even if server keys missing
if curl -fsS --max-time 2 http://127.0.0.1:3010/ >/dev/null 2>&1; then
  echo "APP already up"
else
  echo "Starting app on 3010..."
  (cd app && bun run dev -- --port 3010 --strictPort --host 127.0.0.1 >../.logs/app.log 2>&1 &)
fi

# Try server with a dummy intelligence key so UI can talk to API
# Only set if empty
if ! grep -qE '^INTELLIGENCE_API_KEY=.+' .env; then
  # placeholder — enough to boot; CopilotKit calls will fail until real key
  sed -i 's/^INTELLIGENCE_API_KEY=.*/INTELLIGENCE_API_KEY=ck_local_dev_placeholder/' .env || true
  if ! grep -qE '^INTELLIGENCE_API_KEY=' .env; then
    echo 'INTELLIGENCE_API_KEY=ck_local_dev_placeholder' >> .env
  fi
fi
if ! grep -qE '^OPENAI_API_KEY=.+' .env; then
  sed -i 's/^OPENAI_API_KEY=.*/OPENAI_API_KEY=sk-local-dev-placeholder/' .env || true
  if ! grep -qE '^OPENAI_API_KEY=' .env; then
    echo 'OPENAI_API_KEY=sk-local-dev-placeholder' >> .env
  fi
fi

echo "Starting server on 3001..."
pkill -f 'production-entry.ts' >/dev/null 2>&1 || true
(cd server && bun --env-file=../.env src/production-entry.ts >../.logs/server.log 2>&1 &)

for i in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:3010/ >/dev/null 2>&1; then
    echo "APP_READY"
    break
  fi
  sleep 2
done
curl -fsS --max-time 2 http://127.0.0.1:3010/ -o /dev/null -w "app_http=%{http_code}\n" || echo "app_http=fail"
tail -n 30 .logs/app.log || true
tail -n 40 .logs/server.log || true
echo DONE