package app.wingtipmaps.gateway.security.mcp;

import java.time.Instant;
import java.util.Base64;
import java.util.Collections;
import java.util.TreeSet;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.keygen.Base64StringKeyGenerator;
import org.springframework.security.crypto.keygen.StringKeyGenerator;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2AuthorizationGrantAuthenticationToken;
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenGenerator;

/** What goes into the connector's tokens. */
final class ConnectorTokens {

    private ConnectorTokens() {}

    /**
     * An access token's audience is the MCP server (RFC 8707, which the
     * MCP spec's "Token Handling" has the server check), not the client
     * Spring puts there; its subject is the pilot's id, the principal
     * {@link PilotPrincipalFilter} signed the authorization in as; it
     * names its client; and its scope is one string. A token request
     * that names another resource is refused (invalid_target), as the
     * authorization request was.
     */
    static OAuth2TokenCustomizer<JwtEncodingContext> customizer(String resource) {
        return context -> {
            if (!OAuth2TokenType.ACCESS_TOKEN.equals(context.getTokenType())) {
                return;
            }
            Authentication grant = context.getAuthorizationGrant();
            if (grant instanceof OAuth2AuthorizationGrantAuthenticationToken asked) {
                Object named = asked.getAdditionalParameters().get("resource");
                if (named != null && !Resources.matches(named, resource)) {
                    throw new OAuth2AuthenticationException(new OAuth2Error(
                            "invalid_target", "resource: this server's tokens are for " + resource, null));
                }
            }
            // A singleton list, as Spring's own: the claims are kept with
            // the authorization as JSON, and Spring reads back only the
            // collection types it knows.
            context.getClaims()
                    .audience(Collections.singletonList(resource))
                    .claim("client_id", context.getRegisteredClient().getClientId())
                    // A space-separated string, as RFC 9068 section 2.2.3
                    // has a JWT access token's scope; Spring writes a list.
                    .claim("scope", String.join(" ", new TreeSet<>(context.getAuthorizedScopes())));
        };
    }

    /**
     * Refresh tokens for the connector's public clients. Spring issues none
     * to a public client (OAuth2RefreshTokenGenerator), so a pilot's Claude
     * would have to send them to sign in again every 15 minutes; OAuth 2.1
     * allows one to a public client where it is rotated, which every
     * client here is ({@link ConnectorClients}: reuseRefreshTokens false),
     * and Claude's and ChatGPT's connectors both refresh.
     */
    static OAuth2TokenGenerator<OAuth2RefreshToken> refreshTokens() {
        StringKeyGenerator keys =
                new Base64StringKeyGenerator(Base64.getUrlEncoder().withoutPadding(), 96);
        return (OAuth2TokenContext context) -> {
            if (!OAuth2TokenType.REFRESH_TOKEN.equals(context.getTokenType())
                    || !context.getRegisteredClient()
                            .getAuthorizationGrantTypes()
                            .contains(AuthorizationGrantType.REFRESH_TOKEN)) {
                return null;
            }
            Instant issued = Instant.now();
            return new OAuth2RefreshToken(
                    keys.generateKey(),
                    issued,
                    issued.plus(context.getRegisteredClient().getTokenSettings().getRefreshTokenTimeToLive()));
        };
    }
}
