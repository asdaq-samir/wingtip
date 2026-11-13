package app.wingtipmaps.gateway.controller;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.server.PathContainer;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/**
 * The routes the gateway forwarded from its hand-written lists, as
 * src/test/resources/planner-routes-before.tsv recorded them: the old
 * PlannerProxyController's ROUTES and SecurityConfig's matchers, driven
 * route by route (its header says how) before both were replaced by the
 * services' x-gateway marks. What the documents produce is held to it.
 */
public record RoutesBefore(
        String method,
        String pattern,
        String upstream,
        String access,
        String paid,
        String bodyLimit,
        String csrf,
        boolean pilot,
        boolean range,
        List<String> passedHeaders,
        String headAccess) {

    /** Whether the old list sent it to the assistant service: every one a
     *  Claude call, taken out with it (docs/decisions/0041), and a 404 now. */
    public boolean takenOut() {
        return "assistant".equals(upstream);
    }

    /** The route's sample path: each {variable} as "X". */
    public String sample() {
        return sample(pattern);
    }

    public static String sample(String pattern) {
        return pattern.replaceAll("\\{[^}]+\\}", "X");
    }

    public boolean matches(String method, String upstreamPath) {
        PathPattern parsed = PathPatternParser.defaultInstance.parse(pattern);
        return this.method.equals(method) && parsed.matches(PathContainer.parsePath(upstreamPath));
    }

    public static List<RoutesBefore> all() {
        try (InputStream in = RoutesBefore.class.getClassLoader().getResourceAsStream("planner-routes-before.tsv")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8)
                    .lines()
                    .filter(line -> !line.startsWith("#") && !line.isBlank())
                    .map(line -> line.split("\t", -1))
                    .map(f -> new RoutesBefore(
                            f[0],
                            f[1],
                            f[2],
                            f[3],
                            f[4],
                            f[5],
                            f[6],
                            Boolean.parseBoolean(f[7]),
                            Boolean.parseBoolean(f[8]),
                            "-".equals(f[9]) ? List.of() : List.of(f[9].split(",")),
                            f[10]))
                    .toList();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
