package app.wingtipmaps.gateway.security.mcp;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
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

    private final String issuer;
    private final String resource;
    private final RedirectUris redirectUris;
    private final String signingKey;
    private final String internalToken;

    public ConnectorSettings(
            @Value("${app.public-base-url:}") String publicBaseUrl,
            @Value("${app.mcp.resource:}") String resource,
            @Value("${app.mcp.redirect-uris:}") List<String> redirectUris,
            @Value("${app.mcp.signing-key:}") String signingKey,
            @Value("${app.mcp.internal-token:}") String internalToken) {
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
