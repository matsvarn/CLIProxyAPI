#!/usr/bin/env bash
# Sourced by the worktree setup and check commands.
if [[ -z "${BUN_BIN:-}" ]]; then
  BUN_BIN=bun
  if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version)" != "1.3.14" ]]; then
    BUN_BIN="$HOME/.local/share/codingbox/toolchains/bun/1.3.14/bin/bun"
  fi
fi
if ! command -v "$BUN_BIN" >/dev/null 2>&1 || [[ "$("$BUN_BIN" --version)" != "1.3.14" ]]; then
  echo "Select Bun 1.3.14 with BUN_BIN=/path/to/bun." >&2
  echo 'Install it with: curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"' >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v go >/dev/null 2>&1; then
  echo "Install Go 1.26+ first: https://go.dev/doc/install" >&2
  exit 1
fi

# Bun package scripts invoke bun again, so use the selected runtime throughout.
export PATH="$(dirname "$(command -v "$BUN_BIN")"):$PATH"
