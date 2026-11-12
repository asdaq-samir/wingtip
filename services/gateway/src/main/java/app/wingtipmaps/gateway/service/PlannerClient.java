package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.assistant.model.AssistantChangesWords;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.EndorsementFieldDto;
import app.wingtipmaps.gateway.dto.EndorsementKindDto;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.planner.model.PlannerCurrency;
import app.wingtipmaps.gateway.planner.model.PlannerCurrencyAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFillAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFilled;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementKind;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceItem;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerInspectionsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerLogbookEntry;
import app.wingtipmaps.gateway.planner.model.PlannerReviewCheck;
import app.wingtipmaps.gateway.planner.model.PlannerVorCheckAsk;
import app.wingtipmaps.gateway.tracing.TraceHeaders;
import java.io.IOException;
import java.math.BigDecimal;
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
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.cfg.DateTimeFeature;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.util.RawValue;

/**
 * This app's one client of the planner and the assistant on its own behalf
 * (a browser's request is {@link app.wingtipmaps.gateway.controller.PlannerProxyController}'s):
 * the flight watch's briefings and their changes in words (FlightWatchService,
 * ChangeLines), the engine's rules over a pilot's logbook and airplane, as
 * this app holds no aviation rule of its own (CLAUDE.md), a pilot's notes
 * (CheckpointNotesClient) and the Studio's drafts (CrashDraftMail), each
 * answer read into the planner's generated models. A briefing is carried as
 * the planner's JSON, never read here. Pinned to HTTP/1.1 for the reason
 * {@link app.wingtipmaps.gateway.controller.StreamingProxy} gives: the
 * planner is uvicorn, and a pooled connection that attempted an HTTP/2
 * upgrade corrupted the next request on it.
 */
@Component
public class PlannerClient {

    /** A briefing reads the weather along the route, tens of seconds when
     *  aviationweather.gov is slow; the words are one Claude call. */
    private static final Duration TIMEOUT = Duration.ofMinutes(2);

    /** Fields the planner adds later are ignored: a planner deployed after
     *  this app was built from its OpenAPI document may say more. */
    static final ObjectMapper JSON = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    /** The same, the planner's days ("2026-10-11") as LocalDate, for its asks and
     *  answers as the types generated from its document (the pom, planner.model)
     *  have them, so a field the planner renames fails the build where it is used. */
    static final ObjectMapper DATES = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .disable(DateTimeFeature.WRITE_DATES_AS_TIMESTAMPS)
            .build();

    /** A rule from the logbook is the engine's work on a few hundred
     *  entries, milliseconds; a planner that takes longer is not well. */
    private static final Duration RULE_TIMEOUT = Duration.ofSeconds(20);

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
    /** The trace's and the page's headers on each request (TraceHeaders). */
    private TraceHeaders traceHeaders = TraceHeaders.NONE;

    public PlannerClient(
            @Value("${planner-service.base-url:http://planner:8000}") String plannerBaseUrl,
            @Value("${assistant-service.base-url:http://assistant:8000}") String assistantBaseUrl) {
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
        this.assistantBaseUrl = assistantBaseUrl.replaceAll("/+$", "");
    }

    @Autowired(required = false)
    void setTraceHeaders(TraceHeaders traceHeaders) {
        this.traceHeaders = traceHeaders;
    }

