package app.wingtipmaps.gateway.security.mcp;

import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationServerMetadata;

/**
 * The authorization server's metadata (RFC 8414) as this one is: Spring
 * lists every grant and client authentication it knows; this lists what
 * a connector's client can use here.
 */
final class ConnectorMetadata {

    private ConnectorMetadata() {}

    static void customize(OAuth2AuthorizationServerMetadata.Builder metadata) {
        // Every client here is public (ConnectorClients). Claude chooses a
        // client ID metadata document only where "none" is listed, and
        // otherwise registers (its "Authentication for connectors").
        metadata.tokenEndpointAuthenticationMethods(methods -> {
                    methods.clear();
                    methods.add(ClientAuthenticationMethod.NONE.getValue());
                })
                .grantTypes(grants -> {
                    grants.clear();
                    grants.add(AuthorizationGrantType.AUTHORIZATION_CODE.getValue());
                    grants.add(AuthorizationGrantType.REFRESH_TOKEN.getValue());
                })
                // The scopes a client should ask for: both, a pilot's
                // consent page says what each lets it do. No openid:
                // ChatGPT asks for it whenever it is listed.
                .scopes(scopes -> {
                    scopes.clear();
                    scopes.addAll(ConnectorSettings.SCOPES);
                })
                .claims(claims -> {
                    // Nothing here introspects; the planner checks tokens by signature.
                    claims.remove("introspection_endpoint");
                    claims.remove("introspection_endpoint_auth_methods_supported");
                });
    }
}
