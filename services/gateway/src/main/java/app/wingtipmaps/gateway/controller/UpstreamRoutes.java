package app.wingtipmaps.gateway.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.server.PathContainer;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Every planner endpoint the browser may reach, and what this app must do
 * for each, read from the planner's own OpenAPI document.
 *
 * <p>The planner marks the operations a browser or a phone may call with
 * an {@code x-gateway} extension, set where it declares the route
 * (services/planner/app/gateway.py says what each key means): who may
 * call it, and whether its Cache-Control, a few response headers, the
 * Range asked or the signed-in pilot are passed on, and the largest body
 * it takes. An operation without it is internal -- what this app asks the
 * planner on its own behalf, the planner's own API docs -- and a 404
 * here, the planner never asked. That was a hand-written list in
 * PlannerProxyController and another in SecurityConfig, and most changes
 * to the planner's routes had to change both.
 *
 * <p>The document is the committed services/planner/openapi.json, copied
 * into the jar as it is built (pom.xml's upstream-routes execution; the
 * Dockerfile copies it beside the pom). Read from the jar rather than fetched from the planner at
 * start: the gateway starts and refuses or admits the same way whether or
 * not the planner is up yet (compose starts them together, and on AWS the
 * planner can be minutes behind on a cold chart cache), and a jar is
 * tested with the very routes it serves. The planner's own tests keep its
 * document equal to its code (tests/test_openapi.py), so a route added
 * there is reachable here once both are built from the same commit.
 */
public final class UpstreamRoutes {

    /** Who may call a route. */
    public enum Access {
        /** Anyone: planning a route needs no account. */
        PUBLIC,
        /** A session, where this deployment offers one (SecurityConfig). */
        SIGNED_IN,
        /** The developer role: work on the model or the stack, not a flight. */
        DEVELOPER
    }

    /** One operation a browser may call, as the planner declared it. */
    public record Route(
            String method,
            PathPattern pattern,
            Access access,
            Integer bodyLimit,
            boolean csrf,
            boolean cache,
            boolean range,
            List<String> headers,
            boolean pilot) {

        boolean matches(String method, PathContainer path) {
            return this.method.equals(method) && pattern.matches(path);
        }
    }

    /** Where the build puts the planner's document in the jar. */
    static final String DOCUMENT = "upstreams/planner/openapi.json";

    /** The keys x-gateway may have: one this does not know is a typo, and
     *  refused at start rather than read as off. */
    private static final Set<String> KEYS = Set.of("access", "cache", "headers", "range", "csrf", "pilot", "bodyLimit");

    /** Where the apps reach the planner: /api/planner/course is its
     *  /api/course. */
    static final String PREFIX = "/api/planner";

    private final List<Route> routes;

    private UpstreamRoutes(List<Route> routes) {
        this.routes = routes;
    }

    private static final class Shipped {
        static final UpstreamRoutes ROUTES = fromClasspath();
    }

    /** The routes of the documents built into this jar. */
    public static UpstreamRoutes shipped() {
        return Shipped.ROUTES;
    }

    private static UpstreamRoutes fromClasspath() {
        try (InputStream in = UpstreamRoutes.class.getClassLoader().getResourceAsStream(DOCUMENT)) {
            if (in == null) {
                throw new IllegalStateException(DOCUMENT
                        + " is not in the jar: pom.xml copies it from services/planner/openapi.json as it builds");
            }
            return of(new ObjectMapper().readTree(in));
        } catch (IOException e) {
            throw new UncheckedIOException(DOCUMENT, e);
        }
    }

    /** The routes the document marks, the most specific pattern first (a
     *  tile's {y}@2x.png before {y}.png, though both say the same). */
    static UpstreamRoutes of(JsonNode document) {
        List<Route> routes = new ArrayList<>();
        for (Map.Entry<String, JsonNode> path : document.path("paths").properties()) {
            for (Map.Entry<String, JsonNode> operation : path.getValue().properties()) {
                JsonNode spec = operation.getValue().get("x-gateway");
                if (spec != null) {
                    routes.add(route(operation.getKey().toUpperCase(Locale.ROOT), path.getKey(), spec));
                }
            }
        }
        routes.sort(Comparator.comparing(Route::pattern, PathPattern.SPECIFICITY_COMPARATOR));
        return new UpstreamRoutes(List.copyOf(routes));
    }

