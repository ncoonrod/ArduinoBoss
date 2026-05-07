#!/usr/bin/env bash
# Pull, rebuild, and (re)start the ArduinoBoss container on the EC2.
#
# Why the URL flags: HotStaq does server-side fetches against the URL it
# thinks it's reachable at. Without --web-base-url / --api-base-url it
# defaults to http://127.0.0.1:8080, which is wrong when Caddy is doing
# TLS termination on a public hostname — the rendered page then tries to
# fetch from 127.0.0.1 and fails. Setting both flags to the public HTTPS
# URL fixes it.

set -euo pipefail

PUBLIC_URL="${PUBLIC_URL:-https://boss.highersoftware.com}"
NETWORK="${NETWORK:-hes_default}"
NAME="${NAME:-boss}"
HOST_PORT="${HOST_PORT:-8080}"
IMAGE="${IMAGE:-arduinoboss}"

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

echo "==> docker build -t ${IMAGE} ."
docker build -t "${IMAGE}" .

echo "==> replacing container '${NAME}'"
docker rm -f "${NAME}" 2>/dev/null || true

docker run -d \
	--name="${NAME}" \
	--restart=unless-stopped \
	--network="${NETWORK}" \
	-p "${HOST_PORT}:8080" \
	"${IMAGE}" \
	node ./build/cli.js \
		--hotsite ./HotSite.json run \
		--server-type web-api \
		--api-http-port 8080 \
		--web-http-port 8080 \
		--api-base-url "${PUBLIC_URL}" \
		--web-base-url "${PUBLIC_URL}" \
		--ws

sleep 1
docker ps --filter "name=^${NAME}$" --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"
echo "==> public URL: ${PUBLIC_URL}"
