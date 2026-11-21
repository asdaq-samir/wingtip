package app.wingtipmaps.gateway.security;

import app.wingtipmaps.gateway.controller.UpstreamRoutes;
import app.wingtipmaps.gateway.security.mcp.ConnectorSecurityConfig;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * The map's tiles, on a chain of their own ahead of the app's
 * (SecurityConfig): a chart, terrain or overlay tile is a public GET,
 * the same for every pilot, that changes nothing and is drawn by the map
 * rather than read as a page. The app's chain wrote a fresh XSRF-TOKEN
 * cookie, a 600-byte Content-Security-Policy and the other page headers on
 * each one, about 1.2 KB of headers a tile over HTTP/1.1 (no header
 * compression), some 50 KB a screenful; and the cookie also kept a CDN
 * from storing the answer (the tiles audit, 2026-11-21). A tile carries
 * no script to police and no form to forge, so only nosniff stays.
 *
 * <p>Who may ask is unchanged: only a GET of a route the planner's
 * document marks public (UpstreamRoutes), so a HEAD or an unknown
 * address under the same prefix still goes to the app's chain and its
 * rules.
 */
@Configuration
public class TileSecurityConfig {

    /** The tile routes' addresses through the gateway (the planner's
     *  /api/chart-tile, /api/terrain-tile and /api/overlay-tiles). */
    static final List<String> TILE_PREFIXES = List.of(
            "/api/planner/chart-tile/", "/api/planner/terrain-tile/", "/api/planner/overlay-tiles");

    static RequestMatcher tiles(UpstreamRoutes upstream) {
        RequestMatcher open = upstream.matcher(UpstreamRoutes.Access.PUBLIC);
        return request -> "GET".equals(request.getMethod())
                && TILE_PREFIXES.stream().anyMatch(request.getRequestURI()::startsWith)
                && open.matches(request);
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 3)
    SecurityFilterChain tileChain(HttpSecurity http) throws Exception {
        http.securityMatcher(tiles(UpstreamRoutes.shipped()))
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable())
                // No session is made or saved for a tile.
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                // The defaults off (no CSP, frame options, no-store or
                // HSTS on an image), nosniff kept: a few bytes, and a tile
                // is never sniffed into a script. The proxy writes the
                // planner's own Cache-Control (PlannerProxyController).
                .headers(headers -> headers.defaultsDisabled().contentTypeOptions(Customizer.withDefaults()));
        // Written as the request comes in: the tile is piped on a thread
        // of its own (StreamingProxy), as SecurityConfig says.
        return ConnectorSecurityConfig.headersFirst(http.build());
    }
}
