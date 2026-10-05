#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for tool in go bun; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing $tool. Install Go 1.26+ and Bun 1.3.14 before running setup." >&2
    echo "Go installation: https://go.dev/doc/install" >&2
    echo 'Bun installation: curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"' >&2
    exit 1
  fi
done

if [[ "$(bun --version)" != "1.3.14" ]]; then
  echo "This frontend pins Bun 1.3.14. Select that version before running setup." >&2
  echo 'Install it with: curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"' >&2
  exit 1
fi

go mod download
go mod verify
(cd web && bun install --frozen-lockfile && bun run build)
cp web/dist/index.html internal/managementasset/panel/management.html
go build -mod=readonly -p 2 -o cli-proxy-api ./cmd/server

echo "Built ./cli-proxy-api with the custom management UI. No service was started."
