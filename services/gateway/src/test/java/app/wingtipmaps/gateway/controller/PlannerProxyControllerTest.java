package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import app.wingtipmaps.gateway.domain.Pilot;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** What the proxy forwards and how: the path rewrite, the body, the
 *  pilot, and the error shape for an upstream that is not answering
 *  (PlannerProxyTestBase's fake planner). What it lets a browser keep is
 *  PlannerProxyCachingTest's. */
class PlannerProxyControllerTest extends PlannerProxyTestBase {

    @Test
    void theProxyPrefixIsStrippedAndTheQueryStringIsCarried() throws Exception {
        MvcResult started = mockMvc.perform(get("/api/planner/course?dep=C81&dest=KDLH"))
                .andExpect(request().asyncStarted())
                .andReturn();
        finish(started);

        // /api/planner/course upstream is /api/course -- the planner
        // knows nothing about the prefix this app reaches it behind.
        assertThat(received).contains("GET /api/course?dep=C81&dest=KDLH");
    }

    @Test
    void theClaudeCallsAreGoneAndAPilotsOwnNoteStillReachesThePlanner() throws Exception {
        // Taken out with the assistant service (docs/decisions/0041).
        for (String path : new String[] {
            "/assistant",
            "/briefing/narrative",
            "/words/weather",
            "/checkpoint-notes/generate",
            "/oral/question",
            "/oral/grade"
        }) {
            assertThat(forwarded("POST", "/api" + path)).as(path).isFalse();
        }
        // A pilot's own note is kept at the planner, which holds the notes.
        finish(mockMvc.perform(post("/api/planner/checkpoint-notes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(request().asyncStarted())
                .andReturn());
        assertThat(received).contains("POST /api/checkpoint-notes");
        assertThat(forwarded("GET", "/api/assistant")).isFalse();
    }

    @Test
    void aPostBodyIsForwardedAsItArrived() throws Exception {
        MvcResult started = mockMvc.perform(post("/api/planner/picks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lat\":42.0,\"lon\":-88.0}"))
                .andExpect(request().asyncStarted())
                .andReturn();
        finish(started);

        assertThat(received).contains("POST /api/picks");
        assertThat(received).contains("body={\"lat\":42.0,\"lon\":-88.0}");
    }

    @Test
    void aDeleteIsForwardedToo() throws Exception {
        MvcResult started = mockMvc.perform(delete("/api/planner/picks?dep=C81&dest=KDLH&lat=45&lon=-90"))
                .andExpect(request().asyncStarted())
                .andReturn();
        finish(started);

        assertThat(received).contains("DELETE /api/picks?dep=C81&dest=KDLH&lat=45&lon=-90");
    }

    /** Only the planner's own browser-facing routes are forwarded. Its
     *  API docs, its root and any route it grows later are a 404 here,
     *  and the planner is never asked. */
    @Test
    void aPathTheBrowserHasNoUseForIsA404AndNeverReachesThePlanner() throws Exception {
        for (String path : new String[] {
            "/api/planner/../openapi.json",
            "/api/planner/docs",
            "/api/planner/openapi.json",
            "/api/planner/internal/anything"
        }) {
            mockMvc.perform(get(path)).andExpect(status().isNotFound());
        }
        mockMvc.perform(post("/api/planner/course")).andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/planner/build")).andExpect(status().isNotFound());
        assertThat(received).isEmpty();
    }

    @Test
    void aPathThatMeansAnotherRouteAtThePlannerIsNotForwarded() {
        // Each matched a route's one segment here and is more at the
        // planner, which decodes the path, or names another host.
        assertThat(forwarded("GET", "/api/airport/..%2F..%2Fdev/photos")).isFalse();
        assertThat(forwarded("GET", "/api/airport/%2e%2e/photos")).isFalse();
        assertThat(forwarded("GET", "/api/airport/a%5Cb/photos")).isFalse();
        assertThat(forwarded("GET", "/api/airport/../photos")).isFalse();
        assertThat(forwarded("GET", "/api//evil.example/photos")).isFalse();
        assertThat(UpstreamRoutes.isPlain("/api/airport/KDLH/photos")).isTrue();
        assertThat(UpstreamRoutes.isPlain("/api/chart-tile/sectional/10/262/380.png"))
                .isTrue();
    }

    @Test
    void theRouteTableCoversWhatTheBrowserCalls() {
        assertThat(forwarded("GET", "/api/chart-tile/sectional/10/262/380.png")).isTrue();
        // The 512-pixel tile for a 2x or 3x screen, by the same route.
        assertThat(forwarded("GET", "/api/chart-tile/sec/10/262/380@2x.png")).isTrue();
        assertThat(forwarded("POST", "/api/dev/services/ml/start")).isTrue();
        assertThat(forwarded("GET", "/api/chart")).isTrue();
        assertThat(forwarded("GET", "/api/airport/KBUR/procedures")).isTrue();
        // The forecast wind a runway is picked into, and an airplane's state
        // for its alerts: the web app asked for both and had a 404.
        assertThat(forwarded("GET", "/api/airport/KABQ/forecast-wind")).isTrue();
        // A stop's services (food, fuel and rest stops, 2026-10-22).
        assertThat(forwarded("GET", "/api/airport/KHYS/services")).isTrue();
        assertThat(forwarded("GET", "/api/route-options")).isTrue();
        assertThat(forwarded("POST", "/api/go-no-go")).isTrue();
        assertThat(forwarded("GET", "/api/go-no-go")).isFalse();
        // The native app's figures (app.figures): two POSTs, two GETs.
        assertThat(forwarded("POST", "/api/debrief")).isTrue();
        assertThat(forwarded("POST", "/api/lost-comms")).isTrue();
        assertThat(forwarded("GET", "/api/diversion")).isTrue();
        assertThat(forwarded("GET", "/api/holding")).isTrue();
        assertThat(forwarded("POST", "/api/holding")).isFalse();
        assertThat(forwarded("GET", "/api/airport/KIOW/photos")).isTrue();
        assertThat(forwarded("GET", "/api/airport-aerial/KIOW.jpg")).isTrue();
        assertThat(forwarded("GET", "/api/airport-photo/KSCD.jpg")).isTrue();
        assertThat(forwarded("GET", "/api/traffic/flight/a1b2c3/status")).isTrue();
        assertThat(forwarded("GET", "/api/airspace/ahead")).isTrue();
        assertThat(forwarded("GET", "/api/weather/map")).isTrue();
        assertThat(forwarded("GET", "/api/alternate")).isTrue();
        assertThat(forwarded("GET", "/api/icing/route")).isTrue();
        assertThat(forwarded("GET", "/api/traffic")).isTrue();
        assertThat(forwarded("GET", "/api/traffic/find")).isTrue();
        assertThat(forwarded("GET", "/api/traffic/based")).isTrue();
        assertThat(forwarded("GET", "/api/traffic/flight/a0b7d8")).isTrue();
        // An airplane's past flights, and one of them (PastFlights): a 404
        // here, never asked of the planner, until they were listed.
        assertThat(forwarded("GET", "/api/traffic/flight/a89c1e/history")).isTrue();
        assertThat(forwarded("GET", "/api/traffic/flight/a89c1e/history/1791723840"))
                .isTrue();
        assertThat(forwarded("GET", "/api/traffic/route")).isTrue();
        assertThat(forwarded("GET", "/api/map/google")).isTrue();
        assertThat(forwarded("GET", "/api/airport/KBUR/procedures/I08-Y")).isTrue();
        assertThat(forwarded("GET", "/api/airport/KBUR/procedures/I08-Y/legs")).isFalse();
        assertThat(forwarded("GET", "/api/foreflight-pack/C81-KDLH/C81-KDLH-checkpoints.zip"))
                .isTrue();
        assertThat(forwarded("GET", "/api/foreflight-pack")).isFalse();
        assertThat(forwarded("POST", "/api/clearance/places")).isTrue();
        assertThat(forwarded("GET", "/api/clearance/words")).isTrue();
        // Gone with collecting a route: the checkpoints come off the chart.
        assertThat(forwarded("POST", "/api/build")).isFalse();
        assertThat(forwarded("GET", "/api/routes")).isFalse();
        // A route's notes as the pilot sees them.
        assertThat(forwarded("POST", "/api/checkpoint-notes/route")).isTrue();
        // What only the stack asks the planner for, and nobody else.
        assertThat(forwarded("POST", "/api/words/changes/sources")).isFalse();
        assertThat(forwarded("GET", "/api/checkpoint-notes/mine")).isFalse();
        assertThat(forwarded("POST", "/api/engine/wind_triangle")).isFalse();
        assertThat(forwarded("GET", "/api/airport/KDLH")).isTrue();
        assertThat(forwarded("GET", "/api/airports/in-view")).isTrue();
        assertThat(forwarded("GET", "/api/waypoints/in-view")).isTrue();
        assertThat(forwarded("GET", "/api/local-flight")).isTrue();
        assertThat(forwarded("GET", "/api/tfrs")).isTrue();
        assertThat(forwarded("GET", "/api/route-profile")).isTrue();
        assertThat(forwarded("GET", "/api/airports/nearest")).isTrue();
        assertThat(forwarded("GET", "/api/places/search")).isTrue();
        assertThat(forwarded("GET", "/api/airport/KDLH/extra")).isFalse();
        assertThat(forwarded("GET", "/api/airport-diagram/2610/KDLH.png")).isTrue();
        assertThat(forwarded("GET", "/api/airport-diagram/2610/runways/KDLH.png"))
                .isTrue();
        assertThat(forwarded("GET", "/api/airport-diagram/2610/KDLH.pdf")).isFalse();
        assertThat(forwarded("GET", "/api/airport/KDLH/procedures/R03/plate")).isTrue();
        assertThat(forwarded("GET", "/api/approach-plate/2610/KDLH/R03.png")).isTrue();
        assertThat(forwarded("GET", "/api/approach-plate/2610/KDLH/R03.pdf")).isFalse();
        assertThat(forwarded("GET", "/api/faa-chart")).isTrue();
        assertThat(forwarded("GET", "/api/faa-chart/page/dtpp/2610/EC3TO.PDF/33.png"))
                .isTrue();
        assertThat(forwarded("GET", "/api/faa-chart/page/dtpp/2610/EC3TO.PDF")).isFalse();
        assertThat(forwarded("GET", "/api/chart-tile/sectional/10/262/380.jpg")).isFalse();
        assertThat(forwarded("POST", "/api/dev/services/ml/stop")).isFalse();
    }

    @Test
    void theUpstreamStatusBodyAndContentTypeCome() throws Exception {
        responseStatus = 422;
        responseBody.put("body", "{\"detail\":\"no such airport\"}");
        responseHeaders.put("Content-Type", "application/json");

        MvcResult started = mockMvc.perform(get("/api/planner/course?dep=XXXX&dest=KDLH"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(started))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.detail").value("no such airport"));
    }

    @Test
    void aStreamedResponseAsksIntermediariesNotToBufferIt() throws Exception {
        MvcResult started = mockMvc.perform(get("/api/planner/detect/stream"))
                .andExpect(request().asyncStarted())
                .andReturn();

        // Detection's whole value is that the map fills from the
        // departure end while the rest is still being read; a proxy in
        // front deciding to buffer it undoes that.
        mockMvc.perform(asyncDispatch(started)).andExpect(header().string("X-Accel-Buffering", "no"));
    }

    @Test
    void anUpstreamThatIsNotListeningIsA502WithTheDetailShape() throws Exception {
        // The front end's own stream reader reports `detail`; a 502 with
        // an empty body or an HTML error page would show a pilot nothing.
        MockMvc unreachable = unreachablePlanner();
        // Answered at once, as a problem (StreamingProxy.problem): no stream starts.
        unreachable
                .perform(get("/api/planner/course"))
                .andExpect(request().asyncNotStarted())
                .andExpect(status().is(502))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The planner did not answer. Try again in a moment."));
    }

    /** A checkpoint note is its pilot's own, so the planner is told who
     *  saved it -- from the session, never from what the browser sent. */
    @Test
    void aNoteCarriesTheSignedInPilotAndNothingTheBrowserClaimed() throws Exception {
        Pilot pilot = org.mockito.Mockito.mock(Pilot.class);
        given(pilot.getId()).willReturn(42L);
        given(pilotService.current(any())).willReturn(Optional.of(pilot));

        finish(mockMvc.perform(post("/api/planner/checkpoint-notes")
                        .header("X-Pilot-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(request().asyncStarted())
                .andReturn());

        assertThat(received).contains("pilot=42").doesNotContain("pilot=7");
    }

    /** Signed in with no pilot to be found (an account deleted under its
     *  session): the note is not written as the single-user stack's,
     *  everyone's (round 4's security review, L9). */
    @Test
    void aSignedInNoteWithNoPilotIsRefused() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.empty());
        // Signed in as the session would have it (no filters run here).
        SecurityContextHolder.getContext()
                .setAuthentication(UsernamePasswordAuthenticationToken.authenticated("gone", null, List.of()));
        try {
            mockMvc.perform(post("/api/planner/checkpoint-notes")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isUnauthorized());
        } finally {
            SecurityContextHolder.clearContext();
        }
        assertThat(received).isEmpty();
    }

    @Test
    void noOtherPathCarriesAPilot() throws Exception {
        finish(mockMvc.perform(get("/api/planner/course?dep=C81&dest=KDLH").header("X-Pilot-Id", "7"))
                .andExpect(request().asyncStarted())
                .andReturn());

        assertThat(received).noneMatch(line -> line.startsWith("pilot="));
    }

    /** A second MockMvc whose planner points at a port nothing is on. */
    private MockMvc unreachablePlanner() {
        PlannerProxyController controller =
                new PlannerProxyController(new StreamingProxy(), "http://127.0.0.1:1", pilotService);
        // With the app's own handler, which writes a refusal as a problem.
        return standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }
}
