package helps

import (
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
)

var claudeInstalledVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

// ResolveClaudeVersionConfig snapshots the installed version once per request so
// an update during request preparation cannot split the UA and billing versions.
// Missing or invalid files preserve the configured/builtin fallback.
func ResolveClaudeVersionConfig(cfg *config.Config) *config.Config {
	if cfg == nil || strings.TrimSpace(cfg.ClaudeHeaderDefaults.VersionFile) == "" {
		return cfg
	}
	resolved := *cfg
	resolved.ClaudeHeaderDefaults.VersionFile = ""
	data, err := os.ReadFile(strings.TrimSpace(cfg.ClaudeHeaderDefaults.VersionFile))
	if err != nil {
		return &resolved
	}
	version := strings.TrimSuffix(string(data), "\n")
	if !claudeInstalledVersionPattern.MatchString(version) {
		return &resolved
	}
	ua := "claude-cli/" + version + " (external, cli)"
	if _, ok := parseClaudeCLIVersion(ua); ok {
		resolved.ClaudeHeaderDefaults.UserAgent = ua
	}
	return &resolved
}

// ClaudeRequestVersion trusts the caller version only after native detection.
func ClaudeRequestVersion(cfg *config.Config, headers http.Header, confirmed bool) string {
	if confirmed {
		ua := strings.TrimSpace(headers.Get("User-Agent"))
		if plausibleClaudeCodeUserAgent(ua, cfg) {
			matches := claudeCLIVersionPattern.FindStringSubmatch(ua)
			return strings.Join(matches[1:], ".")
		}
	}
	return DefaultClaudeVersion(cfg)
}

// ApplyClaudeNativeUserAgent preserves a confirmed native caller's UA without
// allowing an unconfirmed client to populate the shared device profile.
func ApplyClaudeNativeUserAgent(r *http.Request, headers http.Header, cfg *config.Config) {
	if ua := strings.TrimSpace(headers.Get("User-Agent")); plausibleClaudeCodeUserAgent(ua, cfg) {
		r.Header.Set("User-Agent", ua)
	}
}
