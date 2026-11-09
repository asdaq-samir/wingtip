package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.wingtipmaps.gateway.controller.UpstreamRoutes.Route;
import app.wingtipmaps.gateway.controller.UpstreamRoutes.Upstream;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The routes the planner's and the assistant's OpenAPI documents mark
 * (x-gateway) are the ones the gateway's hand-written list forwarded, each
 * with the same upstream, access, paid feature, body limit, CSRF rule,
 * pilot, Range and passed headers -- held against the old list's recorded
 * behaviour (RoutesBefore), so moving the knowledge to the services lost
 * and opened nothing. UpstreamSecurityRulesTest drives the same routes
 * through SecurityConfig.
 */
class UpstreamRoutesTest {

    private final List<Route> routes = UpstreamRoutes.shipped().all();
    private final List<RoutesBefore> before = RoutesBefore.all();

    /**
     * Where the old list let more through than either service answers: a
     * variable segment where the service's own route has a suffix, or a
     * kind the assistant has no route for. Each was a 404 from the
     * upstream; now it is a 404 here, the upstream never asked.
     */
    static final Map<String, String> NARROWED = Map.of(
            "GET /api/overlay-tiles/{file}", "the planner answers /api/overlay-tiles/{name}.pmtiles alone",
            "GET /api/cycle-pack/{cycle}/{file}", "the planner answers /api/cycle-pack/{cycle}/{region}.pack alone",
            "POST /api/words/{kind}", "the assistant answers notams, weather, risk, debrief and changes alone");

    @Test
    void everyRouteTheDocumentsMarkIsOneTheHandListForwardedWithTheSameRules() {
        assertThat(routes).hasSize(89);
        List<String> differences = new ArrayList<>();
        for (Route route : routes) {
            String sample = RoutesBefore.sample(route.pattern().getPatternString());
            RoutesBefore old = before.stream().filter(b -> b.matches(route.method(), sample)).findFirst().orElse(null);
            String name = route.method() + " " + route.pattern().getPatternString();
            if (old == null) {
                differences.add(name + ": not forwarded before");
                continue;
            }
            Set<String> passed = new HashSet<>(route.headers());
            if (route.cache()) {
                passed.add("Cache-Control");
            }
            compare(differences, name, "upstream", old.upstream(), route.upstream().name().toLowerCase(Locale.ROOT));
            compare(differences, name, "access", old.access(), route.access().name().toLowerCase(Locale.ROOT).replace('_', '-'));
            compare(differences, name, "paid", old.paid(), route.paid() == null ? "-" : route.paid().name());
            compare(differences, name, "bodyLimit", old.bodyLimit(), route.bodyLimit() == null ? "-" : route.bodyLimit().toString());
            compare(differences, name, "csrf", old.csrf(), "GET".equals(route.method()) ? "-" : route.csrf() ? "checked" : "exempt");
            compare(differences, name, "pilot", old.pilot(), route.pilot());
            compare(differences, name, "range", old.range(), route.range());
            compare(differences, name, "headers", new HashSet<>(old.passedHeaders()), passed);
        }
        assertThat(differences).isEmpty();
    }

    @Test
    void everyRouteTheHandListForwardedIsStillForwardedButThoseNoUpstreamAnswered() {
        List<String> lost = new ArrayList<>();
        for (RoutesBefore old : before) {
            String name = old.method() + " " + old.pattern();
            boolean found = UpstreamRoutes.shipped().find(old.method(), old.sample()).isPresent();
            if (found == NARROWED.containsKey(name)) {
                lost.add(name + (found ? ": listed as narrowed, but still forwarded" : ": no longer forwarded"));
            }
        }
        assertThat(lost).isEmpty();
        assertThat(before).hasSize(84);
        // What the narrowed routes are asked for, still forwarded.
        for (String[] ask : new String[][] {{"GET", "/api/overlay-tiles/2026-10-29-v1-0badf00d.pmtiles"},
                {"GET", "/api/cycle-pack/2026-10-29/n40w092.pack"}, {"POST", "/api/words/notams"}, {"POST", "/api/words/weather"},
                {"POST", "/api/words/risk"}, {"POST", "/api/words/debrief"}, {"POST", "/api/words/changes"}}) {
            assertThat(UpstreamRoutes.shipped().find(ask[0], ask[1])).as(ask[0] + " " + ask[1]).isPresent();
        }
    }

    @Test
    void whatEachServiceKeepsToItselfIsNotForwarded() {
        // What the assistant asks the planner for, the gateway's own
        // currency figures, and the planner's root and docs.
        for (String[] ask : new String[][] {{"POST", "/api/words/weather/sources"}, {"POST", "/api/checkpoint-notes/pending"},
                {"POST", "/api/checkpoint-notes/seed"}, {"DELETE", "/api/checkpoint-notes/mine"}, {"GET", "/api/route-check"},
                {"GET", "/api/plan"}, {"POST", "/api/pilot/currency"}, {"POST", "/api/aircraft/inspections"}, {"GET", "/"},
                {"GET", "/openapi.json"}, {"GET", "/docs"}}) {
            assertThat(UpstreamRoutes.shipped().find(ask[0], ask[1])).as(ask[0] + " " + ask[1]).isEmpty();
        }
    }

    @Test
    void aMarkThisDoesNotKnowStopsTheGatewayFromStarting() throws Exception {
        assertThatThrownBy(() -> read("{\"access\": \"public\", \"cahce\": true}"))
                .hasMessageContaining("no key 'cahce'");
        assertThatThrownBy(() -> read("{\"access\": \"everyone\"}"))
                .hasMessageContaining("public, signed-in or developer");
        assertThatThrownBy(() -> read("{\"access\": \"signed-in\", \"paid\": \"LUNCH\"}"))
                .isInstanceOf(IllegalArgumentException.class);
        var document = new ObjectMapper().readTree(
                "{\"paths\": {\"/api/a\": {\"post\": {\"x-gateway\": {\"access\": \"public\"}}}}}");
        assertThatThrownBy(() -> UpstreamRoutes.of(Map.of(Upstream.PLANNER, document, Upstream.ASSISTANT, document)))
                .hasMessageContaining("declared by both");
    }

    @Test
    void anUnmarkedOperationIsNotARoute() throws Exception {
        var document = new ObjectMapper().readTree(
                "{\"paths\": {\"/api/a\": {\"get\": {}, \"post\": {\"x-gateway\": {\"access\": \"developer\", \"bodyLimit\": 10}}}}}");
        List<Route> found = UpstreamRoutes.of(Map.of(Upstream.PLANNER, document)).all();
        assertThat(found).singleElement().satisfies(route -> {
            assertThat(route.method()).isEqualTo("POST");
            assertThat(route.access()).isEqualTo(UpstreamRoutes.Access.DEVELOPER);
            assertThat(route.bodyLimit()).isEqualTo(10);
            assertThat(route.csrf()).isTrue();
        });
    }

    private static UpstreamRoutes read(String spec) throws Exception {
        return UpstreamRoutes.of(Map.of(Upstream.PLANNER, new ObjectMapper().readTree(
                "{\"paths\": {\"/api/a\": {\"get\": {\"x-gateway\": " + spec + "}}}}")));
    }

    private static void compare(List<String> differences, String name, String what, Object before, Object now) {
        if (!before.equals(now)) {
            differences.add(name + ": " + what + " was " + before + ", is " + now);
        }
    }
}
