package app.wingtipmaps.gateway.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.util.RawValue;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import app.wingtipmaps.gateway.assistant.model.AssistantChangesWords;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.EndorsementKindDto;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * The planner and the assistant, asked by this app on its own behalf
 * rather than for a browser's request (that is {@link app.wingtipmaps.gateway.controller.PlannerProxyController}):
 * a flight's briefing from the planner, and what changed between two
 * briefings in words from the assistant service (services/assistant,
 * which holds every Claude call), for the flight watch
 * (FlightWatchService); and what a pilot's logbook says of them -- their
 * currency (14 CFR 61.56, 61.57) and a student's 61.109 experience --
 * which the engine works out through the planner, as this app holds no
 * aviation rule of its own (CLAUDE.md). Reached at the same base
 * addresses the proxy uses.
 *
 * <p>The briefing is the planner's JSON document, carried as a string
 * and never read inside: what it says is the planner's to say, and the
 * gateway only keeps it to hand back. The client is pinned to HTTP/1.1
 * for the reason {@link app.wingtipmaps.gateway.controller.StreamingProxy}
 * gives: the planner is uvicorn, and a pooled connection that attempted
 * an HTTP/2 upgrade corrupted the next request on it.
 */
@Component
public class PlannerClient {

    /** A briefing reads the weather along the route, tens of seconds when
     *  aviationweather.gov is slow; the words are one Claude call. */
    private static final Duration TIMEOUT = Duration.ofMinutes(2);

    /** Fields the planner adds later are ignored: its answers are
     *  generated from its OpenAPI document as this app was built, and a
     *  planner deployed after it may say more. */
    static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /** The same, reading the planner's days ("2026-10-11") as LocalDate. */
    static final ObjectMapper DATES = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
            .build();

    /** A rule from the logbook is the engine's work on a few hundred
     *  entries, milliseconds; a planner that takes longer is not well. */
    private static final Duration RULE_TIMEOUT = Duration.ofSeconds(20);

    /** The planner did not answer, or not with what was asked for. */
    public static class Unavailable extends RuntimeException {
        public Unavailable(String why) {
            super(why);
        }

        public Unavailable(String why, Throwable cause) {
            super(why, cause);
        }
    }

    private final HttpClient http = newClient();

