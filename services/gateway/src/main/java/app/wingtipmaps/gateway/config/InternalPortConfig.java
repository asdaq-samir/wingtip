package app.wingtipmaps.gateway.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import org.apache.catalina.connector.Connector;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

/**
 * A port of its own for the routes only the other services call
 * (/internal/**: the connector's records, InternalRecordsController), and
 * those routes on that port alone.
 *
 * <p>The public port is what Caddy, CloudFront and, in the phone mode, the
 * whole Wi-Fi reach; a shared secret was all that kept a stranger there
 * from reading any pilot's records by counting up their id (the security
 * audit's M2, 2026-11-10). This port is published nowhere -- not by
 * docker-compose.yml, not by the production compose, where only Caddy
 * publishes ports -- so only a container on the compose network (the
 * planner) reaches it, and the secret is a second lock rather than the
 * only one. Caddy refuses /internal/* as well (infra/server/Caddyfile).
 *
 * <p>{@code app.internal.port} ({@code APP_INTERNAL_PORT}, 8081); 0 opens
 * no such port, and then /internal/** answers nobody.
 */
@Configuration
public class InternalPortConfig {

    static final String PREFIX = "/internal/";

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> internalConnector(AppProperties app) {
        int port = app.internal().port();
        return factory -> {
            if (port <= 0) {
                return;
            }
            Connector connector = new Connector("org.apache.coyote.http11.Http11NioProtocol");
            connector.setPort(port);
            factory.addAdditionalConnectors(connector);
        };
    }

    /** Ahead of everything else, Spring Security included: a request is
     *  answered 404 before any of the app's rules read it. */
    @Bean
    OnlyOnItsPort internalOnlyOnItsPort(AppProperties app) {
        int port = app.internal().port();
        return new OnlyOnItsPort(port);
    }

    /**
     * /internal/** on the internal port, and nothing else there: a 404 for
     * /internal/** reached on any other port, and for any other path on
     * this one, so the port opens no second way into the app either.
     */
    static final class OnlyOnItsPort extends OncePerRequestFilter implements Ordered {

        private final int port;

        OnlyOnItsPort(int port) {
            this.port = port;
        }

        @Override
        public int getOrder() {
            return Ordered.HIGHEST_PRECEDENCE;
        }

        /** Whether a request may go on: an internal path exactly when it came in on the internal port. */
        boolean allows(HttpServletRequest request) {
            // The path as Spring MVC matches it, decoded: "/%69nternal/mcp"
            // is mapped to the same controller as "/internal/mcp".
            String path = UrlPathHelper.defaultInstance
                    .getPathWithinApplication(request)
                    .toLowerCase(Locale.ROOT);
            boolean internalPath = path.startsWith(PREFIX) || path.equals("/internal");
            boolean internalPort = port > 0 && request.getLocalPort() == port;
            return internalPath == internalPort;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            if (allows(request)) {
                chain.doFilter(request, response);
            } else {
                response.sendError(HttpServletResponse.SC_NOT_FOUND);
            }
        }
    }
}
