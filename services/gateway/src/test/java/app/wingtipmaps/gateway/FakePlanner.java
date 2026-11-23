package app.wingtipmaps.gateway;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The stand-in planner the account tests share: it keeps the pilot's own
 * checkpoint notes, writes down each request it is asked (asked) and
 * answers with the status a test sets (status). Started once for every
 * class that uses it, as the database is: the cached Spring context keeps
 * the first one's address.
 */
final class FakePlanner {

    private FakePlanner() {}

    private static HttpServer server;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /** The pilot's own note, as the planner answers GET /api/checkpoint-notes/mine. */
    static final String NOTES =
            "{\"notes\":[{\"route\":\"C81->KDLH\",\"lat\":45.0,\"lon\":-90.0,\"description\":\"Water tower\",\"created_at\":\"2026-10-01T00:00:00+00:00\"}]}";

    static final List<String> asked = new CopyOnWriteArrayList<>();
    static volatile int status = 200;

    static synchronized void start() throws IOException {
        if (server != null) {
            return;
        }
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            asked.add(
                    exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath() + " pilot="
                            + exchange.getRequestHeaders().getFirst("X-Pilot-Id"));
            // Every field the document requires, in JSON, as the planner answers: Jackson 3 leaves a
            // missing list null, and Spring reads an unlabelled body as octet-stream.
            String path = exchange.getRequestURI().getPath();
            // One last good day for each endorsement asked of, in order, as the engine answers
            // (endorsement_records): none runs out here.
            String asks = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String until = String.join(",", Collections.nCopies(asks.split("\"code\"", -1).length - 1, "null"));
            byte[] body = (path.equals("/api/pilot/endorsements")
                            ? "{\"checks\":[],\"soloUntil\":null,\"until\":[" + until + "]}"
                            : path.equals("/api/pilot/records-batch")
                                    ? recordsBatch(asks)
                                    : path.equals("/api/aircraft/inspections-batch")
                                            ? inspectionsBatch(asks)
                                            : exchange.getRequestMethod().equals("GET")
                                                            && path.equals("/api/checkpoint-notes/mine")
                                                    ? NOTES
                                                    : "{\"removed\":1}")
                    .getBytes();
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    /** The batch of records, one answer an ask in order (server-later's
     *  POST /api/pilot/records-batch): no experience, and a last good day
     *  (none) for each endorsement each ask holds. */
    static String recordsBatch(String asks) {
        JsonNode ask = JSON.readTree(asks);
        List<String> experience = new ArrayList<>();
        ask.path("experience").forEach(e -> experience.add("[]"));
        List<String> endorsements = new ArrayList<>();
        ask.path("endorsements")
                .forEach(e -> endorsements.add("{\"checks\":[],\"soloUntil\":null,\"until\":["
                        + String.join(",", Collections.nCopies(e.path("held").size(), "null")) + "]}"));
        return "{\"experience\":[" + String.join(",", experience) + "],\"endorsements\":["
                + String.join(",", endorsements) + "]}";
    }

    /** One airplane's inspections a POST /api/aircraft/inspections-batch ask, nothing due. */
    static String inspectionsBatch(String asks) {
        String none = "{\"annualUntil\":null,\"eltUntil\":null,\"staticCheckUntil\":null,"
                + "\"transponderCheckUntil\":null,\"hundredHourDueAtHours\":null,\"vorCheck\":null,\"due\":[]}";
        return "[" + String.join(",", Collections.nCopies(JSON.readTree(asks).size(), none)) + "]";
    }

    static String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    static void reset() {
        asked.clear();
        status = 200;
    }
}
