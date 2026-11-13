package app.wingtipmaps.gateway.security.mcp;

import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

/**
 * The connector's addresses where it is off (MCP_ENABLED unset, as in
 * production until it launches): every one a 404, so nobody can register
 * a client, ask for a token or reach the records routes. Its own chain in
 * the authorization server's place (AuthorizationServerConfig), ahead of
 * the connector's other chain (ConnectorSecurityConfig), which then never
 * sees a request.
 *
 * <p>Named one by one rather than /oauth2/**: the app's own Google and
 * Apple sign-in live at /oauth2/authorization/{google,apple}.
 */
final class ConnectorOff {

    static final String[] PATHS = {
        "/oauth2/authorize",
        "/oauth2/token",
        "/oauth2/register",
        "/oauth2/jwks",
        "/oauth2/revoke",
        "/oauth2/introspect",
        "/oauth2/consent",
        "/oauth2/device_authorization",
        "/oauth2/device_verification",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-authorization-server/**",
        "/.well-known/oauth-protected-resource/**",
        "/mcp",
        "/connect",
        "/connect/continue",
        "/internal/mcp/**"
    };

    private ConnectorOff() {}

    static SecurityFilterChain chain(HttpSecurity http) throws Exception {
        return ConnectorSecurityConfig.headersFirst(http.securityMatcher(PATHS)
                .authorizeHttpRequests(authorize -> authorize.anyRequest().denyAll())
                .exceptionHandling(
                        handling -> handling.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.NOT_FOUND))
                                .accessDeniedHandler((request, response, denied) ->
                                        response.sendError(HttpStatus.NOT_FOUND.value())))
                .build());
    }
}
