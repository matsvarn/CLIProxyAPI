#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/toolchain.sh

(cd web && bun run verify)
go test -mod=readonly -p 2 ./...
go build -mod=readonly -p 2 -o cli-proxy-api ./cmd/server
