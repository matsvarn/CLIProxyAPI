package managementasset

import "embed"

// panelFS embeds the locally built management control panel. The directory is
// committed with only this placeholder tree; scripts/install-local.sh drops
// management.html in before `go build`.
//
//go:embed all:panel
var panelFS embed.FS

// EmbeddedPanel returns the embedded management control panel bytes, or false
// when the binary was built without one.
func EmbeddedPanel() ([]byte, bool) {
	data, err := panelFS.ReadFile("panel/management.html")
	if err != nil || len(data) == 0 {
		return nil, false
	}
	return data, true
}
