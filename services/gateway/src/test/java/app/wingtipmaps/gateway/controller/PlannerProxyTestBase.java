package app.wingtipmaps.gateway.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;

import app.wingtipmaps.gateway.service.PilotService;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
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
 * The front door, against a real upstream: the fake planner and the
 * MockMvc PlannerProxyControllerTest and PlannerProxyCachingTest share.
 *
 * <p>Every browser-reachable planner path arrives here. The behaviours the
 * two classes test were arrived at the hard way and are easy to lose in a
 * refactor: the path rewrite, the caching rule that applies to what is the
 * same for every pilot and nothing else, the streamed body, and the error
 * shape for an upstream that is not answering.
 *
 * <p>The upstream is a real HTTP server on a real socket rather than a
 * mock, because what is being tested is HTTP: a header carried or not
 * carried, a status passed through, a body piped. A mocked client would
 * only assert that this class calls the method it calls.
 */
@WebMvcTest(PlannerProxyController.class)
@Import(StreamingProxy.class)
@AutoConfigureMockMvc(addFilters = false)
abstract class PlannerProxyTestBase {

    private static HttpServer upstream;

    /** What the fake planner answers with next, and what it was asked. */
    static final Map<String, String> responseBody = new ConcurrentHashMap<>();

    static final Map<String, String> responseHeaders = new ConcurrentHashMap<>();
    static final List<String> received = new ArrayList<>();
    static volatile int responseStatus = 200;

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    PilotService pilotService;

    /** Started once for every class that extends this, which share one
     *  Spring context (the same @DynamicPropertySource method is the same
     *  cache key): stopped after the first class, the second class's
     *  context would ask a closed port. The forked test JVM's exit stops it. */
    @BeforeAll
    static synchronized void startUpstream() throws IOException {
        if (upstream != null) {
            return;
        }
        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/", exchange -> {
            String query = exchange.getRequestURI().getQuery();
            received.add(exchange.getRequestMethod() + " "
                    + exchange.getRequestURI().getPath() + (query == null ? "" : "?" + query));
            received.add("body=" + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String pilotHeader = exchange.getRequestHeaders().getFirst("X-Pilot-Id");
            if (pilotHeader != null) {
                received.add("pilot=" + pilotHeader);
            }
            String rangeHeader = exchange.getRequestHeaders().getFirst("Range");
            if (rangeHeader != null) {
                received.add("range=" + rangeHeader);
            }

            responseHeaders.forEach(
                    (name, value) -> exchange.getResponseHeaders().add(name, value));
            byte[] body = responseBody.getOrDefault("body", "{}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(responseStatus, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        upstream.start();
    }

    @DynamicPropertySource
    static void plannerUrl(DynamicPropertyRegistry registry) {
        registry.add(
                "app.planner.base-url",
                () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
    }

    @BeforeEach
    void reset() {
        received.clear();
        responseBody.clear();
        responseHeaders.clear();
        responseStatus = 200;
    }

    /** Runs the async dispatch a StreamingResponseBody requires, and
     *  gives back the finished result. */
    MvcResult finish(MvcResult started) throws Exception {
        return mockMvc.perform(asyncDispatch(started)).andReturn();
    }

    /** Whether the proxy forwards a method and an upstream path: a route
     *  the planner's document marks. */
    static boolean forwarded(String method, String upstreamPath) {
        return UpstreamRoutes.shipped().find(method, upstreamPath).isPresent();
    }
}