    private static Route route(String method, String path, JsonNode spec) {
        String where = method + " " + path;
        if (!path.startsWith("/api/")) {
            throw new IllegalStateException(where + ": only /api/ routes are reached through " + PREFIX);
        }
        for (String name : spec.propertyNames()) {
            if (!KEYS.contains(name)) {
                throw new IllegalStateException(where + ": x-gateway has no key '" + name + "' (one of " + KEYS + ")");
            }
        }
        Access access = switch (spec.path("access").asString()) {
            case "public" -> Access.PUBLIC;
            case "signed-in" -> Access.SIGNED_IN;
            case "developer" -> Access.DEVELOPER;
            default ->
                throw new IllegalStateException(where + ": x-gateway's access is public, signed-in or developer");
        };
        List<String> headers = new ArrayList<>();
        spec.path("headers").forEach(header -> headers.add(header.asString()));
        return new Route(
                method,
                PathPatternParser.defaultInstance.parse(path),
                access,
                spec.hasNonNull("bodyLimit") ? spec.get("bodyLimit").asInt() : null,
                spec.path("csrf").asBoolean(true),
                spec.path("cache").asBoolean(false),
                spec.path("range").asBoolean(false),
                List.copyOf(headers),
                spec.path("pilot").asBoolean(false));
    }

    /** Every route, the most specific first. */
    public List<Route> all() {
        return routes;
    }

    /** The route a method and an upstream path ({@code /api/course}) are,
     *  if the path is plain ({@link #isPlain}) and a route matches it. */
    public Optional<Route> find(String method, String upstreamPath) {
        if (!isPlain(upstreamPath)) {
            return Optional.empty();
        }
        PathContainer path = PathContainer.parsePath(upstreamPath);
        return routes.stream().filter(route -> route.matches(method, path)).findFirst();
    }

    /**
     * Matches a request to {@code /api/planner/...} whose route has this
     * access. A HEAD is answered by the GET's handler (Spring MVC), so it
     * reaches the planner as that GET: for the developer's routes it is
     * matched as the GET is, and refused as the GET is. It is not made
     * public with a public GET, which it never was (SecurityConfig's
     * ForeFlight rule is the one HEAD anyone may send).
     */
    public RequestMatcher matcher(Access access) {
        return request -> {
            String method = request.getMethod();
            if (access == Access.DEVELOPER && "HEAD".equals(method)) {
                method = "GET";
            }
            String upstreamPath = upstreamPath(request);
            return upstreamPath != null
                    && find(method, upstreamPath)
                            .filter(route -> route.access() == access)
                            .isPresent();
        };
    }

    /** Matches a request whose route takes no CSRF token: a POST that
     *  changes nothing, asked by the native app, which holds no cookie. */
    public RequestMatcher csrfExempt() {
        return request -> {
            String upstreamPath = upstreamPath(request);
            return upstreamPath != null
                    && find(request.getMethod(), upstreamPath)
                            .filter(route -> !route.csrf())
                            .isPresent();
        };
    }

    /** {@code /api/planner/course} upstream is {@code /api/course}; null
     *  for any address not under {@link #PREFIX}. The raw URI, as the
     *  proxy forwards it, so security and the proxy see the same path. */
    static String upstreamPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null || !(uri.equals(PREFIX) || uri.startsWith(PREFIX + "/"))) {
            return null;
        }
        return "/api" + uri.substring(PREFIX.length());
    }

    /** Whether the raw path means at the planner what it matched here: one
     *  absolute path, no scheme-relative "//" to name another host, no
     *  backslash, no "." or ".." segment, and no encoded slash, backslash
     *  or dot, which the route table here sees as one segment and the
     *  planner (Starlette decodes the path) as more. The host is the
     *  configured planner's whatever the path (CodeQL's java/ssrf, the
     *  path being the browser's): this keeps the path to the routes. */
    static boolean isPlain(String upstreamPath) {
        if (!upstreamPath.startsWith("/api/") && !upstreamPath.equals("/api")) {
            return false;
        }
        String lower = upstreamPath.toLowerCase(Locale.ROOT);
        if (lower.contains("//")
                || lower.contains("\\")
                || lower.contains("%2f")
                || lower.contains("%5c")
                || lower.contains("%2e")) {
            return false;
        }
        for (String segment : upstreamPath.split("/", -1)) {
            if (segment.equals(".") || segment.equals("..")) {
                return false;
            }
        }
        return true;
    }
}
