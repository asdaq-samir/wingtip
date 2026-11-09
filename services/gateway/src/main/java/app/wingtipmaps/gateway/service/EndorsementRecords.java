package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.FlightSummaryDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.dto.SignedEndorsementDto;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * What a student's endorsements say, read the same way for the student's
 * own Checkride page and for their instructor: the endorsements held --
 * recorded from paper (Endorsement) or signed in the app
 * (SignedEndorsement), a voided one not held -- sent to the engine
 * through the planner (PlannerClient#endorsements), which says the day
 * each runs out and what a solo cross-country's review can tell from them.
 */
final class EndorsementRecords {

    /** As AC 61-65K's samples write a date, "12-31-2026". */
    static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("MM-dd-yyyy", Locale.US);

    private EndorsementRecords() {}

    /** The endorsements a student holds, recorded from paper and signed in
     *  the app, a voided one not held, as the engine reads them. */
    static List<PlannerHeldEndorsement> held(List<Endorsement> recorded, List<SignedEndorsement> signed) {
        return Stream.concat(
                recorded.stream().map(e -> PlannerClient.held(e.getKey().code(), e.getEndorsedOn(), null)),
                signed.stream().filter(e -> !e.isVoided()).map(e -> PlannerClient.held(e.getCode(), e.getSignedOn(), e.getFields().get("mm"))))
                .toList();
    }

    /** Each signed endorsement's last good day, in order, the engine's
     *  (null for one that does not run out); none asked of none. */
    static List<LocalDate> untilOf(PlannerClient planner, List<SignedEndorsement> signed) {
        return signed.isEmpty() ? List.of() : planner.endorsements(
                signed.stream().map(e -> PlannerClient.held(e.getCode(), e.getSignedOn(), null)).toList(), null).getUntil();
    }

    /** The signed endorsements as they are sent, each with its last good day. */
    static List<SignedEndorsementDto> dtos(PlannerClient planner, List<SignedEndorsement> signed) {
        List<LocalDate> until = untilOf(planner, signed);
        return java.util.stream.IntStream.range(0, signed.size()).mapToObj(i -> dto(signed.get(i), until.get(i))).toList();
    }

    static SignedEndorsementDto dto(SignedEndorsement e, LocalDate until) {
        return new SignedEndorsementDto(e.getId(), e.getCode(), e.getStudentName(), e.getFields(), e.getText(), e.getSignature(),
                e.getSignedOn(), until, e.isVoided(), e.getDigest());
    }

    /**
     * What the student's record answers of 14 CFR 61.93(d) for a solo
     * cross-country on {@code flightOn} -- (4) a solo cross-country
     * endorsement and (5) a solo endorsement current on the day -- the
     * engine's (endorsement_records). The rest of (d) -- the planning
     * correct, the weather flyable under VFR, the student proficient -- is
     * the instructor's own to determine, and the sheet asks it of them.
     */
    static List<ReviewCheckDto> checks(PlannerClient planner, LocalDate flightOn, List<Endorsement> recorded, List<SignedEndorsement> signed) {
        return planner.endorsements(held(recorded, signed), flightOn).getChecks().stream().map(PlannerClient::checkOf).toList();
    }

    /** The name an endorsement gives a pilot: theirs as their certificate
     *  gives it, else the one they signed in with. */
    static String nameOf(Pilot pilot) {
        return pilot.getFullName() == null || pilot.getFullName().isBlank() ? pilot.getDisplayName() : pilot.getFullName();
    }

    static CrossCountryReviewDto dto(PlannerClient planner, CrossCountryReview r, List<ReviewCheckDto> checks) {
        SignedEndorsement e = r.getEndorsement();
        return new CrossCountryReviewDto(r.getId(), r.getStudent().getId(), nameOf(r.getStudent()), nameOf(r.getInstructor()),
                FlightSummaryDto.of(r.getFlight()), r.getMakeModel(), r.getFlightOn(), r.getNote(), r.getAskedAt(), checks,
                e == null ? null : dtos(planner, List.of(e)).get(0), r.getDeclinedNote(), r.getAnsweredAt());
    }
}