    private static HttpClient newClient() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }
    private final String plannerBaseUrl;
    private final String assistantBaseUrl;

    public PlannerClient(@Value("${planner-service.base-url:http://planner:8000}") String plannerBaseUrl,
                         @Value("${assistant-service.base-url:http://assistant:8000}") String assistantBaseUrl) {
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
        this.assistantBaseUrl = assistantBaseUrl.replaceAll("/+$", "");
    }

    /**
     * The flight's briefing now, as the planner writes it (GET
     * /api/briefing), for the departure time and the flight's own time
     * en route, so the forecast covers the flight.
     *
     * @throws Unavailable when the planner cannot be reached or refuses
     */
    public String briefing(String dep, String dest, List<String> stops, Instant depart, Double eteMin) {
        StringBuilder query = new StringBuilder("?dep=").append(encode(dep)).append("&dest=").append(encode(dest));
        if (stops != null && !stops.isEmpty()) {
            query.append("&stops=").append(encode(String.join(",", stops)));
        }
        query.append("&depart=").append(encode(DateTimeFormatter.ISO_INSTANT.format(depart)));
        if (eteMin != null) {
            query.append("&ete_min=").append(eteMin);
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(plannerBaseUrl + "/api/briefing" + query))
                .GET()
                .timeout(TIMEOUT)
                .build();
        return send(request, "the planner", "the briefing");
    }

    /**
     * What changed between two briefings of the flight, in words (POST
     * /api/words/changes): whether anything did, the sentences that say
     * what, the reports they came from, and which model wrote them;
     * {@code unavailable} says why there are none when the words could
     * not be written. Asked of the assistant service, which asks the
     * planner for the changes and Claude for the words. The answer is
     * the assistant's own ChangesWords, generated from
     * services/assistant/openapi.json at build time (the pom's
     * openapi-generator-maven-plugin). Both briefings go as the JSON
     * they came as, never parsed here: what they say is the planner's.
     *
     * @throws Unavailable when the assistant cannot be reached, refuses,
     *     or answers something that is not its answer
     */
    public AssistantChangesWords changes(String dep, String dest, List<String> stops, String then, String now) {
        ObjectNode body = JSON.createObjectNode();
        body.put("dep", dep);
        body.put("dest", dest);
        ArrayNode stopNodes = body.putArray("stops");
        for (String stop : stops == null ? List.<String>of() : stops) {
            stopNodes.add(stop);
        }
        // Embedded as the JSON they already are, not as strings holding JSON.
        body.putRawValue("then", new RawValue(then));
        body.putRawValue("now", new RawValue(now));
        HttpRequest request = HttpRequest.newBuilder(URI.create(assistantBaseUrl + "/api/words/changes"))
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(TIMEOUT)
                .build();
        String answer = send(request, "the assistant", "the changes");
        try {
            return JSON.readValue(answer, AssistantChangesWords.class);
        } catch (JsonProcessingException notItsAnswer) {
            throw new Unavailable("the assistant's answer to the changes was not its answer", notItsAnswer);
        }
    }

    /**
     * Where the pilot stands on {@code today} from their logbook and the
     * dates they give (POST /api/pilot/currency): 14 CFR 61.56 and 61.57,
     * worked out by the shared engine's pilot_currency. The planner's
     * answer has CurrencyDto's members, so it is read straight into it.
     *
     * @throws Unavailable when the planner cannot be reached or refuses
     */
    public CurrencyDto currency(List<LogbookEntry> entries, LocalDate flightReviewOn, LocalDate medicalExpiresOn,
                                LocalDate ipcOn, LocalDate today) {
        ObjectNode body = DATES.createObjectNode();
        body.set("entries", entriesOf(entries));
        body.put("flightReviewOn", flightReviewOn == null ? null : flightReviewOn.toString());
        body.put("medicalExpiresOn", medicalExpiresOn == null ? null : medicalExpiresOn.toString());
        body.put("ipcOn", ipcOn == null ? null : ipcOn.toString());
        body.put("today", today.toString());
        return read(post("/api/pilot/currency", body, "the currency"), CurrencyDto.class, "the currency");
    }

    /**
     * A student's private pilot experience on {@code today}, item by item
     * (POST /api/pilot/experience): 14 CFR 61.109(a), worked out by the
     * shared engine's pilot_experience.
     *
     * @throws Unavailable when the planner cannot be reached or refuses
     */
    public List<ExperienceItemDto> experience(List<LogbookEntry> entries, LocalDate today) {
        ObjectNode body = DATES.createObjectNode();
        body.set("entries", entriesOf(entries));
        body.put("today", today.toString());
        return List.of(read(post("/api/pilot/experience", body, "the experience"), ExperienceItemDto[].class, "the experience"));
    }

    /** The columns the planner's rules read, as the planner's LogbookEntry
     *  names them. */
    private static ArrayNode entriesOf(List<LogbookEntry> entries) {
        ArrayNode out = DATES.createArrayNode();
        for (LogbookEntry e : entries) {
            ObjectNode n = out.addObject();
            n.put("flownOn", e.getFlownOn().toString());
            n.put("totalHours", e.getTotalHours());
            n.put("nightHours", e.getNightHours());
            n.put("crossCountryHours", e.getCrossCountryHours());
            n.put("dayLandings", e.getDayLandings());
            n.put("nightLandings", e.getNightLandings());
            n.put("dualHours", e.getDualHours());
            n.put("soloHours", e.getSoloHours());
            n.put("instrumentHours", e.getInstrumentHours());
            n.put("toweredLandings", e.getToweredLandings());
            n.put("distanceNm", e.getDistanceNm());
            n.put("longestLegNm", e.getLongestLegNm());
            n.put("approaches", e.getApproaches());
            n.put("holding", e.isHolding());
            n.put("tracking", e.isTracking());
        }
        return out;
    }

    /** An endorsement held, as the engine reads one: its code, the day it
     *  was given, and the make and model it names where it says. */
    public record Held(String code, LocalDate on, String makeModel) {
    }

    /** What the endorsements say (POST /api/pilot/endorsements, the
     *  engine's endorsement_records): each one's last good day in order
     *  (null where it does not run out), the day the solo endorsement runs
     *  out (14 CFR 61.87(n), (p)), and 61.93(d)'s checks for a solo
     *  cross-country on the day asked. */
    public record Endorsements(List<LocalDate> until, LocalDate soloUntil, List<ReviewCheckDto> checks) {
    }

    /**
     * What a student's endorsements say, for a solo cross-country on
     * {@code flightOn} where it is given.
     *
     * @throws Unavailable when the planner cannot be reached or refuses
     */
    public Endorsements endorsements(List<Held> held, LocalDate flightOn) {
        ObjectNode body = DATES.createObjectNode();
        ArrayNode list = body.putArray("held");
        for (Held h : held) {
            ObjectNode n = list.addObject();
            n.put("code", h.code());
            n.put("on", h.on().toString());
            n.put("makeModel", h.makeModel());
        }
        body.put("flightOn", flightOn == null ? null : flightOn.toString());
        return read(post("/api/pilot/endorsements", body, "the endorsements"), Endorsements.class, "the endorsements");
    }

    /**
     * AC 61-65K's endorsements a student meets, in order, word for word
     * (GET /api/pilot/endorsement-kinds, the engine's endorsement_kinds):
     * the catalogue the Checkride page lists, a student records from paper
     * and an instructor signs from. The planner's answer has
     * EndorsementKindDto's members.
     *
     * @throws Unavailable when the planner cannot be reached or refuses
     */
    public List<EndorsementKindDto> endorsementKinds() {
        HttpRequest request = HttpRequest.newBuilder(URI.create(plannerBaseUrl + "/api/pilot/endorsement-kinds"))
                .GET()
                .timeout(RULE_TIMEOUT)
                .build();
        return List.of(read(sendAgainOnce(request, "the endorsements' words"), EndorsementKindDto[].class, "the endorsements' words"));
    }

    /** The endorsement of {@code code} in the catalogue, if there is one. */
    public Optional<EndorsementKindDto> endorsementKind(String code) {
        return endorsementKinds().stream().filter(k -> k.code().equals(code)).findFirst();
    }

    /** An endorsement made ready to sign (the engine's endorsement_fill):
     *  each field it takes, tidied, "" where not given; the labels of the
     *  required ones still empty; and the words as they are signed. */
    public record Filled(Map<String, String> fields, List<String> missing, String text) {
    }

    /**
     * An endorsement of a code {@link #endorsementKinds} lists, filled in
     * with the student's name and the instructor's fields (POST
     * /api/pilot/endorsement-fill).
     *
     * @throws Unavailable when the planner cannot be reached or refuses,
     *     a code it does not know among them
     */
    public Filled fill(String code, String student, Map<String, String> fields) {
        ObjectNode body = DATES.createObjectNode();
        body.put("code", code);
        body.put("student", student);
        ObjectNode given = body.putObject("fields");
        (fields == null ? Map.<String, String>of() : fields).forEach((k, v) -> given.put(k, v == null ? "" : v));
        return read(post("/api/pilot/endorsement-fill", body, "the endorsement's words"), Filled.class, "the endorsement's words");
    }

    /** A VOR check's figures as the engine judges them: the largest error
     *  91.171 allows for its kind, whether it was within, and its last
     *  good day (30 days on). */
    public record VorCheckDue(double limitDeg, boolean within, LocalDate until) {
    }

    /** When the airplane's inspections fall due (POST /api/aircraft/inspections,
     *  the engine's inspections_due), each null where none was recorded. */
    public record Inspections(LocalDate annualUntil, LocalDate eltUntil, LocalDate staticCheckUntil,
                              LocalDate transponderCheckUntil, Double hundredHourDueAtHours, VorCheckDue vorCheck) {
    }

    /**
     * When an airplane's inspections and checks fall due: 14 CFR 91.409(a)
     * and (b), 91.207(d), 91.411(a), 91.413(a) and 91.171.
     *
     * @throws Unavailable when the planner cannot be reached or refuses
     */
    public Inspections inspections(LocalDate annualOn, LocalDate eltOn, LocalDate staticCheckOn, LocalDate transponderCheckOn,
                                   Double hundredHourAtHours, LocalDate vorCheckOn, String vorCheckKind, Double vorCheckErrorDeg) {
        ObjectNode body = DATES.createObjectNode();
        body.put("annualOn", annualOn == null ? null : annualOn.toString());
        body.put("eltOn", eltOn == null ? null : eltOn.toString());
        body.put("staticCheckOn", staticCheckOn == null ? null : staticCheckOn.toString());
        body.put("transponderCheckOn", transponderCheckOn == null ? null : transponderCheckOn.toString());
        body.put("hundredHourAtHours", hundredHourAtHours);
        if (vorCheckOn != null && vorCheckKind != null && vorCheckErrorDeg != null) {
            ObjectNode vor = body.putObject("vorCheck");
            vor.put("on", vorCheckOn.toString());
            vor.put("kind", vorCheckKind);
            vor.put("errorDeg", vorCheckErrorDeg);
        }
        return read(post("/api/aircraft/inspections", body, "the inspections"), Inspections.class, "the inspections");
    }

    /**
     * A rule asked of the planner by name. Each is a pure answer from what
     * is sent, so one that fails to reach it is sent once more: the
     * client's pooled connection may be one the planner (uvicorn, 5 s
     * keep-alive) has already closed while it sat idle, and the JDK does
     * not resend a POST on its own. That failed every rule asked after a
     * quiet minute -- a pilot's currency, a student's experience -- with
     * "could not be reached", several at once (the end-of-wave browser
     * run, 2026-11-08). It is sent again on a client of its own, a new
     * connection: the pool may hold several gone stale together, and a
     * second one from it failed the same way. A timeout is not tried again.
     */
    private String post(String path, ObjectNode body, String what) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(plannerBaseUrl + path))
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(RULE_TIMEOUT)
                .build();
        return sendAgainOnce(request, what);
    }

    private String sendAgainOnce(HttpRequest request, String what) {
        try {
            return send(request, "the planner", what);
        } catch (Unavailable unreached) {
            if (!(unreached.getCause() instanceof IOException) || unreached.getCause() instanceof HttpTimeoutException) {
                throw unreached;
            }
            try (HttpClient fresh = newClient()) {
                return send(fresh, request, "the planner", what);
            }
        }
    }

    private static <T> T read(String answer, Class<T> type, String what) {
        try {
            return DATES.readValue(answer, type);
        } catch (JsonProcessingException notItsAnswer) {
            throw new Unavailable("the planner's answer to " + what + " was not its answer", notItsAnswer);
        }
    }

    private String send(HttpRequest request, String who, String what) {
        return send(http, request, who, what);
    }

    private static String send(HttpClient client, HttpRequest request, String who, String what) {
        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                throw new Unavailable(who + " answered " + response.statusCode() + " to " + what);
            }
            return response.body();
        } catch (IOException failed) {
            throw new Unavailable(who + " could not be reached for " + what, failed);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new Unavailable("interrupted asking " + who + " for " + what, interrupted);
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
