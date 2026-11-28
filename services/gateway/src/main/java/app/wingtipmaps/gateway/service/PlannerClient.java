package app.wingtipmaps.gateway.service;

import static app.wingtipmaps.gateway.service.PlannerRules.ask;
import static app.wingtipmaps.gateway.service.PlannerRules.rule;
import static app.wingtipmaps.gateway.service.PlannerRules.sameLength;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.dto.AirplaneFlown;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.EndorsementFieldDto;
import app.wingtipmaps.gateway.dto.EndorsementKindDto;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.planner.model.PlannerCurrencyAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFillAsk;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFilled;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerFlying;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerInspectionsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerInstructorVerification;
import app.wingtipmaps.gateway.planner.model.PlannerInstructorVerificationAsk;
import app.wingtipmaps.gateway.planner.model.PlannerPilotNotes;
import app.wingtipmaps.gateway.planner.model.PlannerRecordsBatch;
import app.wingtipmaps.gateway.planner.model.PlannerRecordsBatchAsk;
import app.wingtipmaps.gateway.planner.model.PlannerSameField;
import app.wingtipmaps.gateway.planner.model.PlannerSameFieldAsk;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import app.wingtipmaps.gateway.upstream.BriefingApi;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * This app's one client of the planner on its own behalf
 * (a browser's request is {@link app.wingtipmaps.gateway.controller.PlannerProxyController}'s):
 * the flight watch's briefings and their changes (FlightWatchService,
 * ChangeLines), the engine's rules over a pilot's logbook and airplane, as
 * this app holds no aviation rule of its own (CLAUDE.md) and a pilot's notes
 * (CheckpointNotesClient). The
 * asking is Spring's HTTP interfaces (PlannerApi and BriefingApi,
 * made by UpstreamClients); here each answer is made into this app's own,
 * and any failure into a PlannerUnavailableException that says who and what.
 */
@Component
public class PlannerClient {

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
    PlannerWordsSources changeSources(String ask) {
        return rule("the changes", () -> planner.changeSources(ask), a -> a);
    }

    /** The checkpoint notes the pilot wrote for themselves (CheckpointNotesClient). */
    PlannerPilotNotes notes(Long pilotId) {
        return rule("the notes", () -> planner.notes(String.valueOf(pilotId)), a -> a);
    }

    /** The pilot's own checkpoint notes forgotten, the shared ones kept
     *  (CheckpointNotesClient): how many went. */
    int forgetNotes(Long pilotId) {
        return rule("the notes forgotten", () -> planner.forgetNotes(String.valueOf(pilotId)), f -> f.getRemoved());
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
        return currency(entries, flightReviewOn, medicalExpiresOn, ipcOn, today, null);
    }

