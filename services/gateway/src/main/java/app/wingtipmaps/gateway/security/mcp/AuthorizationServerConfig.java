package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.service.PilotService;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration;
import org.springframework.security.config.annotation.web.configurers.oauth2.server.authorization.OAuth2AuthorizationServerConfigurer;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings;
import org.springframework.security.oauth2.server.authorization.token.DelegatingOAuth2TokenGenerator;
import org.springframework.security.oauth2.server.authorization.token.JwtGenerator;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenGenerator;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * The OAuth 2.1 authorization server a pilot connects their own Claude or
 * ChatGPT through (docs/design/mcp-connector.md): Spring Security's own,
 * at its default addresses -- /oauth2/authorize, /oauth2/token,
 * /oauth2/register (RFC 7591, open), /oauth2/jwks, /oauth2/revoke and
 * /.well-known/oauth-authorization-server (RFC 8414) -- with what the
 * MCP authorization spec and the two apps' docs ask on top: PKCE, tokens
 * for the MCP server alone, public clients only, a pilot's consent.
 *
 * <p>Its own filter chain, ahead of the app's (SecurityConfig), on its
 * endpoints alone. A pilot signs in the app's own way -- Google, Apple or
 * the emailed link, the session SecurityConfig keeps -- and a request
 * that comes before they have is kept (PendingConnection) while /connect
 * asks them to.
 */
@Configuration
public class AuthorizationServerConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain authorizationServerChain(
            HttpSecurity http,
            ConnectorSettings settings,
            PilotService pilots,
            RegisteredClientRepository clients,
            OAuth2TokenGenerator<?> tokens,
            AppProperties app)
            throws Exception {
        int registrationsPerHour = app.mcp().registrationsPerClientPerHour();
        if (!settings.enabled()) {
            return ConnectorOff.chain(http);
        }
        OAuth2AuthorizationServerConfigurer server = new OAuth2AuthorizationServerConfigurer();
        http.securityMatcher(server.getEndpointsMatcher())
                .with(
                        server,
                        as -> as.tokenGenerator(tokens)
                                .clientRegistrationEndpoint(registration -> registration
                                        .openRegistrationAllowed(true)
                                        .authenticationProviders(ConnectorClients.configure(settings.redirectUris())))
                                .authorizationEndpoint(authorize -> authorize
                                        .consentPage("/oauth2/consent")
                                        // Spring Security 7.2 checks a request twice, before
                                        // sign-in (its pre-validation filter) and in the
                                        // provider; this one validator is used for both.
                                        .authorizationCodeRequestAuthenticationValidator(
                                                AuthorizeRequests.validator(settings.resource())))
                                .clientAuthentication(client -> client.authenticationConverters(
                                                converters -> converters.addFirst(PublicRefresh.converter()))
                                        .authenticationProviders(
                                                providers -> providers.addFirst(PublicRefresh.provider(clients))))
                                .authorizationServerMetadataEndpoint(metadata ->
                                        metadata.authorizationServerMetadataCustomizer(ConnectorMetadata::customize)))
                // Registration is open (RFC 7591 without an initial access
                // token): Spring's endpoint sits behind the authorization
                // filter, so it is let through here and its own provider
                // (ConnectorClients) decides.
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.POST, "/oauth2/register")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .requestCache(cache -> cache.requestCache(PendingConnection.cache()))
                .exceptionHandling(handling -> handling.defaultAuthenticationEntryPointFor(
                        new LoginUrlAuthenticationEntryPoint("/connect"),
                        PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.GET, "/oauth2/authorize")))
                // The browser-based clients (the MCP Inspector) discover,
                // register and exchange from their own origin; Claude and
                // ChatGPT do it from their servers. No cookie is read on
                // those endpoints, so any origin may ask.
                .cors(cors -> cors.configurationSource(anyOrigin()))
                .addFilterBefore(new RegistrationLimit(registrationsPerHour), SecurityContextHolderFilter.class)
                .addFilterAfter(new PilotPrincipalFilter(pilots), SecurityContextHolderFilter.class);
        return ConnectorSecurityConfig.headersFirst(http.build());
    }

    @Bean
    AuthorizationServerSettings authorizationServerSettings(ConnectorSettings settings) {
        return AuthorizationServerSettings.builder().issuer(settings.issuer()).build();
    }

    @Bean
    RegisteredClientRepository registeredClientRepository(JdbcOperations jdbc) {
        return new JdbcRegisteredClientRepository(jdbc);
    }

    @Bean
    OAuth2AuthorizationService authorizationService(JdbcOperations jdbc, RegisteredClientRepository clients) {
        return new RotatedRefreshTokens(new JdbcOAuth2AuthorizationService(jdbc, clients), jdbc);
    }

    @Bean
    OAuth2AuthorizationConsentService authorizationConsentService(
            JdbcOperations jdbc, RegisteredClientRepository clients) {
        return new JdbcOAuth2AuthorizationConsentService(jdbc, clients);
    }

    @Bean
    JWKSource<SecurityContext> jwkSource(ConnectorSettings settings) {
        return new ImmutableJWKSet<>(new JWKSet(SigningKey.of(settings.signingKey())));
    }

    /** What the registration endpoint would check an initial access token
     *  with; registration here is open, but Spring wires one regardless. */
    @Bean
    JwtDecoder jwtDecoder(JWKSource<SecurityContext> keys) {
        return OAuth2AuthorizationServerConfiguration.jwtDecoder(keys);
    }

    @Bean
    OAuth2TokenGenerator<?> tokenGenerator(JWKSource<SecurityContext> keys, ConnectorSettings settings) {
        JwtGenerator jwts = new JwtGenerator(new NimbusJwtEncoder(keys));
        jwts.setJwtCustomizer(ConnectorTokens.customizer(settings.resource()));
        return new DelegatingOAuth2TokenGenerator(jwts, ConnectorTokens.refreshTokens());
    }

    private static UrlBasedCorsConfigurationSource anyOrigin() {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOriginPatterns(List.of("*"));
        cors.setAllowedMethods(List.of("GET", "POST"));
        cors.setAllowedHeaders(List.of("Content-Type", "Authorization", "MCP-Protocol-Version"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        for (String path :
                List.of("/.well-known/**", "/oauth2/token", "/oauth2/register", "/oauth2/jwks", "/oauth2/revoke")) {
            source.registerCorsConfiguration(path, cors);
        }
        return source;
    }
}
