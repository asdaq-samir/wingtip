package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.SubscriptionService;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The browser's copy named through the front door: a route the same for
 * every pilot (x-gateway's cache) passes If-None-Match up and its ETag and
 * a 304 back, as the planner's /api/tfrs answers them; any other route
 * passes neither, as no request header but Content-Type is forwarded.
 * Against a real upstream on a socket, as PlannerProxyControllerTest is,
 * since what is tested is HTTP.
 */
@WebMvcTest(PlannerProxyController.class)
@Import(StreamingProxy.class)
@AutoConfigureMockMvc(addFilters = false)
class PlannerProxyConditionalTest {

    private static final String ETAG = "\"0f3a\"";

    private static HttpServer upstream;

    /** The If-None-Match each upstream request carried ("none" without). */
    private static final List<String> asked = new CopyOnWriteArrayList<>();

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PilotService pilotService;

    @MockitoBean
    private SubscriptionService subscriptions;

    /** A planner that answers as /api/tfrs does: a 304 for the list held,
     *  the list with its ETag otherwise. */
    @BeforeAll
    static void startUpstream() throws IOException {
        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/", exchange -> {
            String named = exchange.getRequestHeaders().getFirst("If-None-Match");
            asked.add(named == null ? "none" : named);
            exchange.getResponseHeaders().add("ETag", ETAG);
            exchange.getResponseHeaders().add("Cache-Control", "public, max-age=60");
            if (ETAG.equals(named)) {
                exchange.sendResponseHeaders(304, -1);
            } else {
                byte[] body = "{\"tfrs\":[]}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        upstream.start();
    }

    @AfterAll
    static void stopUpstream() {
        upstream.stop(0);
    }

    @DynamicPropertySource
    static void plannerUrl(DynamicPropertyRegistry registry) {
        registry.add(
                "app.planner.base-url",
                () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
        registry.add(
                "app.assistant.base-url",
                () -> "http://127.0.0.1:" + upstream.getAddress().getPort() + "/assistant");
    }

    @BeforeEach
    void reset() {
        asked.clear();
    }

    @Test
    void theTfrsListHeldComesBackA304WithItsETag() throws Exception {
        MvcResult started = mockMvc.perform(get("/api/planner/tfrs").header("If-None-Match", ETAG))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(started))
                .andExpect(status().isNotModified())
                .andExpect(header().string("ETag", ETAG))
                .andExpect(header().string("Cache-Control", "public, max-age=60"));
        assertThat(asked).containsExactly(ETAG);
    }

    @Test
    void theTfrsListAskedAfreshComesWholeWithTheETagToNameNextTime() throws Exception {
        MvcResult started = mockMvc.perform(get("/api/planner/tfrs"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(started)).andExpect(status().isOk()).andExpect(header().string("ETag", ETAG));
        assertThat(asked).containsExactly("none");
    }

    @Test
    void aCachedRouteThatDoesNotListETagStillPassesItAndThe304() throws Exception {
        // The airport search is `cache` with no headers of its own: the
        // ETag and the 304 come with the cache, not with a header list.
        MvcResult started = mockMvc.perform(
                        get("/api/planner/airports/search?q=KPAO").header("If-None-Match", ETAG))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(started))
                .andExpect(status().isNotModified())
                .andExpect(header().string("ETag", ETAG));
        assertThat(asked).containsExactly(ETAG);
    }

    @Test
    void aRouteForOnePilotNamesNoCopyAndGetsNoETag() throws Exception {
        // The course depends on the request, so the browser's copy of it
        // is not the planner's to judge: nothing passes either way.
        MvcResult started = mockMvc.perform(
                        get("/api/planner/course?dep=KPAO&dest=KSQL").header("If-None-Match", ETAG))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(started)).andExpect(status().isOk()).andExpect(header().doesNotExist("ETag"));
        assertThat(asked).containsExactly("none");
    }
}
