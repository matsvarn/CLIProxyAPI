package helps

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
)

func TestResolveClaudeVersionConfigFallback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "version")
	for _, configured := range []string{"", "claude-cli/2.1.300 (external, cli)"} {
		cfg := &config.Config{ClaudeHeaderDefaults: config.ClaudeHeaderDefaults{UserAgent: configured, VersionFile: path}}
		want := DefaultClaudeVersion(cfg)
		for _, content := range []string{"", "2.1", "2.1.321 garbage\n", "2.1.321\n3.0.0\n", "02.1.321\n", "2.1.321-beta\n", "999999999999999999999999.0.0\n"} {
			if err := os.WriteFile(path, []byte(content), 0600); err != nil {
				t.Fatal(err)
			}
			if got := DefaultClaudeVersion(ResolveClaudeVersionConfig(cfg)); got != want {
				t.Fatalf("content %q: version %q, want %q", content, got, want)
			}
		}
		if err := os.Remove(path); err != nil {
			t.Fatal(err)
		}
		for _, unreadable := range []string{path, filepath.Dir(path)} {
			cfg.ClaudeHeaderDefaults.VersionFile = unreadable
			if got := DefaultClaudeVersion(ResolveClaudeVersionConfig(cfg)); got != want {
				t.Fatalf("path %q: version %q, want %q", unreadable, got, want)
			}
		}
	}
}
