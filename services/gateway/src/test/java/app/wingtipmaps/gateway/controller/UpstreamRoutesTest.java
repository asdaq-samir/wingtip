package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.wingtipmaps.gateway.controller.UpstreamRoutes.Route;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/**
 * The routes the planner's OpenAPI document marks (x-gateway) are the ones
 * the gateway's hand-written list forwarded to it, each with the same
 * access, body limit, CSRF rule, pilot, Range and passed headers -- held
 * against the old list's recorded behaviour (RoutesBefore), so moving the
 * knowledge to the planner lost and opened nothing. The routes the list
 * sent to the assistant went with it (RoutesBefore.takenOut). UpstreamSecurityRulesTest
 * drives the same routes through SecurityConfig.
 */
class UpstreamRoutesTest {

    private final List<Route> routes = UpstreamRoutes.shipped().all();
    private final List<RoutesBefore> before = RoutesBefore.all();

    /**
     * Where the old list let more through than the planner answers: a
     * variable segment where its own route has a suffix. Each was a 404
     * from the planner; now it is a 404 here, the planner never asked.
     */
    static final Map<String, String> NARROWED = Map.of(
            "GET /api/overlay-tiles/{file}", "the planner answers /api/overlay-tiles/{name}.pmtiles alone",
            "GET /api/cycle-pack/{cycle}/{file}", "the planner answers /api/cycle-pack/{cycle}/{region}.pack alone");

    /**
     * Routes added since the hand list was replaced, each with its rules:
     * no old entry to hold it to, so held to what its decorator says.
     */
    static final Map<String, String> ADDED = Map.ofEntries(
            Map.entry("POST /api/departure-window", "signed-in csrf"),
            // The emergency assistant's fields: public, no sign-in in an emergency.
            Map.entry("GET /api/emergency/fields", "public csrf"),
            // The in-flight copilot's reads round the airplane, public as /api/live/* is.
            Map.entry("GET /api/copilot/around", "public csrf"),
            // The 3D map's terrain tiles and the obstacles standing in a box.
            Map.entry("GET /api/terrain-tile/{z}/{x}/{y}.png", "public csrf"),
            Map.entry("GET /api/terrain/obstacles", "public csrf"),
            // A logbook entry drawn from the app's own track: the pilot's,
            // and it changes nothing (the phones hold no CSRF cookie).
            Map.entry("POST /api/logbook-draft", "signed-in no-csrf"),
            // The charts kept on the device for flying offline: the box, the
            // regions of a cycle and their archives, public as the tiles are.
            Map.entry("GET /api/offline-box", "public csrf"),
            Map.entry("GET /api/offline-charts", "public csrf"),
            Map.entry("GET /api/offline-charts/{cycle}/{region}", "public csrf"),
            Map.entry("GET /api/offline-charts/{cycle}/{region}/{archive}.pmtiles", "public csrf"),
            // The flight's NOTAMs ranked by the engine, and their line each.
            Map.entry("POST /api/notams/ranked", "public no-csrf"),
            // One field's own NOTAMs and the TFRs near it, for its card.
            Map.entry("GET /api/airport/{ident}/notams", "public csrf"),
            // A route's checkpoint notes as the pilot sees them, their own
            // over the shared ones: theirs, and it changes nothing (the
            // phones hold no CSRF cookie).
            Map.entry("POST /api/checkpoint-notes/route", "signed-in no-csrf"),
            // The pilot's proficiency plan.
            Map.entry("POST /api/pilot/coach", "signed-in no-csrf"),
            // The radar and satellite loop's frames, public as the map's
            // other weather is.
            Map.entry("GET /api/weather/loop", "public csrf"),
            // The dry run played against the forecast: public, and a POST
            // with no CSRF cookie, as the clearance's places are.
            Map.entry("POST /api/forecast/run", "public no-csrf"),
            // The 3D map's airspace volumes and the model weather's flow
            // layer, public as the map's other layers are.
            Map.entry("GET /api/airspace/volumes", "public csrf"),
            Map.entry("GET /api/weather/flow", "public csrf"),
            Map.entry("GET /api/weather/flow/{frame}/{field}.png", "public csrf"),
            // An approach plate's page as a picture, public as the plates are.
            Map.entry("GET /api/approach-plate-page/{cycle}/{ident}/{procedure}.png", "public csrf"),
            // The Studio's tracks, history and drafts: the developer's for
            // now (the owner, 2026-11-12: "You only for now").
            Map.entry("GET /api/studio/track", "developer csrf"),
            Map.entry("GET /api/studio/watched", "developer csrf"),
            Map.entry("POST /api/studio/ground", "developer csrf"),
            Map.entry("POST /api/studio/weather", "developer csrf"),
            Map.entry("GET /api/studio/notams", "developer csrf"),
            Map.entry("GET /api/studio/ntsb", "developer csrf"),
            Map.entry("GET /api/studio/drafts", "developer csrf"),
            Map.entry("GET /api/studio/drafts/{draft_id}", "developer csrf"),
            Map.entry("GET /api/studio/drafts/{draft_id}/track", "developer csrf"),
            Map.entry("POST /api/studio/drafts/{draft_id}/identity", "developer csrf"),
            Map.entry("POST /api/studio/drafts/{draft_id}/rendered", "developer csrf"),
            Map.entry("POST /api/studio/drafts/{draft_id}/dismiss", "developer csrf"));

