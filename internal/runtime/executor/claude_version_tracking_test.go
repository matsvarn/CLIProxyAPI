package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/executor"
	sdktranslator "github.com/router-for-me/CLIProxyAPI/v8/sdk/translator"
	"github.com/tidwall/gjson"
)

func TestClaudeVersionTrackingOutbound(t *testing.T) {
	for _, stabilize := range []bool{false, true} {
		for _, stream := range []bool{false, true} {
			t.Run(fmt.Sprintf("stabilize=%t/stream=%t", stabilize, stream), func(t *testing.T) {
				var seenUA, seenBilling string
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					body, _ := io.ReadAll(r.Body)
					seenUA = r.UserAgent()
					seenBilling = gjson.GetBytes(body, "system.0.text").String()
					if stream {
						w.Header().Set("Content-Type", "text/event-stream")
						_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
					} else {
						w.Header().Set("Content-Type", "application/json")
						_, _ = io.WriteString(w, `{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":1,"output_tokens":1}}`)
					}
				}))
				defer server.Close()
				path := filepath.Join(t.TempDir(), "claude-code-version")
				cfg := &config.Config{}
				// Decode through the public config contract so this regression also runs before the field exists.
				raw, _ := json.Marshal(map[string]any{"version-file": path, "user-agent": "claude-cli/2.1.300 (external, cli)", "stabilize-device-profile": stabilize})
				if err := json.Unmarshal(raw, &cfg.ClaudeHeaderDefaults); err != nil {
					t.Fatal(err)
				}
				executor := NewClaudeExecutor(cfg)
				auth := &cliproxyauth.Auth{ID: "version-tracking", Metadata: claudeOAuthTestMetadata(), Attributes: map[string]string{"api_key": "sk-ant-oat-version-tracking", "base_url": server.URL}}
				const userID = `{"device_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","account_uuid":"11111111-2222-4333-8444-555555555555","session_id":"11111111-2222-4333-8444-555555555555"}`
				for _, tc := range []struct {
					name, file, ua, want string
					native, billing      bool
				}{
					{name: "installed", file: "2.1.321\n", want: "2.1.321"},
					{name: "updated", file: "2.2.1\n", want: "2.2.1"},
					{name: "malformed", file: "2.2.1 garbage\n", want: "2.1.300"},
					{name: "prerelease", file: "3.0.0-beta\n", want: "2.1.300"},
					{name: "missing", want: "2.1.300"},
					{name: "native behind installed", file: "2.2.1\n", ua: "2.1.321", want: "2.1.321", native: true},
					{name: "native patch", file: "2.1.310\n", ua: "2.1.321", want: "2.1.321", native: true, billing: true},
					{name: "native minor", file: "2.1.310\n", ua: "2.2.1", want: "2.2.1", native: true, billing: true},
					{name: "native major missing billing", file: "2.1.310\n", ua: "3.0.1", want: "3.0.1", native: true},
					{name: "copied UA", file: "2.1.321\n", ua: "99.0.0", want: "2.1.321"},
				} {
					t.Run(tc.name, func(t *testing.T) {
						if tc.file == "" {
							if err := os.Remove(path); err != nil {
								t.Fatal(err)
							}
						} else if err := os.WriteFile(path, []byte(tc.file), 0600); err != nil {
							t.Fatal(err)
						}
						headers := http.Header{}
						if tc.ua != "" {
							headers.Set("User-Agent", "claude-cli/"+tc.ua+" (external, cli)")
						}
						metadata, system := "", ""
						if tc.native {
							headers.Set("X-App", "cli")
							headers.Set("Anthropic-Beta", "claude-code-20250219,oauth-2025-04-20")
							metadata = `,"metadata":{"user_id":` + fmt.Sprintf("%q", userID) + `}`
							if tc.billing {
								system = `,"system":[{"type":"text","text":"x-anthropic-billing-header: cc_version=` + tc.ua + `.abc; cc_entrypoint=cli; cch=00000;"}]`
							}
						}
						payload := []byte(`{"model":"claude-sonnet-5","max_tokens":32,"messages":[{"role":"user","content":"hello"}]` + metadata + system + `}`)
						req := cliproxyexecutor.Request{Model: "claude-sonnet-5", Payload: payload}
						opts := cliproxyexecutor.Options{SourceFormat: sdktranslator.FormatClaude, OriginalRequest: payload, Headers: headers}
						if stream {
							result, err := executor.ExecuteStream(context.Background(), auth, req, opts)
							if err != nil {
								t.Fatal(err)
							}
							for chunk := range result.Chunks {
								if chunk.Err != nil {
									t.Fatal(chunk.Err)
								}
							}
						} else if _, err := executor.Execute(context.Background(), auth, req, opts); err != nil {
							t.Fatal(err)
						}
						if want := "claude-cli/" + tc.want + " (external, cli)"; seenUA != want {
							t.Errorf("outbound UA = %q, want %q", seenUA, want)
						}
						if !strings.Contains(seenBilling, "cc_version="+tc.want+".") {
							t.Errorf("outbound billing = %q, want cc_version=%s", seenBilling, tc.want)
						}
					})
				}
			})
		}
	}
}

func TestClaudeVersionTrackingCountTokens(t *testing.T) {
	path := filepath.Join(t.TempDir(), "claude-code-version")
	cfg := &config.Config{}
	cfg.ClaudeHeaderDefaults.VersionFile = path
	executor := NewClaudeExecutor(cfg)
	auth := &cliproxyauth.Auth{Attributes: map[string]string{"api_key": "sk-ant-oat-version-count"}}
	for _, native := range []bool{false, true} {
		for _, installed := range []string{"2.1.321", "2.2.1"} {
			if err := os.WriteFile(path, []byte(installed+"\n"), 0600); err != nil {
				t.Fatal(err)
			}
			want := installed
			headers := http.Header{}
			if native {
				want = "3.0.1"
				headers.Set("User-Agent", "claude-cli/3.0.1 (external, cli)")
				headers.Set("X-App", "cli")
				headers.Set("Anthropic-Beta", "claude-code-20250219,oauth-2025-04-20")
			}
			transport := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
				if req.URL.Path != "/v1/messages/count_tokens" {
					t.Fatalf("unexpected path: %s", req.URL.Path)
				}
				if got := req.UserAgent(); got != "claude-cli/"+want+" (external, cli)" {
					t.Errorf("count_tokens UA = %q, want version %s", got, want)
				}
				return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"input_tokens":7}`)), Request: req}, nil
			})
			ctx := context.WithValue(context.Background(), "cliproxy.roundtripper", http.RoundTripper(transport))
			payload := []byte(`{"model":"claude-sonnet-5","messages":[{"role":"user","content":"hello"}],"tools":[]}`)
			_, err := executor.CountTokens(ctx, auth, cliproxyexecutor.Request{Model: "claude-sonnet-5", Payload: payload}, cliproxyexecutor.Options{SourceFormat: sdktranslator.FormatClaude, Headers: headers})
			if err != nil {
				t.Fatal(err)
			}
		}
	}
}
