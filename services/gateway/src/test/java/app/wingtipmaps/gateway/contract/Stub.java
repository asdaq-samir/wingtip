package app.wingtipmaps.gateway.contract;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * A service as its OpenAPI document says it is: every operation the
 * document has answers 200 with a sample of its answer, anything else 404,
 * and every request is kept as it was sent.
 */
final class Stub implements AutoCloseable {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** A briefing as the planner's document says one is, for the calls
     *  that pass one on (set before they are made). */
    static volatile String briefing = "{}";

    /** One request as it came. */
    record Asked(
            Stub stub,
            String method,
            String path,
            Map<String, String> query,
            Map<String, String> headers,
            String body) {}

    final String service;
    final OpenApiContract contract;
    final List<Asked> asked = new CopyOnWriteArrayList<>();
    private final HttpServer server;

    Stub(String service, OpenApiContract contract) {
        this.service = service;
        this.contract = contract;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/", this::answer);
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private void answer(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getRawPath();
        Map<String, String> headers = new LinkedHashMap<>();
        exchange.getRequestHeaders().forEach((name, values) -> headers.put(name, values.getFirst()));
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        asked.add(new Asked(this, method, path, query(exchange.getRequestURI().getRawQuery()), headers, body));
        byte[] answer = contract.operation(method, path)
                .map(op -> OpenApiContract.answerSchema(op)
                        .map(s -> new AnswerContract(contract).sample(s).toString())
                        .orElse("{}"))
                .map(s -> s.getBytes(StandardCharsets.UTF_8))
                .orElse(null);
        if (answer == null) {
            exchange.sendResponseHeaders(404, -1);
        } else {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, answer.length);
            exchange.getResponseBody().write(answer);
        }
        exchange.close();
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> out = new LinkedHashMap<>();
        if (raw != null && !raw.isEmpty()) {
            for (String pair : raw.split("&")) {
                int eq = pair.indexOf('=');
                String name = URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), StandardCharsets.UTF_8);
                out.put(name, eq < 0 ? "" : URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return out;
    }

    static JsonNode parse(String body) {
        try {
            return JSON.readTree(body);
        } catch (JacksonException e) {
            throw new IllegalArgumentException("the body sent is not JSON: " + body, e);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
