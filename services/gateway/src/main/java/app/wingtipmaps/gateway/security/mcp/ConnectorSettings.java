package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.config.AppProperties;
import java.util.List;
import java.util.Map;
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
     *  their saved flights saved, changed and deleted. Nothing else is
     *  ever issued. The write is wingtip:flights, not the wingtip:write
     *  a pilot once consented to as "Save flights" alone: a consent is
     *  kept and not asked again, so the wider grant needs a name of its
     *  own (V53, the security review of 2026-11-22, L4). */
    public static final String READ = "wingtip:read";

    public static final String WRITE = "wingtip:flights";

    /** The shortest MCP_INTERNAL_TOKEN taken: it alone lets a caller on
     *  the internal port read and change any pilot's records, so it is a
     *  key, not a word (dev.sh doctor writes 64 hex characters). */
    static final int MIN_INTERNAL_TOKEN = 32;

    public static final List<String> SCOPES = List.of(READ, WRITE);

    /** What each scope lets the AI app do, in the pilot's words: the
     *  consent page asks with them and Connected Apps says them. */
    public static final Map<String, String> SCOPE_WORDS = Map.of(
            READ, "Read your airplanes and saved flights, and plan with them",
            WRITE, "Save, change and delete your saved flights");

    /** A connection's granted scopes ("wingtip:read wingtip:flights") in those words. */
    public static List<String> wordsOf(String scopes) {
        return scopes == null
                ? List.of()
                : SCOPES.stream()
                        .filter(List.of(scopes.split("[ ,]"))::contains)
                        .map(SCOPE_WORDS::get)
                        .toList();
    }

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
        if (enabled && internalToken.strip().length() < MIN_INTERNAL_TOKEN) {
            throw new IllegalStateException("MCP_INTERNAL_TOKEN (app.mcp.internal-token) is shorter than "
                    + MIN_INTERNAL_TOKEN + " characters: it is the key to every pilot's records on the internal "
                    + "port. Set a long random value on the gateway and the planner (scripts/dev/dev.sh doctor "
                    + "writes one into .env).");
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
