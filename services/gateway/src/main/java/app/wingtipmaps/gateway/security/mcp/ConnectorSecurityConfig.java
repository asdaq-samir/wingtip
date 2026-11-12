package app.wingtipmaps.gateway.security.mcp;

import jakarta.servlet.Filter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.savedrequest.NullRequestCache;

/**
 * Who may reach the connector's other addresses, ahead of the app's own
 * rules (SecurityConfig) and after the authorization server's:
 *
 * <ul>
 *   <li>/mcp and its metadata: anyone. The planner, behind them, refuses
 *       a call without a token of its own issue (McpProxyController).
 *   <li>/internal/mcp: whoever reaches the gateway's internal port, which
 *       only the compose network does (InternalPortConfig), and then only
 *       the planner's shared token gets past (InternalRecordsController).
 *   <li>/connect and /connect/continue: anyone, to sign in.
 *   <li>/oauth2/consent: a signed-in pilot.
 * </ul>
 *
 * <p>A bearer token rather than a cookie is the credential on the first
 * two, so they take no CSRF token. The pages' forms do: the emailed
 * link's form posts to the app's own sign-in, which checks the same
 * cookie-held token SecurityConfig keeps.
 */
@Configuration
public class ConnectorSecurityConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 1)
    SecurityFilterChain connectorChain(HttpSecurity http) throws Exception {
        http.securityMatcher(
                        "/mcp",
                        "/.well-known/oauth-protected-resource/**",
                        "/internal/mcp/**",
                        "/connect",
                        "/connect/continue",
                        "/oauth2/consent")
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/oauth2/consent")
                        .authenticated()
                        .anyRequest()
                        .permitAll())
                .csrf(csrf -> csrf.spa().ignoringRequestMatchers("/mcp", "/.well-known/**", "/internal/mcp/**"))
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                .exceptionHandling(handling ->
                        handling.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                // The pages run no script and load nothing but their own
                // icon; nothing here is framed.
                .headers(headers -> headers.frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; img-src 'self'; "
                                + "style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")));
        return headersFirst(http.build());
    }

    /** The security headers written as the request comes in, as
     *  SecurityConfig has them and for its reason: /mcp's answer is piped
     *  on a thread of its own (StreamingProxy), and two threads must not
     *  write headers at once. */
    public static SecurityFilterChain headersFirst(SecurityFilterChain chain) {
        for (Filter filter : chain.getFilters()) {
            if (filter instanceof HeaderWriterFilter writer) {
                writer.setShouldWriteHeadersEagerly(true);
            }
        }
        return chain;
    }
}
