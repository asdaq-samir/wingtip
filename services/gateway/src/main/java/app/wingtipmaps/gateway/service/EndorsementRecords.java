package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.FlightSummaryDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.dto.SignedEndorsementDto;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * What a student's endorsements say, read the same way for the student's
 * own Checkride page and for their instructor: the endorsements held --
 * recorded from paper (Endorsement) or signed in the app
 * (SignedEndorsement), a voided one not held -- sent to the engine
 * through the planner (RecordsAsks, PlannerClient#records), which says the
 * day each runs out and what a solo cross-country's review can tell from
 * them: 14 CFR 61.93(d)(4) and (5) for a solo cross-country's day, the
 * rest of (d) being the instructor's own to determine.
 */
final class EndorsementRecords {

    /** As AC 61-65K's samples write a date, "12-31-2026". */
    static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("MM-dd-yyyy", Locale.US);

    private EndorsementRecords() {}

    /** The endorsements a student holds, recorded from paper and signed in
     *  the app, a voided one or one whose instructor was not verified not
     *  held, as the engine reads them. */
    static List<PlannerHeldEndorsement> held(List<Endorsement> recorded, List<SignedEndorsement> signed) {
        return Stream.concat(
                        // A paper endorsement's make and model, where the
                        // pilot recorded it (61.87(n), 61.93(c)(2)).
                        recorded.stream()
                                .map(e -> PlannerAsks.held(e.getKey().code(), e.getEndorsedOn(), e.getMakeModel())),
                        signed.stream()
                                // The engine's verdicts kept: voided, or its instructor
                                // not borne out by the FAA registry, it is not held.
                                .filter(e -> !e.isVoided() && e.isInstructorVerified())
                                .map(e -> PlannerAsks.held(
                                        e.getCode(),
                                        e.getSignedOn(),
                                        e.getFields().get("mm"))))
                .toList();
    }

    /** A signed endorsement as sent, with its last good day (null until
     *  the planner is asked, or where it does not run out). */
    static SignedEndorsementDto dto(SignedEndorsement e, LocalDate until) {
        return new SignedEndorsementDto(
                e.getId(),
                e.getCode(),
                e.getStudentName(),
                e.getFields(),
                e.getText(),
                e.getSignature(),
                e.getSignedOn(),
                until,
                e.isVoided(),
                e.getDigest(),
                e.isInstructorVerified(),
                e.getVerification());
    }

    /** The name an endorsement gives a pilot: theirs as their certificate
     *  gives it, else the one they signed in with. */
    static String nameOf(Pilot pilot) {
        return pilot.getFullName() == null || pilot.getFullName().isBlank()
                ? pilot.getDisplayName()
                : pilot.getFullName();
    }

    /** A review as sent, its endorsement as {@code signedDto} gives it.
     *  The pages read it with no checks and no last good day, and fill
     *  both in from the planner's one answer after (RecordsAsks). */
    static CrossCountryReviewDto dto(
            CrossCountryReview r,
            List<ReviewCheckDto> checks,
            Function<SignedEndorsement, SignedEndorsementDto> signedDto) {
        SignedEndorsement e = r.getEndorsement();
        return new CrossCountryReviewDto(
                r.getId(),
                r.getStudent().getId(),
                nameOf(r.getStudent()),
                nameOf(r.getInstructor()),
                FlightSummaryDto.of(r.getFlight()),
                r.getMakeModel(),
                r.getFlightOn(),
                r.getNote(),
                r.getAskedAt(),
                checks,
                e == null ? null : signedDto.apply(e),
                r.getDeclinedNote(),
                r.getAnsweredAt());
    }
}