    /** {@link #currency}, passengers judged for {@code flying}, the
     *  airplane to be flown (14 CFR 61.57(a)(1)(ii)); null judges the
     *  newest flight's. */
    public CurrencyDto currency(
            List<LogbookEntry> entries,
            LocalDate flightReviewOn,
            LocalDate medicalExpiresOn,
            LocalDate ipcOn,
            LocalDate today,
            @Nullable AirplaneFlown flying) {
        PlannerCurrencyAsk ask = new PlannerCurrencyAsk(PlannerAsks.entriesOf(entries), today)
                .flightReviewOn(flightReviewOn)
                .medicalExpiresOn(medicalExpiresOn)
                .ipcOn(ipcOn)
                .flying(
                        flying == null
                                ? null
                                : new PlannerFlying()
                                        .category(flying.category())
                                        .propertyClass(flying.aircraftClass())
                                        .tailwheel(flying.tailwheel()));
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
                        c.getTrackingInWindow(),
                        c.getPassengerClass(),
                        c.getPassengerTailwheel(),
                        c.getTailwheelPassengersUntil(),
                        c.getDayPassengersUnknown(),
                        c.getNightPassengersUnknown()));
    }

    /**
     * A student's private pilot experience on {@code today}, item by item
     * (POST /api/pilot/experience): 14 CFR 61.109(a), worked out by the
     * shared engine's pilot_experience.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<ExperienceItemDto> experience(List<LogbookEntry> entries, LocalDate today) {
        PlannerExperienceAsk ask = PlannerAsks.experienceAsk(entries, today);
        return rule("the experience", () -> planner.experience(ask), PlannerAsks::experienceOf);
    }

    /**
     * Many students' experience and endorsements in one round trip (POST
     * /api/pilot/records-batch): each answer as {@link #experience} and
     * {@link #endorsements} give it, in the order asked. An instructor's
     * page asked two a student and two a waiting review, one after another
     * (about 31 for 10 students); nothing is asked
     * of nothing.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses,
     *     or answers a list of another length
     */
    public PlannerRecordsBatch records(
            List<PlannerExperienceAsk> experience, List<PlannerEndorsementsAsk> endorsements) {
        if (experience.isEmpty() && endorsements.isEmpty()) {
            return new PlannerRecordsBatch().experience(List.of()).endorsements(List.of());
        }
        PlannerRecordsBatchAsk ask =
                new PlannerRecordsBatchAsk().experience(experience).endorsements(endorsements);
        String what = "the students' records";
        return rule(what, () -> planner.recordsBatch(ask), r -> {
            sameLength(what, r.getExperience().size(), experience.size());
            sameLength(what, r.getEndorsements().size(), endorsements.size());
            return r;
        });
    }

    /**
     * What a student's endorsements say (POST /api/pilot/endorsements, the
     * engine's endorsement_records): each one's last good day in order
     * (null where it does not run out), the day the solo endorsement runs
     * out (14 CFR 61.87(n), (p)), and 61.93(d)'s checks for a solo
     * cross-country on {@code flightOn} where it is given (PlannerAsks#checkOf),
     * in {@code makeModel}: 61.93(c)(2), (d)(4) and (5) hold the
     * endorsements to "the make and model of aircraft to be flown", and
     * with none the checks can't tell.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public PlannerEndorsements endorsements(
            List<PlannerHeldEndorsement> held, @Nullable LocalDate flightOn, @Nullable String makeModel) {
        PlannerEndorsementsAsk ask =
                new PlannerEndorsementsAsk(held).flightOn(flightOn).makeModel(makeModel);
        return rule("the endorsements", () -> planner.endorsements(ask), e -> e);
    }

    /**
     * For each of {@code idents}, in order, whether it names the field
     * {@code field} (POST /api/pilot/same-field: the engine's field_names
     * over NASR's record of each, so "BUR" is "KBUR" and "ANC" is "PANC");
     * nothing is asked of no idents. A planner that cannot be reached,
     * refuses, or answers a list of another length is a
     * PlannerUnavailableException, as {@link #records} says.
     */
    public List<Boolean> sameField(String field, List<String> idents) {
        if (idents.isEmpty()) {
            return List.of();
        }
        String what = "which flights landed at the lesson's field";
        return rule(
                what, () -> planner.sameField(new PlannerSameFieldAsk(field).idents(idents)), (PlannerSameField s) -> {
                    sameLength(what, s.getSame().size(), idents.size());
                    return List.copyOf(s.getSame());
                });
    }

    /** How long the endorsements' catalogue is kept: the catalogue as last
     *  asked, and when (null before the first ask). */
    static final Duration KINDS_KEPT = Duration.ofMinutes(10);

    private record Kinds(List<EndorsementKindDto> kinds, Instant at) {}

    private volatile @Nullable Kinds kinds;

    /**
     * AC 61-65K's endorsements a student meets, in order, word for word
     * (GET /api/pilot/endorsement-kinds, the engine's endorsement_kinds):
     * the catalogue the Checkride page lists, a student records from paper
     * and an instructor signs from. Its words change only with the
     * planner's build: kept KINDS_KEPT, not asked again on every page.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<EndorsementKindDto> endorsementKinds() {
        Kinds kept = kinds;
        Instant now = Instant.now();
        if (kept == null || now.isAfter(kept.at().plus(KINDS_KEPT))) {
            kept = new Kinds(askKinds(), now);
            kinds = kept;
        }
        return kept.kinds();
    }

    private List<EndorsementKindDto> askKinds() {
        return rule(
                "the endorsements' words",
                planner::endorsementKinds,
                all -> all.stream()
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

    /**
     * The first day an instructor's page lists what they signed (GET
     * /api/pilot/instructor-records-since, the engine's
     * instructor_records_since): 3 years before {@code today}, as 14 CFR
     * 61.189(c) has them keep the records.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public LocalDate instructorRecordsSince(LocalDate today) {
        // A pure answer of the day, the same all day: asked once a day,
        // not on every load of every instructor's page.
        Since kept = since;
        if (kept == null || !kept.today().equals(today)) {
            kept = new Since(
                    today,
                    rule(
                            "how far back an instructor's records go",
                            () -> planner.instructorRecordsSince(today.toString()),
                            d -> d));
            since = kept;
        }
        return kept.since();
    }

    private record Since(LocalDate today, LocalDate since) {}

    private volatile @Nullable Since since;

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
     * Whether the FAA airmen registry bears out the instructor about to sign
     * for a student (POST /api/pilot/instructor-verification, the engine's
     * instructor_verification): their name and the student's as on their
     * certificates, the day, and the registry records other accounts
     * already sign as. Only a verified endorsement counts as signed.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public PlannerInstructorVerification verifyInstructor(
            String instructor, String student, LocalDate signedOn, List<String> boundElsewhere) {
        PlannerInstructorVerificationAsk ask = new PlannerInstructorVerificationAsk(instructor, signedOn)
                .studentName(student)
                .boundElsewhere(boundElsewhere);
        return rule("the instructor's certificate", () -> planner.verifyInstructor(ask), v -> v);
    }

    /**
     * When each airplane's inspections and checks fall due, in the order
     * asked, in one round trip (POST /api/aircraft/inspections-batch, the
     * engine's inspections_due an airplane): 14 CFR 91.409(a) and (b),
     * 91.207(d), 91.411(a), 91.413(a), and 91.171 for the VOR check. Each
     * ask is PaperworkClient#askOf's; nothing is asked of none. An
     * aircraft list asked once an airplane.
     *
     * @throws PlannerUnavailableException where the planner is out of reach, refuses, or
     *     answers more or fewer airplanes than were asked
     */
    public List<PlannerInspections> inspections(List<PlannerInspectionsAsk> asks) {
        return asks.isEmpty() ? List.of() : inspectionsOf(planner, "the inspections", asks);
    }

    /** {@link #inspections}, for PaperworkClient too: one rule, one check
     *  of the answer's length. */
    static List<PlannerInspections> inspectionsOf(PlannerApi planner, String what, List<PlannerInspectionsAsk> asks) {
        return rule(what, () -> planner.inspectionsBatch(asks), all -> {
            sameLength(what, all.size(), asks.size());
            return List.copyOf(all);
        });
    }
}
