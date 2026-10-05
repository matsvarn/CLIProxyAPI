#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

source scripts/toolchain.sh

go mod download
go mod verify
(cd web && bun install --frozen-lockfile && bun run build)
cp web/dist/index.html internal/managementasset/panel/management.html
go build -mod=readonly -p 2 -o cli-proxy-api ./cmd/server

echo "Built ./cli-proxy-api with the custom management UI. No service was started."
