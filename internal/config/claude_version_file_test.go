package config

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestClaudeVersionFileV8RoundTrip(t *testing.T) {
	raw := []byte("config-version: 8\nupstream:\n  claude:\n    header-defaults:\n      version-file: '  /config/claude-code-version  '\n")
	cfg, err := ParseConfigBytes(raw)
	if err != nil {
		t.Fatal(err)
	}
	const want = "/config/claude-code-version"
	if cfg.ClaudeHeaderDefaults.VersionFile != want {
		t.Fatalf("version file = %q", cfg.ClaudeHeaderDefaults.VersionFile)
	}
	snapshot, err := yaml.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := SaveConfigPreserveComments(path, cfg, true); err != nil {
		t.Fatal(err)
	}
	saved, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{"snapshot": snapshot, "saved": saved} {
		if name == "saved" {
			if err := ValidateV8Config(data); err != nil {
				t.Fatalf("%s: %v", name, err)
			}
		}
		restored, err := ParseConfigBytes(data)
		if err != nil {
			t.Fatal(err)
		}
		for _, view := range []*Config{restored, restored.CloneForRuntime(), restored.ForAPIKey()} {
			if view.ClaudeHeaderDefaults.VersionFile != want {
				t.Fatalf("%s lost version-file: %q", name, view.ClaudeHeaderDefaults.VersionFile)
			}
		}
	}
}