    /**
     * The flight's briefing now, as the planner writes it (GET
     * /api/briefing), for the departure time and the flight's own time
     * en route, so the forecast covers the flight.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public String briefing(String dep, String dest, List<String> stops, Instant depart, Double eteMin) {
        StringBuilder query =
                new StringBuilder("?dep=").append(encode(dep)).append("&dest=").append(encode(dest));
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
     * @throws PlannerUnavailableException when the assistant cannot be reached, refuses,
     *     or answers something that is not its answer
     */
    public AssistantChangesWords changes(String dep, String dest, List<String> stops, String then, String now) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(assistantBaseUrl + "/api/words/changes"))
                .POST(HttpRequest.BodyPublishers.ofString(
                        changesAsk(dep, dest, stops, then, now), StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(TIMEOUT)
                .build();
        String answer = send(request, "the assistant", "the changes");
        try {
            return JSON.readValue(answer, AssistantChangesWords.class);
        } catch (JacksonException notItsAnswer) {
            throw new PlannerUnavailableException(
                    "the assistant's answer to the changes was not its answer", notItsAnswer);
        }
    }

    /** The changes' ask, the assistant's and the planner's alike (ChangeLines):
     *  both briefings embedded as the JSON they already are, not as strings holding JSON. */
    static String changesAsk(String dep, String dest, List<String> stops, String then, String now) {
        ObjectNode body = JSON.createObjectNode().put("dep", dep).put("dest", dest);
        (stops == null ? List.<String>of() : stops).forEach(body.putArray("stops")::add);
        return body.putRawValue("then", new RawValue(then))
                .putRawValue("now", new RawValue(now))
                .toString();
    }

    /**
     * Where the pilot stands on {@code today} from their logbook and the
     * dates they give (POST /api/pilot/currency): 14 CFR 61.56 and 61.57,
     * worked out by the shared engine's pilot_currency, as this app's own
     * CurrencyDto.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public CurrencyDto currency(
            List<LogbookEntry> entries,
            LocalDate flightReviewOn,
            LocalDate medicalExpiresOn,
            LocalDate ipcOn,
            LocalDate today) {
        PlannerCurrencyAsk ask = new PlannerCurrencyAsk(entriesOf(entries), today)
                .flightReviewOn(flightReviewOn)
                .medicalExpiresOn(medicalExpiresOn)
                .ipcOn(ipcOn);
        return answer(
                "/api/pilot/currency",
                ask,
                PlannerCurrency.class,
                "the currency",
                c -> new CurrencyDto(
                        c.getDayPassengersUntil(),
                        c.getNightPassengersUntil(),
                        c.getFlightReviewOn(),
                        c.getFlightReviewUntil(),
                        c.getMedicalExpiresOn(),
                        c.getTotalHours().doubleValue(),
                        c.getNightHours().doubleValue(),
                        c.getCrossCountryHours().doubleValue(),
                        c.getLandings(),
                        c.getFlights(),
                        c.getInstrumentCurrentUntil(),
                        c.getInstrumentCurrentFrom(),
                        c.getIpcOn(),
                        c.getIpcNeededAfter(),
                        c.getApproachesInWindow(),
                        c.getHoldingInWindow(),
                        c.getTrackingInWindow()));
    }

    /**
     * A student's private pilot experience on {@code today}, item by item
     * (POST /api/pilot/experience): 14 CFR 61.109(a), worked out by the
     * shared engine's pilot_experience.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<ExperienceItemDto> experience(List<LogbookEntry> entries, LocalDate today) {
        return answer(
                "/api/pilot/experience",
                new PlannerExperienceAsk(entriesOf(entries), today),
                PlannerExperienceItem[].class,
                "the experience",
                items -> Arrays.stream(items)
                        .map(i -> new ExperienceItemDto(
                                i.getKey(),
                                i.getRule(),
                                i.getLabel(),
                                i.getHave().doubleValue(),
                                i.getNeed().doubleValue(),
                                i.getUnit().getValue(),
                                i.getMet()))
                        .toList());
    }

    /** The columns the planner's rules read, as its LogbookEntry has them. */
    private static List<PlannerLogbookEntry> entriesOf(List<LogbookEntry> entries) {
        return entries.stream()
                .map(e -> new PlannerLogbookEntry(e.getFlownOn())
                        .totalHours(decimal(e.getTotalHours()))
                        .nightHours(decimal(e.getNightHours()))
                        .crossCountryHours(decimal(e.getCrossCountryHours()))
                        .dayLandings(e.getDayLandings())
                        .nightLandings(e.getNightLandings())
                        .dualHours(decimal(e.getDualHours()))
                        .soloHours(decimal(e.getSoloHours()))
                        .instrumentHours(decimal(e.getInstrumentHours()))
                        .toweredLandings(e.getToweredLandings())
                        .distanceNm(decimal(e.getDistanceNm()))
                        .longestLegNm(decimal(e.getLongestLegNm()))
                        .approaches(e.getApproaches())
                        .holding(e.isHolding())
                        .tracking(e.isTracking()))
                .toList();
    }

    /** An endorsement held, as the engine reads one: its code, the day it
     *  was given, and the make and model it names where it says. */
    public static PlannerHeldEndorsement held(String code, LocalDate on, String makeModel) {
        return new PlannerHeldEndorsement(code, on).makeModel(makeModel);
    }

    /**
     * What a student's endorsements say (POST /api/pilot/endorsements, the
     * engine's endorsement_records): each one's last good day in order
     * (null where it does not run out), the day the solo endorsement runs
     * out (14 CFR 61.87(n), (p)), and 61.93(d)'s checks for a solo
     * cross-country on {@code flightOn} where it is given ({@link #checkOf}).
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public PlannerEndorsements endorsements(List<PlannerHeldEndorsement> held, LocalDate flightOn) {
        return answer(
                "/api/pilot/endorsements",
                new PlannerEndorsementsAsk(held).flightOn(flightOn),
                PlannerEndorsements.class,
                "the endorsements",
                e -> e);
    }

    /** One of 61.93(d)'s checks, as this app sends it on. */
    public static ReviewCheckDto checkOf(PlannerReviewCheck c) {
        return new ReviewCheckDto(c.getRule(), c.getLabel(), c.getMet(), c.getDetail());
    }

    /**
     * AC 61-65K's endorsements a student meets, in order, word for word
     * (GET /api/pilot/endorsement-kinds, the engine's endorsement_kinds):
     * the catalogue the Checkride page lists, a student records from paper
     * and an instructor signs from.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<EndorsementKindDto> endorsementKinds() {
        return Arrays.stream(
                        get("/api/pilot/endorsement-kinds", PlannerEndorsementKind[].class, "the endorsements' words"))
                .map(k -> new EndorsementKindDto(
                        k.getCode(),
                        k.getParagraph(),
                        k.getRule(),
                        k.getLabel(),
                        k.getTemplate(),
                        k.getFields().stream()
                                .map(f -> new EndorsementFieldDto(
                                        f.getKey(), f.getLabel(), f.getExample(), f.getRequired()))
                                .toList()))
                .toList();
    }

    /** The endorsement of {@code code} in the catalogue, if there is one. */
    public Optional<EndorsementKindDto> endorsementKind(String code) {
        return endorsementKinds().stream().filter(k -> k.code().equals(code)).findFirst();
    }

    /**
     * An endorsement of a code {@link #endorsementKinds} lists, filled in
     * with the student's name and the instructor's fields (POST
     * /api/pilot/endorsement-fill, the engine's endorsement_fill): each
     * field it takes, tidied, "" where not given; the labels of the
     * required ones still empty; and the words as they are signed.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses,
     *     a code it does not know among them
     */
    public PlannerEndorsementFilled fill(String code, String student, Map<String, String> fields) {
        PlannerEndorsementFillAsk ask = new PlannerEndorsementFillAsk(code).student(student);
        (fields == null ? Map.<String, String>of() : fields)
                .forEach((k, v) -> ask.putFieldsItem(k, v == null ? "" : v));
        return answer(
                "/api/pilot/endorsement-fill", ask, PlannerEndorsementFilled.class, "the endorsement's words", f -> f);
    }

    /**
     * When an airplane's inspections and checks fall due (POST
     * /api/aircraft/inspections, the engine's inspections_due), each null
     * where none was recorded: 14 CFR 91.409(a) and (b), 91.207(d),
     * 91.411(a), 91.413(a), and 91.171 for the VOR check -- the largest
     * error allowed for its kind, whether it was within, and its last good
     * day (30 days on). The VOR check is sent only with its day, kind and
     * error all recorded.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public PlannerInspections inspections(
            LocalDate annualOn,
            LocalDate eltOn,
            LocalDate staticCheckOn,
            LocalDate transponderCheckOn,
            Double hundredHourAtHours,
            LocalDate vorCheckOn,
            String vorCheckKind,
            Double vorCheckErrorDeg) {
        PlannerInspectionsAsk ask = new PlannerInspectionsAsk()
                .annualOn(annualOn)
                .eltOn(eltOn)
                .staticCheckOn(staticCheckOn)
                .transponderCheckOn(transponderCheckOn)
                .hundredHourAtHours(decimal(hundredHourAtHours));
        if (vorCheckOn != null && vorCheckKind != null && vorCheckErrorDeg != null) {
            ask.vorCheck(new PlannerVorCheckAsk(
                    decimal(vorCheckErrorDeg), PlannerVorCheckAsk.KindEnum.fromValue(vorCheckKind), vorCheckOn));
        }
        return answer("/api/aircraft/inspections", ask, PlannerInspections.class, "the inspections", i -> i);
    }

    /** A JSON number, which the generated types hold as BigDecimal (the
     *  pom says why), as the Double this app keeps; null where none. */
    public static Double number(BigDecimal n) {
        return n == null ? null : n.doubleValue();
    }

    private static BigDecimal decimal(Double d) {
        return d == null ? null : BigDecimal.valueOf(d);
    }

    /** The planner's {@code path} read, with any {@code headers} (name, value, ...),
     *  into the generated {@code type} (CrashDraftMail, CheckpointNotesClient). */
    <A> A get(String path, Class<A> type, String what, String... headers) {
        HttpRequest.Builder request =
                HttpRequest.newBuilder(URI.create(plannerBaseUrl + path)).timeout(RULE_TIMEOUT);
        if (headers.length > 0) {
            request.headers(headers);
        }
        return read(sendAgainOnce(request.build(), what), type, what, a -> a);
    }

    /** {@code json} posted to the planner's {@code path} as it is, never
     *  parsed here (ChangeLines' briefings), its answer read into {@code type}. */
    <A> A postJson(String path, String json, Class<A> type, String what) {
        return read(post(path, json, what), type, what, a -> a);
    }

    /** {@code ask} sent to the planner's {@code path}, its answer read into
     *  the generated {@code type} and made into what the caller keeps. */
    private <A, T> T answer(String path, Object ask, Class<A> type, String what, Function<A, T> made) {
        String body;
        try {
            body = DATES.writeValueAsString(ask);
        } catch (JacksonException unwritable) {
            throw new IllegalStateException("the ask for " + what + " could not be written", unwritable);
        }
        return read(post(path, body, what), type, what, made);
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
    String post(String path, String body, String what) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(plannerBaseUrl + path))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(RULE_TIMEOUT)
                .build();
        return sendAgainOnce(request, what);
    }

    private String sendAgainOnce(HttpRequest asked, String what) {
        HttpRequest request = traceHeaders.traced(asked);
        try {
            return send(http, request, "the planner", what);
        } catch (PlannerUnavailableException unreached) {
            if (!(unreached.getCause() instanceof IOException)
                    || unreached.getCause() instanceof HttpTimeoutException) {
                throw unreached;
            }
            try (HttpClient fresh = newClient()) {
                return send(fresh, request, "the planner", what);
            }
        }
    }

    /** A field the planner always sends that is missing is not its answer
     *  either: the generated types box every value, so it shows as a
     *  NullPointerException where it is made into this app's own. */
    private static <A, T> T read(String answer, Class<A> type, String what, Function<A, T> made) {
        try {
            return made.apply(DATES.readValue(answer, type));
        } catch (JacksonException | NullPointerException notItsAnswer) {
            throw new PlannerUnavailableException(
                    "the planner's answer to " + what + " was not its answer", notItsAnswer);
        }
    }

    private String send(HttpRequest request, String who, String what) {
        return send(http, traceHeaders.traced(request), who, what);
    }

    private static String send(HttpClient client, HttpRequest request, String who, String what) {
        try {
            HttpResponse<String> response =
                    client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                throw new PlannerUnavailableException(who + " answered " + response.statusCode() + " to " + what);
            }
            return response.body();
        } catch (IOException failed) {
            throw new PlannerUnavailableException(who + " could not be reached for " + what, failed);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new PlannerUnavailableException("interrupted asking " + who + " for " + what, interrupted);
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
