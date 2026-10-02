package management

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
)

func trustedPanelRequest(t *testing.T, host, remoteAddr, origin, fetchSite string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = host
	req.RemoteAddr = remoteAddr
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if fetchSite != "" {
		req.Header.Set("Sec-Fetch-Site", fetchSite)
	}
	return req
}

func TestIsTrustedLocalPanelRequest(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		host       string
		remoteAddr string
		origin     string
		fetchSite  string
		want       bool
	}{
		{name: "same-origin GET without Origin", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", want: true},
		{name: "same-origin PATCH with Origin", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", origin: "http://127.0.0.1:8317", want: true},
		{name: "localhost host", host: "localhost:8317", remoteAddr: "127.0.0.1:5000", origin: "http://localhost:8317", want: true},
		{name: "ipv6 loopback host", host: "[::1]:8317", remoteAddr: "[::1]:5000", origin: "http://[::1]:8317", want: true},
		{name: "cross-site origin", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", origin: "https://evil.example", want: false},
		{name: "dev-server origin on same host", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", origin: "http://127.0.0.1:5173", want: false},
		{name: "dns-rebinding hostname", host: "evil.example", remoteAddr: "127.0.0.1:5000", want: false},
		{name: "loopback-resolving hostname", host: "127.0.0.1.nip.io:8317", remoteAddr: "127.0.0.1:5000", want: false},
		{name: "sec-fetch-site cross-site", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", fetchSite: "cross-site", want: false},
		{name: "sec-fetch-site same-site", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", fetchSite: "same-site", want: false},
		{name: "sec-fetch-site same-origin", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", fetchSite: "same-origin", want: true},
		{name: "origin null", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", origin: "null", want: false},
		{name: "origin wrong scheme", host: "127.0.0.1:8317", remoteAddr: "127.0.0.1:5000", origin: "https://127.0.0.1:8317", want: false},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := trustedPanelRequest(t, tt.host, tt.remoteAddr, tt.origin, tt.fetchSite)
			if got := isTrustedLocalPanelRequest(req); got != tt.want {
				t.Fatalf("isTrustedLocalPanelRequest() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMiddlewareTrustedLocalPanel(t *testing.T) {
	gin.SetMode(gin.TestMode)

	newEngine := func(trust bool) *gin.Engine {
		if trust {
			t.Setenv("CPA_TRUST_LOCAL_PANEL", "1")
		} else {
			t.Setenv("CPA_TRUST_LOCAL_PANEL", "")
		}
		h := NewHandler(&config.Config{RemoteManagement: config.RemoteManagement{SecretKey: "test-key"}}, "", nil)
		engine := gin.New()
		engine.GET("/v8/management/config", h.Middleware(), func(c *gin.Context) {
			c.Status(http.StatusOK)
		})
		return engine
	}

	perform := func(engine *gin.Engine, origin string) int {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/v8/management/config", nil)
		req.Host = "127.0.0.1:8317"
		req.RemoteAddr = "127.0.0.1:5150"
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		engine.ServeHTTP(rec, req)
		return rec.Code
	}

	t.Run("no-key same-origin request passes with env set", func(t *testing.T) {
		if got := perform(newEngine(true), ""); got != http.StatusOK {
			t.Fatalf("status = %d, want %d", got, http.StatusOK)
		}
	})

	t.Run("evil origin rejected with env set", func(t *testing.T) {
		if got := perform(newEngine(true), "https://evil.example"); got != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", got, http.StatusUnauthorized)
		}
	})

	t.Run("no-key request rejected with env unset", func(t *testing.T) {
		if got := perform(newEngine(false), ""); got != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", got, http.StatusUnauthorized)
		}
	})
}
