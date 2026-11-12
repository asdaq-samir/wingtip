package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.config.AppProperties;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The connector's settings: where its MCP server is, which callbacks a
 * client may register, the key its tokens are signed with and the token
 * the planner's tools present to read a pilot's records
 * (docs/design/mcp-connector.md).
 */
@Component
public class ConnectorSettings {

    /** What a pilot may grant: their records read and planned with, and
     *  a flight saved to their account. Nothing else is ever issued. */
    public static final String READ = "wingtip:read";

    public static final String WRITE = "wingtip:write";
    public static final List<String> SCOPES = List.of(READ, WRITE);

    private final boolean enabled;
    private final String issuer;
    private final String resource;
    private final RedirectUris redirectUris;
    private final String signingKey;
    private final String internalToken;

    @Autowired
    public ConnectorSettings(AppProperties app) {
        this(
                app.mcp().enabled(),
                app.publicBaseUrl(),
                app.mcp().resource(),
                app.mcp().redirectUris(),
                app.mcp().signingKey(),
                app.mcp().internalToken());
    }

    public ConnectorSettings(
            boolean enabled,
            String publicBaseUrl,
            String resource,
            List<String> redirectUris,
            String signingKey,
            String internalToken) {
        // The issuer is the address pilots reach this app at, with no
        // trailing slash: RFC 8414's issuer is compared as a string, and
        // the planner checks a token's iss against it. Locally, without a
        // public address, the plain port's.
        this.issuer = publicBaseUrl.isBlank() ? "http://localhost:8080" : publicBaseUrl.replaceAll("/+$", "");
        // The MCP server's canonical URI (RFC 8707, the MCP spec's
        // "Canonical Server URI"): the audience of every token issued here.
        this.resource = resource.isBlank() ? this.issuer + "/mcp" : resource.replaceAll("/+$", "");
        this.redirectUris = new RedirectUris(redirectUris);
        this.signingKey = signingKey;
        this.internalToken = internalToken;
        this.enabled = enabled;
        // On, the planner reads pilots' records with this secret; a blank
        // one would leave the connector half working and saying nothing.
        if (enabled && internalToken.isBlank()) {
            throw new IllegalStateException("MCP_ENABLED is on but MCP_INTERNAL_TOKEN (app.mcp.internal-token) is "
                    + "not set: the planner's connector reads pilots' records with it. Set the same long random "
                    + "value on the gateway and the planner (scripts/dev/dev.sh doctor writes one into .env), "
                    + "or turn the connector off.");
        }
    }

    /**
     * Whether the connector is on: its authorization server, /mcp and the
     * records the planner reads (MCP_ENABLED). Off, every one of its
     * addresses is a 404 (ConnectorOff) -- in production until the
     * connector launches, so nobody can register clients or reach its
     * routes before then (the security audit's M3, 2026-11-10).
     */
    public boolean enabled() {
        return enabled;
    }

    public String issuer() {
        return issuer;
    }

    public String resource() {
        return resource;
    }

    public RedirectUris redirectUris() {
        return redirectUris;
    }

    String signingKey() {
        return signingKey;
    }

    public String internalToken() {
        return internalToken;
    }
}
