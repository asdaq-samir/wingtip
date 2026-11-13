package app.wingtipmaps.gateway.security;

import app.wingtipmaps.gateway.security.mcp.ConnectorSecurityConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.savedrequest.NullRequestCache;

/**
 * Who may reach the pages that delete an account without the app
 * (DeleteAccountController): anyone, since they are for a pilot who is not
 * signed in; the email link is the credential. Its own chain, ahead of
 * the app's (SecurityConfig), as the connector's pages have
 * (ConnectorSecurityConfig). The forms carry the cookie-held CSRF token the
 * app's other forms do. The confirm page's address holds the link's
 * token, so no Referer is sent from it; the pages run no script, load
 * nothing but their icon and are never framed.
 */
@Configuration
public class DeleteAccountSecurityConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 2)
    SecurityFilterChain deleteAccountChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/delete-account", "/delete-account/confirm")
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .csrf(csrf -> csrf.spa())
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                .headers(headers -> headers.frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; img-src 'self'; "
                                + "style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; "
                                + "frame-ancestors 'none'")));
        // Written as the request comes in, as SecurityConfig has them (CacheHeadersTest).
        return ConnectorSecurityConfig.headersFirst(http.build());
    }
}
