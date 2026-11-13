package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.EndorsementFieldDto;
import app.wingtipmaps.gateway.dto.EndorsementKindDto;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.planner.model.PlannerCurrencyAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFillAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFilled;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerInspectionsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerLogbookEntry;
import app.wingtipmaps.gateway.planner.model.PlannerPilotNotes;
import app.wingtipmaps.gateway.planner.model.PlannerReviewCheck;
import app.wingtipmaps.gateway.planner.model.PlannerStudioDraft;
import app.wingtipmaps.gateway.planner.model.PlannerVorCheckAsk;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import app.wingtipmaps.gateway.upstream.BriefingApi;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.math.BigDecimal;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.core.retry.RetryPolicy;
import org.springframework.core.retry.RetryTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.util.RawValue;

/**
 * This app's one client of the planner on its own behalf
 * (a browser's request is {@link app.wingtipmaps.gateway.controller.PlannerProxyController}'s):
 * the flight watch's briefings and their changes (FlightWatchService,
 * ChangeLines), the engine's rules over a pilot's logbook and airplane, as
 * this app holds no aviation rule of its own (CLAUDE.md), a pilot's notes
 * (CheckpointNotesClient) and the Studio's drafts (CrashDraftMail). The
 * asking is Spring's HTTP interfaces (PlannerApi and BriefingApi,
 * made by UpstreamClients); here each answer is made into this app's own,
 * and any failure into a PlannerUnavailableException that says who and what.
 */
@Component
public class PlannerClient {

    /**
     * A rule is a pure answer from what is sent, so one that fails to reach
     * the planner is sent once more: the pooled connection may be one the
     * planner (uvicorn, 5 s keep-alive) closed while it sat idle, and the
     * JDK does not resend a POST on its own. That failed every rule asked
     * after a quiet minute -- a pilot's currency, a student's experience --
     * with "could not be reached", several at once (the end-of-wave browser
     * run, 2026-11-08). WingtipApplication also lets the JDK's pool drop a
     * connection before uvicorn does. A timeout is not tried again.
     */
    private static final RetryTemplate AGAIN_ONCE = new RetryTemplate(RetryPolicy.builder()
            .maxRetries(1)
            .delay(Duration.ZERO)
            .includes(ResourceAccessException.class)
            .excludes(HttpTimeoutException.class)
            .build());

    private final PlannerApi planner;
    private final BriefingApi briefings;

    public PlannerClient(PlannerApi planner, BriefingApi briefings) {
        this.planner = planner;
        this.briefings = briefings;
    }

    /**
     * The flight's briefing now, as the planner writes it (GET
     * /api/briefing), for the departure time and the flight's own time
     * en route, so the forecast covers the flight.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public String briefing(String dep, String dest, List<String> stops, Instant depart, Double eteMin) {
        String joined = stops == null || stops.isEmpty() ? null : String.join(",", stops);
        return ask(
                "the planner",
                "the briefing",
                () -> briefings.briefing(dep, dest, joined, DateTimeFormatter.ISO_INSTANT.format(depart), eteMin));
    }

    /** What changed between two briefings, as the planner lines it up (ChangeLines). */
    PlannerWordsSources changeSources(String dep, String dest, List<String> stops, String then, String now) {
        String body = changesAsk(dep, dest, stops, then, now);
        return rule("the changes", () -> planner.changeSources(body), a -> a);
    }

    /** The checkpoint notes the pilot wrote for themselves (CheckpointNotesClient). */
    PlannerPilotNotes notes(Long pilotId) {
        return rule("the notes", () -> planner.notes(String.valueOf(pilotId)), a -> a);
    }

    /** The Studio's ready drafts nobody has been mailed about (CrashDraftMail). */
    List<PlannerStudioDraft> draftsToNotice() {
        return rule("the crash drafts", planner::draftsToNotice, a -> a);
    }

    /** A draft marked as mailed about (CrashDraftMail). */
    void noticed(String id) {
        rule(
                "the crash draft's notice",
                () -> {
                    planner.noticed(id);
                    return id;
                },
                a -> a);
    }

    /** The changes' ask (ChangeLines):
     *  both briefings embedded as the JSON they already are, not as strings holding JSON. */
    static String changesAsk(String dep, String dest, List<String> stops, String then, String now) {
        ObjectNode body = JsonNodeFactory.instance.objectNode().put("dep", dep).put("dest", dest);
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
        return rule(
                "the currency",
                () -> planner.currency(ask),
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
        PlannerExperienceAsk ask = new PlannerExperienceAsk(entriesOf(entries), today);
        return rule(
                "the experience",
                () -> planner.experience(ask),
                items -> items.stream()
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
        PlannerEndorsementsAsk ask = new PlannerEndorsementsAsk(held).flightOn(flightOn);
        return rule("the endorsements", () -> planner.endorsements(ask), e -> e);
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
        return rule(
                "the endorsements' words",
                planner::endorsementKinds,
                kinds -> kinds.stream()
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
                        .toList());
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
        return rule("the endorsement's words", () -> planner.fill(ask), f -> f);
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
        return rule("the inspections", () -> planner.inspections(ask), i -> i);
    }

    /** A JSON number, which the generated types hold as BigDecimal (the
     *  pom says why), as the Double this app keeps; null where none. */
    public static Double number(BigDecimal n) {
        return n == null ? null : n.doubleValue();
    }

    private static BigDecimal decimal(Double d) {
        return d == null ? null : BigDecimal.valueOf(d);
    }

    /** A rule asked of the planner (sent again once where it could not be
     *  reached), its answer made into what the caller keeps. A field the
     *  planner always sends that is missing is not its answer either: the
     *  generated types box every value, so it shows as a
     *  NullPointerException where it is made into this app's own. */
    private static <A, T> T rule(String what, Supplier<A> call, Function<A, T> made) {
        A answer = ask("the planner", what, () -> AGAIN_ONCE.invoke(call));
        try {
            return made.apply(answer);
        } catch (NullPointerException notItsAnswer) {
            throw new PlannerUnavailableException(
                    "the planner's answer to " + what + " was not its answer", notItsAnswer);
        }
    }

    /** {@code call} made, its failure said as who could not answer what. */
    private static <A> A ask(String who, String what, Supplier<A> call) {
        try {
            return call.get();
        } catch (RestClientResponseException refused) {
            throw new PlannerUnavailableException(
                    who + " answered " + refused.getStatusCode().value() + " to " + what, refused);
        } catch (ResourceAccessException unreached) {
            throw new PlannerUnavailableException(who + " could not be reached for " + what, unreached);
        } catch (RestClientException notItsAnswer) {
            throw new PlannerUnavailableException(who + "'s answer to " + what + " was not its answer", notItsAnswer);
        }
    }
}
