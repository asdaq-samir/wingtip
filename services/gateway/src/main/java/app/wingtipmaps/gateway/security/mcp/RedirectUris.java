package app.wingtipmaps.gateway.security.mcp;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;

/**
 * The callbacks a connector's client may register (app.mcp.redirect-uris).
 * Registration is open -- Claude and ChatGPT register themselves (RFC 7591)
 * -- so this list is what keeps a stranger's client from registering a
 * callback of its own and asking a pilot to approve it.
 *
 * <p>Each entry is one of:
 * <ul>
 *   <li>an exact URI: Claude's https://claude.ai/api/mcp/auth_callback,
 *       ChatGPT's https://chatgpt.com/connector_platform_oauth_redirect;
 *   <li>a prefix, ending in {@code *}: ChatGPT's per-connector
 *       https://chatgpt.com/connector/oauth/{callback_id};
 *   <li>a loopback origin, {@code http://localhost} or
 *       {@code http://127.0.0.1}: any port and path on it, for a native
 *       client's ephemeral port (RFC 8252 section 7.3) -- Claude Code and
 *       the MCP Inspector.
 * </ul>
 */
public final class RedirectUris {

    private final List<String> allowed;

    RedirectUris(List<String> allowed) {
        this.allowed = allowed.stream()
                .map(String::trim)
                .filter(entry -> !entry.isEmpty())
                .toList();
    }

    /** Whether a client may register this callback. */
    public boolean allows(String redirectUri) {
        URI uri = parse(redirectUri);
        if (uri == null || uri.getFragment() != null) {
            return false;
        }
        for (String entry : allowed) {
            if (entry.endsWith("*") && redirectUri.startsWith(entry.substring(0, entry.length() - 1))) {
                return true;
            }
            if (isLoopback(entry) && sameLoopbackOrigin(entry, uri)) {
                return true;
            }
            if (entry.equals(redirectUri)) {
                return true;
            }
        }
        return false;
    }

    /** Whether a requested callback is a registered loopback one on
     *  another port: what Spring's own check allows for 127.0.0.1 but not
     *  for localhost, which Claude Code's client metadata declares. */
    static boolean sameLoopbackIgnoringPort(String registered, String requested) {
        URI a = parse(registered);
        URI b = parse(requested);
        return a != null
                && b != null
                && "http".equals(a.getScheme())
                && "http".equals(b.getScheme())
                && isLoopbackHost(a.getHost())
                && a.getHost().equalsIgnoreCase(b.getHost())
                && a.getRawPath() != null
                && a.getRawPath().equals(b.getRawPath())
                && b.getRawQuery() == null
                && b.getFragment() == null;
    }

    private static boolean isLoopback(String entry) {
        URI uri = parse(entry);
        return uri != null
                && "http".equals(uri.getScheme())
                && isLoopbackHost(uri.getHost())
                && uri.getPort() == -1
                && (uri.getRawPath() == null || uri.getRawPath().isEmpty());
    }

    private static boolean sameLoopbackOrigin(String entry, URI uri) {
        return "http".equals(uri.getScheme()) && URI.create(entry).getHost().equalsIgnoreCase(uri.getHost());
    }

    static boolean isLoopbackHost(String host) {
        return host != null && List.of("localhost", "127.0.0.1").contains(host.toLowerCase(Locale.ROOT));
    }

    private static URI parse(String value) {
        try {
            return new URI(value);
        } catch (URISyntaxException e) {
            return null;
        }
    }
}
