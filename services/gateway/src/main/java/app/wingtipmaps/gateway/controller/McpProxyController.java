package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * The connector's MCP server, which the planner runs (app/mcp), at this
 * app's own address: /mcp, and its protected resource metadata (RFC 9728)
 * at /.well-known/oauth-protected-resource/mcp. Passed on as they come,
 * the planner's answer streamed back (Streamable HTTP answers a call as
 * server-sent events).
 *
 * <p>Its own controller rather than routes the planner marks with
 * x-gateway (UpstreamRoutes): those are /api/ paths, reached under
 * /api/planner, and the metadata must sit at the root's well-known path
 * for a client that looks for it there (the MCP spec's "Authorization
 * Server Discovery"). And at this origin the MCP server and the
 * authorization server (AuthorizationServerConfig) are one host, which
 * Claude's docs recommend ("Authentication for connectors": a single
 * domain that routes both).
 *
 * <p>The bearer token is not looked at here: the planner is the resource
 * server and checks it (signature, issuer, audience, expiry) on every
 * request, as the MCP spec has the MCP server do. No session, no CSRF
 * token (ConnectorSecurityConfig): a client's token is its only credential.
 */
@RestController
@Hidden
public class McpProxyController {

    /** A JSON-RPC message, or a batch of them: a tool call's arguments are
     *  small, and a body this big is no client's. */
    static final long BODY_LIMIT = 1024 * 1024;

    private static final StreamingProxy.Upstream PLANNER =
            new StreamingProxy.Upstream("planner service", "planner service unreachable", "planner service timed out");

    /** What a client sends that the MCP server reads (the MCP spec's
     *  Streamable HTTP transport and its authorization). */
    private static final List<String> REQUEST_HEADERS = List.of(
            HttpHeaders.AUTHORIZATION,
            HttpHeaders.CONTENT_TYPE,
            HttpHeaders.ACCEPT,
            "Mcp-Session-Id",
            "Mcp-Protocol-Version",
            "Last-Event-ID");

    /** And what it answers that the client reads: the session, and the
     *  challenge that sends a client to sign in. */
    private static final List<String> RESPONSE_HEADERS = List.of(
            HttpHeaders.CONTENT_TYPE, "Mcp-Session-Id", HttpHeaders.WWW_AUTHENTICATE, HttpHeaders.CACHE_CONTROL);

    private final StreamingProxy proxy;
    private final String plannerBaseUrl;

    @Autowired
    public McpProxyController(StreamingProxy proxy, AppProperties app) {
        this(proxy, app.planner().baseUrl());
    }

    public McpProxyController(StreamingProxy proxy, String plannerBaseUrl) {
        this.proxy = proxy;
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
    }

    @RequestMapping(
            value = "/mcp",
            method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.DELETE})
    public ResponseEntity<StreamingResponseBody> mcp(HttpServletRequest request) throws IOException {
        // Read up to the limit and no further, counting the bytes rather
        // than trusting Content-Length: a chunked body has none (-1), and
        // was streamed on to the planner whole (the security audit's L6).
        byte[] body =
                "POST".equals(request.getMethod()) ? request.getInputStream().readNBytes((int) BODY_LIMIT + 1) : null;
        if (body != null && body.length > BODY_LIMIT) {
            throw StreamingProxy.problem(413, "an MCP request is at most " + (BODY_LIMIT / 1024) + " KB");
        }
        return forward(request, "/mcp", body);
    }

    @GetMapping("/.well-known/oauth-protected-resource/mcp")
    public ResponseEntity<StreamingResponseBody> metadata(HttpServletRequest request) {
        return forward(request, "/.well-known/oauth-protected-resource/mcp", null);
    }

    private ResponseEntity<StreamingResponseBody> forward(HttpServletRequest request, String path, byte[] bytes) {
        HttpRequest.BodyPublisher body =
                bytes != null ? HttpRequest.BodyPublishers.ofByteArray(bytes) : HttpRequest.BodyPublishers.noBody();
        // Long: a GET is the server's stream of messages to the client,
        // open for as long as the client keeps it (the async request
        // timeout, application.yml, is what ends it).
        HttpRequest.Builder upstream = HttpRequest.newBuilder(URI.create(plannerBaseUrl + path))
                .method(request.getMethod(), body)
                .timeout(Duration.ofMinutes(10));
        for (String name : REQUEST_HEADERS) {
            String value = request.getHeader(name);
            if (value != null) {
                upstream.header(name, value);
            }
        }
        return proxy.exchange(PLANNER, upstream.build(), response -> {
            ResponseEntity.BodyBuilder answer = StreamingProxy.unbuffered(ResponseEntity.status(response.statusCode()));
            for (String name : RESPONSE_HEADERS) {
                response.headers().allValues(name).forEach(value -> answer.header(name, value));
            }
            return answer.body(StreamingProxy.pipe(response.body()));
        });
    }
}
