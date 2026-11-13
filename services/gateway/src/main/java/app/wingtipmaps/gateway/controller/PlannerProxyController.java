package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.service.PilotService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * The planner's API, reached through this service rather than directly.
 *
 * <p>Chart reading is Python's -- numpy and scipy over raster tiles, and
 * there is no reason to rewrite that in Java. What there is reason to do
 * is stop it being a second front door. With this in place the planner
 * service publishes no port of its own, and every browser-reachable path
 * arrives here, where the session already exists and one set of rules
 * applies.
 *
 * <p>Which routes there are, and what each needs here, the planner says
 * in its own OpenAPI document ({@link UpstreamRoutes}).
 *
 * <p>Responses are piped rather than buffered, by {@link StreamingProxy},
 * which also owns the pinned HTTP/1.1 client and the error shape.
 * Detection streams newline-delimited JSON a tile block at a time so the
 * map fills from the departure end while the rest is still being read;
 * collecting that into a String before forwarding it would turn a
 * progressive response into a five-second wait.
 */
@RestController
@RequestMapping("/api/planner")
@Tag(name = "Planner", description = "Chart vision, course and nav log, proxied from the planner service")
public class PlannerProxyController {

    /** Long, because a cold corridor read is tens of seconds and a
     *  collection job is minutes. The client is what should give up. */
    private static final Duration TIMEOUT = Duration.ofMinutes(10);

    private static final StreamingProxy.Upstream PLANNER =
            new StreamingProxy.Upstream("planner service", "planner service unreachable", "planner service timed out");

    /** The largest body forwarded on any POST. The biggest sent is a flown
     *  track for its debrief: a three-hour flight logged once a second is
     *  about a megabyte. A String @RequestBody read whatever was sent
     *  before anything here could look, on routes open to anyone. A route
     *  may say less (x-gateway's bodyLimit). */
    static final int BODY_LIMIT = 4 * 1024 * 1024;

    /**
     * Every planner endpoint the browser may reach, and nothing else, as
     * the planner's document marks them.
     *
     * <p>Forwarding {@code /**} whole made every route the planner ever
     * grew public the day it was added, its own API docs included, and
     * left the access rules in {@code SecurityConfig} as the only thing
     * between a caller and the service. A path no document marks is a 404
     * from this class, and the planner is never asked.
     */
    private final UpstreamRoutes routes = UpstreamRoutes.shipped();

    /** Who a checkpoint note belongs to, for the planner (its
     *  routers/notes.py). Set here from the session and never from the
     *  browser: no request header is forwarded but Content-Type. */
    static final String PILOT_HEADER = "X-Pilot-Id";

    private final StreamingProxy proxy;
    private final String plannerBaseUrl;
    private final PilotService pilots;

    @Autowired
    public PlannerProxyController(StreamingProxy proxy, AppProperties app, PilotService pilots) {
        this(proxy, app.planner().baseUrl(), pilots);
    }

    public PlannerProxyController(StreamingProxy proxy, String plannerBaseUrl, PilotService pilots) {
        this.proxy = proxy;
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
        this.pilots = pilots;
    }

    @Operation(
            summary = "Any planner GET",
            description = "course, detect/stream, classify, picks, checkpoints, navlog, routes, build status")
    @GetMapping("/**")
    public ResponseEntity<StreamingResponseBody> get(HttpServletRequest request, HttpServletResponse servletResponse) {
        return forward(request, servletResponse, "GET", null);
    }

