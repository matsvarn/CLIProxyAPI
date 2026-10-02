package management

import (
	"net"
	"net/http"
	"net/url"
	"strings"
)

// trustedLocalHostname reports whether the Host header hostname (port stripped,
// `[::1]:8317` handled) is a loopback hostname the embedded panel may be served
// on. Anything else — including names that resolve to loopback — is rejected so
// a DNS-rebinding hostname cannot pass the check.
func trustedLocalHostname(hostHeader string) (string, bool) {
	host := strings.TrimSpace(hostHeader)
	if parsed, _, err := net.SplitHostPort(host); err == nil {
		host = parsed
	}
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	switch host {
	case "127.0.0.1", "localhost", "::1":
		return host, true
	}
	return "", false
}

// isTrustedLocalPanelRequest reports whether a request may use the local panel
// trust path (CPA_TRUST_LOCAL_PANEL=1). The API sends `Access-Control-Allow-
// Origin: *` on every route, so the trust must be bound to the panel's own
// origin: a browser page on another site could otherwise exfiltrate management
// responses from 127.0.0.1. Non-browser local processes (no Origin header) are
// allowed because they can already read the auth files on disk.
func isTrustedLocalPanelRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if _, ok := trustedLocalHostname(r.Host); !ok {
		return false
	}

	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin != "" {
		u, err := url.Parse(origin)
		if err != nil || u.Scheme != "http" || u.Host != r.Host || u.User != nil {
			return false
		}
		if path := u.EscapedPath(); path != "" && path != "/" {
			return false
		}
		if u.RawQuery != "" || u.Fragment != "" {
			return false
		}
	}

	switch strings.ToLower(strings.TrimSpace(r.Header.Get("Sec-Fetch-Site"))) {
	case "", "same-origin", "none":
		return true
	}
	return false
}
