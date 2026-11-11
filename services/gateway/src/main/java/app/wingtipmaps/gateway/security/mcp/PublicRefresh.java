package app.wingtipmaps.gateway.security.mcp;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientAuthenticationToken;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.web.authentication.AuthenticationConverter;

/**
 * A public client's refresh: the token request that carries a
 * refresh_token and the client's id, and no secret (it has none).
 *
 * <p>Spring authenticates a public client only on the code exchange, by
 * its PKCE verifier (PublicClientAuthenticationConverter); a refresh from
 * one is an invalid_client. The refresh token is what proves this client
 * here: it was issued to this client id, which Spring's refresh provider
 * checks, and is spent by its use ({@link ConnectorTokens#refreshTokens}).
 */
final class PublicRefresh {

    private PublicRefresh() {}

    /** Reads such a request into a public client's authentication. */
    static AuthenticationConverter converter() {
        return (HttpServletRequest request) -> {
            if (!AuthorizationGrantType.REFRESH_TOKEN
                            .getValue()
                            .equals(request.getParameter(OAuth2ParameterNames.GRANT_TYPE))
                    || request.getParameter(OAuth2ParameterNames.CLIENT_SECRET) != null
                    || request.getHeader(HttpHeaders.AUTHORIZATION) != null) {
                return null;
            }
            String clientId = request.getParameter(OAuth2ParameterNames.CLIENT_ID);
            if (clientId == null
                    || clientId.isBlank()
                    || request.getParameterValues(OAuth2ParameterNames.CLIENT_ID).length != 1) {
                return null;
            }
            Map<String, Object> parameters = new HashMap<>();
            request.getParameterMap().forEach((key, values) -> {
                if (!key.equals(OAuth2ParameterNames.CLIENT_ID)) {
                    parameters.put(key, values.length == 1 ? values[0] : values);
                }
            });
            return new OAuth2ClientAuthenticationToken(clientId, ClientAuthenticationMethod.NONE, null, parameters);
        };
    }

    /** Admits the client of such a request when it is a registered public
     *  client allowed the refresh grant. */
    static AuthenticationProvider provider(RegisteredClientRepository clients) {
        return new AuthenticationProvider() {
            @Override
            public Authentication authenticate(Authentication authentication) {
                OAuth2ClientAuthenticationToken asked = (OAuth2ClientAuthenticationToken) authentication;
                if (!ClientAuthenticationMethod.NONE.equals(asked.getClientAuthenticationMethod())
                        || !AuthorizationGrantType.REFRESH_TOKEN
                                .getValue()
                                .equals(asked.getAdditionalParameters().get(OAuth2ParameterNames.GRANT_TYPE))) {
                    return null;
                }
                RegisteredClient client = clients.findByClientId(String.valueOf(asked.getPrincipal()));
                if (client == null
                        || !client.getClientAuthenticationMethods().contains(ClientAuthenticationMethod.NONE)
                        || !client.getAuthorizationGrantTypes().contains(AuthorizationGrantType.REFRESH_TOKEN)) {
                    throw new OAuth2AuthenticationException(OAuth2ErrorCodes.INVALID_CLIENT);
                }
                return new OAuth2ClientAuthenticationToken(client, ClientAuthenticationMethod.NONE, null);
            }

            @Override
            public boolean supports(Class<?> authentication) {
                return OAuth2ClientAuthenticationToken.class.isAssignableFrom(authentication);
            }
        };
    }
}