    // The body is read here, bounded, rather than as a @RequestBody: the
    // document still says what it takes.
    @Operation(
            summary = "Any planner POST",
            description = "picks, build",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema = @Schema(type = "string"))))
    @PostMapping("/**")
    public ResponseEntity<StreamingResponseBody> post(HttpServletRequest request, HttpServletResponse servletResponse)
            throws IOException {
        // Read up to the limit and no further, where a String @RequestBody
        // would have read all of it before this method could look.
        byte[] bytes = request.getInputStream().readNBytes(BODY_LIMIT + 1);
        if (bytes.length > BODY_LIMIT) {
            throw StreamingProxy.problem(
                    413, "a request to the planner is at most " + (BODY_LIMIT / 1024 / 1024) + " MB");
        }
        return forward(
                request, servletResponse, "POST", bytes.length == 0 ? null : new String(bytes, StandardCharsets.UTF_8));
    }

    @Operation(summary = "Any planner DELETE", description = "picks")
    @DeleteMapping("/**")
    public ResponseEntity<StreamingResponseBody> delete(
            HttpServletRequest request, HttpServletResponse servletResponse) {
        return forward(request, servletResponse, "DELETE", null);
    }

    private ResponseEntity<StreamingResponseBody> forward(
            HttpServletRequest request, HttpServletResponse servletResponse, String method, String body) {
        String path = UpstreamRoutes.upstreamPath(request);
        UpstreamRoutes.Route route = routes.find(method, path).orElse(null);
        if (route == null) {
            throw StreamingProxy.problem(404, "no such planner endpoint: " + method + " " + path);
        }
        if (route.bodyLimit() != null
                && body != null
                && body.getBytes(StandardCharsets.UTF_8).length > route.bodyLimit()) {
            throw StreamingProxy.problem(
                    413, "a request to " + path + " is at most " + (route.bodyLimit() / 1024) + " KB");
        }
        URI target = URI.create(plannerBaseUrl + path + query(request));

        HttpRequest.BodyPublisher publisher = body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8);
        HttpRequest.Builder upstreamBuilder = HttpRequest.newBuilder(target)
                .method(method, publisher)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(TIMEOUT);
        // A pilot's own edit to a checkpoint note is theirs alone, so the
        // planner is told whose it is. Only where the route asks: looking
        // the pilot up is a database call, and a tile request has no use for it.
        if (route.pilot()) {
            pilots.current(SecurityContextHolder.getContext().getAuthentication())
                    .ifPresent(pilot -> upstreamBuilder.header(PILOT_HEADER, String.valueOf(pilot.getId())));
        }
        // ForeFlight's downloader asks for the pack in byte ranges, and the
        // map for the overlay tiles' archive.
        String range = request.getHeader(HttpHeaders.RANGE);
        if (route.range() && range != null) {
            upstreamBuilder.header(HttpHeaders.RANGE, range);
        }
        // An answer the same for every pilot (x-gateway's cache) may carry
        // an ETag (the TFRs' list): the copy the browser holds is named to
        // the upstream, so an unchanged one comes back a 304 with no body
        // rather than the whole list again.
        String ifNoneMatch = request.getHeader(HttpHeaders.IF_NONE_MATCH);
        if (route.cache() && ifNoneMatch != null) {
            upstreamBuilder.header(HttpHeaders.IF_NONE_MATCH, ifNoneMatch);
        }
        HttpRequest upstream = upstreamBuilder.build();

        return proxy.exchange(PLANNER, upstream, response -> {
            ResponseEntity.BodyBuilder builder = StreamingProxy.unbuffered(ResponseEntity.status(response.statusCode())
                    .header(HttpHeaders.CONTENT_TYPE, StreamingProxy.contentTypeOf(response)));
            // Forwarded for the chart tiles, the airport diagrams and the
            // few answers the same for every pilot (x-gateway's cache):
            // their `public, max-age=...`
            // is what lets the browser, and CloudFront in front of this
            // app, skip asking again for what it already has -- a tile on
            // every pan and zoom, the airport search on every letter.
            // Every other route under /api/planner/** (course, navlog,
            // the fields in view with their METARs, picks, ...) depends
            // on saved state, live weather or a request body, so a
            // Cache-Control it happened to emit must not be echoed the
            // same way: Spring Security's no-store stands.
            // Set on the response itself, replacing that no-store, which
            // Spring Security has written by now (SecurityConfig: written
            // as the request comes in); a header of the ResponseEntity's
            // is added beside it, and the two read as no-store. Its Pragma
            // and Expires are emptied, as Spring's static resources do.
            if (route.cache()) {
                response.headers().firstValue(HttpHeaders.CACHE_CONTROL).ifPresent(value -> {
                    servletResponse.setHeader(HttpHeaders.CACHE_CONTROL, value);
                    for (String stale : new String[] {HttpHeaders.PRAGMA, HttpHeaders.EXPIRES}) {
                        if (servletResponse.containsHeader(stale)) {
                            servletResponse.setHeader(stale, "");
                        }
                    }
                });
                // Its ETag, on the answer and on a 304 (whose status is
                // passed as it came), for the browser to name next time.
                if (!route.headers().contains(HttpHeaders.ETAG)) {
                    response.headers()
                            .firstValue(HttpHeaders.ETAG)
                            .ifPresent(value -> builder.header(HttpHeaders.ETAG, value));
                }
            }
            // What the route passes on as it came (x-gateway's headers):
            // the airport index's gzip encoding, the ForeFlight pack's file
            // name, size and range, the overlay archive's range and ETag.
            for (String name : route.headers()) {
                response.headers().firstValue(name).ifPresent(value -> builder.header(name, value));
            }
            return builder.body(StreamingProxy.pipe(response.body()));
        });
    }

    private static String query(HttpServletRequest request) {
        String queryString = request.getQueryString();
        return queryString == null ? "" : "?" + queryString;
    }
}
