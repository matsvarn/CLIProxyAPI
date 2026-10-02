# Embedded management control panel

`management.html` (gitignored, generated) is populated by `scripts/install-local.sh`
from `web/dist/index.html` before `go build`, embedding the management UI into the
binary via `//go:embed` (see `internal/managementasset/embed.go`). When present,
`serveManagementControlPanel` serves it from memory and the panel auto-updater is
skipped. Without it the binary behaves exactly like upstream (static dir/download).
