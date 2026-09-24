#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export PATH="/usr/local/bin:${HOME}/.bun/bin:${PATH}"

cat > /usr/local/bin/docker << 'EOF'
#!/bin/bash
exec "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe" "$@"
EOF
chmod +x /usr/local/bin/docker
hash -r

echo "[1] docker info"
docker info >/dev/null
echo DOCKER_OK

echo "[2] apt deps"
apt-get update -y
apt-get install -y curl ca-certificates unzip

if ! command -v bun >/dev/null 2>&1; then
  echo "[3] install bun"
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="${HOME}/.bun/bin:${PATH}"
echo "BUN $(bun --version)"

cd "/mnt/c/Users/Kunc GmbH/Desktop/Connect"
find . -maxdepth 2 -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//' || true
chmod +x START.sh scripts/*.sh || true

export CONNECT_FORCE_START=1
echo "[4] START.sh $(date -Iseconds)"
exec ./START.sh