#!/bin/bash
export PATH="${HOME}/.bun/bin:$PATH"
cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
nohup bash -c 'cd server && exec bun --env-file=../.env src/production-entry.ts' >> .logs/server.log 2>&1 &
echo started_$!
sleep 5
curl -fsS --max-time 3 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/ || echo fail
tail -5 .logs/server.log