    /** Routes whose passed headers changed on purpose since the hand list
     *  was recorded: what each passes now. */
    static final Map<String, Set<String>> HEADERS_SINCE = Map.of(
            // The TFR list is the same for every pilot: kept a minute, with
            // its ETag for a 304 rather than the whole list again (the
            // planner's /api/tfrs, 2026-11-12).
            "GET /api/tfrs", Set.of("Cache-Control", "ETag"));

    @Test
    void theEmergencyFieldsArePublicFromThePlanner() {
        var route =
                UpstreamRoutes.shipped().find("GET", "/api/emergency/fields").orElseThrow();
        assertThat(route.access()).isEqualTo(UpstreamRoutes.Access.PUBLIC);
        assertThat(route.cache()).isFalse();
    }

    @Test
    void everyRouteTheDocumentsMarkIsOneTheHandListForwardedWithTheSameRules() {
        // The 79 the hand list sent to the planner, and those added since.
        assertThat(routes).hasSize(79 + ADDED.size());
        List<String> differences = new ArrayList<>();
        for (Route route : routes) {
            String sample = RoutesBefore.sample(route.pattern().getPatternString());
            RoutesBefore old = before.stream()
                    .filter(b -> b.matches(route.method(), sample))
                    .findFirst()
                    .orElse(null);
            String name = route.method() + " " + route.pattern().getPatternString();
            if (ADDED.containsKey(name)) {
                assertThat(old)
                        .as(name + " is listed as added, but the hand list had it")
                        .isNull();
                String rules = route.access().name().toLowerCase(Locale.ROOT).replace('_', '-') + " "
                        + (route.csrf() ? "csrf" : "no-csrf");
                compare(differences, name, "rules", ADDED.get(name), rules);
                continue;
            }
            if (old == null || !"planner".equals(old.upstream())) {
                differences.add(name + ": not forwarded to the planner before");
                continue;
            }
            Set<String> passed = new HashSet<>(route.headers());
            if (route.cache()) {
                passed.add("Cache-Control");
            }
            compare(
                    differences,
                    name,
                    "access",
                    old.access(),
                    route.access().name().toLowerCase(Locale.ROOT).replace('_', '-'));
            compare(differences, name, "paid", old.paid(), "-");
            compare(
                    differences,
                    name,
                    "bodyLimit",
                    old.bodyLimit(),
                    route.bodyLimit() == null ? "-" : route.bodyLimit().toString());
            compare(
                    differences,
                    name,
                    "csrf",
                    old.csrf(),
                    "GET".equals(route.method()) ? "-" : route.csrf() ? "checked" : "exempt");
            compare(differences, name, "pilot", old.pilot(), route.pilot());
            compare(differences, name, "range", old.range(), route.range());
            compare(
                    differences,
                    name,
                    "headers",
                    HEADERS_SINCE.getOrDefault(name, new HashSet<>(old.passedHeaders())),
                    passed);
        }
        assertThat(differences).isEmpty();
    }

