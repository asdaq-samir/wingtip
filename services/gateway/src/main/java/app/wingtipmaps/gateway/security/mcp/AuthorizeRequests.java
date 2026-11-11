package app.wingtipmaps.gateway.security.mcp;

import java.util.function.Consumer;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2AuthorizationCodeRequestAuthenticationContext;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2AuthorizationCodeRequestAuthenticationException;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2AuthorizationCodeRequestAuthenticationToken;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2AuthorizationCodeRequestAuthenticationValidator;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;

/**
 * The checks on an authorization request beyond Spring's own: the
 * callback, with localhost on any port as well as 127.0.0.1, and the
 * resource the token is asked for.
 */
final class AuthorizeRequests {

    private AuthorizeRequests() {}

    static Consumer<OAuth2AuthorizationCodeRequestAuthenticationContext> validator(String resource) {
        return context -> {
            callback(context);
            OAuth2AuthorizationCodeRequestAuthenticationValidator.DEFAULT_SCOPE_VALIDATOR.accept(context);
            resource(context, resource);
        };
    }

    /**
     * Spring matches a loopback callback on any port only for an IP
     * literal (RFC 8252 section 7.3); Claude Code's client metadata declares
     * http://localhost/callback and asks on an ephemeral port, so localhost
     * is matched the same way (Claude's "Authentication for connectors",
     * Callback URLs). Anything else is Spring's exact match.
     */
    private static void callback(OAuth2AuthorizationCodeRequestAuthenticationContext context) {
        OAuth2AuthorizationCodeRequestAuthenticationToken asked = context.getAuthentication();
        String requested = asked.getRedirectUri();
        RegisteredClient client = context.getRegisteredClient();
        if (requested != null && requested.startsWith("http://localhost")) {
            boolean registered = client.getRedirectUris().stream()
                    .anyMatch(uri -> RedirectUris.sameLoopbackIgnoringPort(uri, requested));
            if (!registered) {
                // No redirect: a callback not registered is not one to send an error to.
                throw refused(OAuth2ErrorCodes.INVALID_REQUEST, "redirect_uri", asked, null);
            }
            return;
        }
        OAuth2AuthorizationCodeRequestAuthenticationValidator.DEFAULT_REDIRECT_URI_VALIDATOR.accept(context);
    }

    /**
     * RFC 8707: a token is for one resource, the MCP server's. A client
     * that names no resource gets one for it, the only resource there is;
     * one that names another is refused with invalid_target, so no token
     * from here is ever meant for somebody else's server.
     */
    private static void resource(OAuth2AuthorizationCodeRequestAuthenticationContext context, String resource) {
        OAuth2AuthorizationCodeRequestAuthenticationToken request = context.getAuthentication();
        Object asked = request.getAdditionalParameters().get("resource");
        if (asked != null && !Resources.matches(asked, resource)) {
            String redirect = request.getRedirectUri() != null
                    ? request.getRedirectUri()
                    : context.getRegisteredClient().getRedirectUris().iterator().next();
            throw refused("invalid_target", "resource", request, redirect);
        }
    }

    private static OAuth2AuthorizationCodeRequestAuthenticationException refused(
            String code, String parameter, OAuth2AuthorizationCodeRequestAuthenticationToken asked, String redirect) {
        OAuth2AuthorizationCodeRequestAuthenticationToken result =
                new OAuth2AuthorizationCodeRequestAuthenticationToken(
                        asked.getAuthorizationUri(),
                        asked.getClientId(),
                        (Authentication) asked.getPrincipal(),
                        redirect,
                        asked.getState(),
                        asked.getScopes(),
                        asked.getAdditionalParameters());
        result.setAuthenticated(true);
        return new OAuth2AuthorizationCodeRequestAuthenticationException(
                new OAuth2Error(code, "OAuth 2.0 Parameter: " + parameter, null), result);
    }
}