    @Test
    void everyRouteTheHandListForwardedIsStillForwardedButThoseNoUpstreamAnsweredAndTheAssistants() {
        List<String> lost = new ArrayList<>();
        for (RoutesBefore old : before) {
            String name = old.method() + " " + old.pattern();
            boolean found =
                    UpstreamRoutes.shipped().find(old.method(), old.sample()).isPresent();
            boolean gone = NARROWED.containsKey(name) || old.takenOut();
            if (found == gone) {
                lost.add(name
                        + (found ? ": listed as narrowed or taken out, but still forwarded" : ": no longer forwarded"));
            }
        }
        assertThat(lost).isEmpty();
        assertThat(before).hasSize(84);
        assertThat(before).filteredOn(RoutesBefore::takenOut).hasSize(6);
        // What the narrowed routes are asked for, still forwarded.
        for (String[] ask : new String[][] {
            {"GET", "/api/overlay-tiles/2026-10-29-v1-0badf00d.pmtiles"},
            {"GET", "/api/cycle-pack/2026-10-29/n40w092.pack"}
        }) {
            assertThat(UpstreamRoutes.shipped().find(ask[0], ask[1]))
                    .as(ask[0] + " " + ask[1])
                    .isPresent();
        }
    }

    @Test
    void whatEachServiceKeepsToItselfIsNotForwarded() {
        // What only the stack asks the planner for (the planner's own
        // lines for the flight watch's changes, the MCP connector's
        // whole plan), the gateway's own currency figures, and the
        // planner's root and docs.
        for (String[] ask : new String[][] {
            {"POST", "/api/words/weather/sources"},
            {"DELETE", "/api/checkpoint-notes/mine"},
            {"GET", "/api/route-check"},
            {"GET", "/api/plan"},
            {"POST", "/api/pilot/currency"},
            {"POST", "/api/aircraft/inspections"},
            {"GET", "/"},
            {"GET", "/openapi.json"},
            {"GET", "/docs"}
        }) {
            assertThat(UpstreamRoutes.shipped().find(ask[0], ask[1]))
                    .as(ask[0] + " " + ask[1])
                    .isEmpty();
        }
    }

    @Test
    void aMarkThisDoesNotKnowStopsTheGatewayFromStarting() throws Exception {
        assertThatThrownBy(() -> read("{\"access\": \"public\", \"cahce\": true}"))
                .hasMessageContaining("no key 'cahce'");
        assertThatThrownBy(() -> read("{\"access\": \"everyone\"}"))
                .hasMessageContaining("public, signed-in or developer");
        // The paid features Claude wrote went with it (docs/decisions/0041).
        assertThatThrownBy(() -> read("{\"access\": \"signed-in\", \"paid\": \"WORDS\"}"))
                .hasMessageContaining("no key 'paid'");
    }

    @Test
    void anUnmarkedOperationIsNotARoute() throws Exception {
        var document = new ObjectMapper()
                .readTree(
                        "{\"paths\": {\"/api/a\": {\"get\": {}, \"post\": {\"x-gateway\": {\"access\": \"developer\", \"bodyLimit\": 10}}}}}");
        List<Route> found = UpstreamRoutes.of(document).all();
        assertThat(found).singleElement().satisfies(route -> {
            assertThat(route.method()).isEqualTo("POST");
            assertThat(route.access()).isEqualTo(UpstreamRoutes.Access.DEVELOPER);
            assertThat(route.bodyLimit()).isEqualTo(10);
            assertThat(route.csrf()).isTrue();
        });
    }

    private static UpstreamRoutes read(String spec) throws Exception {
        return UpstreamRoutes.of(
                new ObjectMapper().readTree("{\"paths\": {\"/api/a\": {\"get\": {\"x-gateway\": " + spec + "}}}}"));
    }

    private static void compare(List<String> differences, String name, String what, Object before, Object now) {
        if (!before.equals(now)) {
            differences.add(name + ": " + what + " was " + before + ", is " + now);
        }
    }
}
