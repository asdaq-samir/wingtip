package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.EndorsementKindDto;
import app.wingtipmaps.gateway.dto.SignRequest;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFilled;
import app.wingtipmaps.gateway.planner.model.PlannerInstructorVerification;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * An instructor's signature on a student's endorsement, and its voiding
 * (the instructor and student found by InstructorService).
 *
 * <p>A signature, as AC 120-78B (December 2024) describes one, which 14
 * CFR part 61 asks no approval of (its 1.9.5) but recommends following:
 * the instructor signed in -- their account under their sole control, the
 * address theirs (2.1.2.2, 2.1.2.3); the words read before signing, and
 * signed only if they are what the fields make (2.2.4); the signature
 * line AC 61-65K asks of every endorsement -- signature, date, certificate
 * number and recent experience or expiration date; nothing changed once
 * signed, a correction voiding it for a new one (2.2.7, 2.2.8); and both
 * told by email that it was signed (2.2.3). An instructor whose recent
 * experience has run out (61.197(a)) or whose pre-December 2024
 * certificate has expired (61.19(d)(2), 61.197(e)) may not exercise its
 * privileges, but the app warns and never refuses (the owner's rule,
 * 2026-10-26): the screens say so before signing, and the signature line
 * carries the date, so the record shows it was past.
 */
@Service
public class EndorsementSigning {

    private final SignedEndorsementRepository signed;
    private final CrossCountryReviewRepository reviews;
    private final PlannerClient planner;
    private final InstructorMail mail;

    public EndorsementSigning(
            SignedEndorsementRepository signed,
            CrossCountryReviewRepository reviews,
            PlannerClient planner,
            InstructorMail mail) {
        this.signed = signed;
        this.reviews = reviews;
        this.planner = planner;
        this.mail = mail;
    }

    /** The code of AC 61-65K A.10's endorsement, a solo cross-country's
     *  planning reviewed (14 CFR 61.93(c)(3)): the one that answers a
     *  review a student put to the instructor. A record's key, the
     *  engine's catalogue (endorsement_kinds) gives its words. */
    static final String SOLO_XC_FLIGHT = "solo-xc-flight";

    /** The endorsement signed, and the student and the instructor emailed it. */
    @Transactional
    public SignedEndorsement sign(Pilot instructor, Pilot student, SignRequest request, Instant now) {
        if (!instructor.isInstructor() || instructor.getFullName() == null) {
            throw new InstructorRefusedException(
                    HttpStatus.CONFLICT, "Give your flight instructor certificate before signing.");
        }
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        // The instructor's own day, which west of Greenwich is a day behind
        // UTC's in the evening.
        if (request.signedOn().isBefore(today.minusDays(1))
                || request.signedOn().isAfter(today.plusDays(1))) {
            throw new InstructorRefusedException(HttpStatus.BAD_REQUEST, "An endorsement is signed with today's date.");
        }
        if (student.getFullName() == null || student.getFullName().isBlank()) {
            throw new InstructorRefusedException(
                    HttpStatus.CONFLICT, "The student has not given their name as on their certificate yet.");
        }
        // AC 61-65K's words and the fields they take are the engine's
        // (endorsement_kinds, endorsement_fill), asked through the planner.
        EndorsementKindDto kind = planner.endorsementKind(request.code())
                .orElseThrow(() -> new InstructorRefusedException(
                        HttpStatus.BAD_REQUEST, "No such endorsement: " + request.code() + "."));
        PlannerEndorsementFilled filled = planner.fill(kind.code(), student.getFullName(), request.fields());
        Map<String, String> fields = filled.getFields();
        List<String> missing = filled.getMissing();
        if (!missing.isEmpty()) {
            throw new InstructorRefusedException(
                    HttpStatus.BAD_REQUEST,
                    "Fill in " + String.join(", ", missing).toLowerCase(Locale.ROOT) + ".");
        }
        String text = filled.getText();
        if (!text.equals(request.text().replaceAll("\\s+", " ").strip())) {
            throw new InstructorRefusedException(
                    HttpStatus.CONFLICT, "The words have changed since you read them: read them again before signing.");
        }
        CrossCountryReview review = null;
        if (request.reviewId() != null) {
            review = reviews.findById(request.reviewId())
                    .filter(r -> r.getStudent().getId().equals(student.getId())
                            && r.getInstructor().getId().equals(instructor.getId()))
                    .orElseThrow(() -> new InstructorRefusedException(HttpStatus.NOT_FOUND, "No such review."));
            if (review.isAnswered() || !SOLO_XC_FLIGHT.equals(kind.code())) {
                throw new InstructorRefusedException(HttpStatus.CONFLICT, "That review has been answered.");
            }
        }
        String signature = signatureLine(instructor, request.signedOn());
        // Whether the FAA airmen registry bears the instructor out, the
        // engine's to say (instructor_verification): their name against
        // the registry's flight instructors, never the student themselves,
        // never a record another account here signs as (the deep security
        // review of 2026-11-21, N1). Kept with the record either way, as
        // the app warns and never refuses; only a verified one is held.
        PlannerInstructorVerification verdict = planner.verifyInstructor(
                instructor.getFullName(),
                student.getFullName(),
                request.signedOn(),
                signed.registryIdsSignedByOthers(instructor.getId()));
        SignedEndorsement endorsement = new SignedEndorsement(
                student,
                instructor,
                kind.code(),
                student.getFullName(),
                fields,
                text,
                signature,
                request.signedOn(),
                now,
                digest(text, signature, now));
        endorsement.verifiedAs(Boolean.TRUE.equals(verdict.getVerified()), verdict.getRegistryId(), verdict.getWords());
        endorsement = signed.save(endorsement);
        if (review != null) {
            review.endorsed(endorsement, now);
        }
        String said = kind.label() + " (AC 61-65K " + kind.paragraph() + ", 14 CFR " + kind.rule() + ")\n\n" + text
                + "\n\n" + signature + "\n\n" + verdict.getWords();
        mail.send(
                student.getEmail(),
                "Endorsed: " + kind.label(),
                EndorsementRecords.nameOf(instructor) + " has signed this endorsement for you in Wingtip Maps:\n\n"
                        + said + "\n\nIt is on your Checkride page, under Logbook." + mail.openLine());
        mail.send(
                instructor.getEmail(),
                "You signed: " + kind.label() + " for " + student.getFullName(),
                "You signed this endorsement in Wingtip Maps, kept with your students' records (14 CFR 61.189):\n\n"
                        + said);
        return endorsement;
    }

    /** A signed endorsement voided by the instructor who signed it, for a
     *  correction (AC 120-78B 2.2.8): it stays, marked void.
     *  @return false where there is no such endorsement of theirs in force */
    @Transactional
    public boolean voidEndorsement(Pilot instructor, Long id, Instant now) {
        return signed.findById(id)
                .filter(e -> e.getInstructor() != null
                        && e.getInstructor().getId().equals(instructor.getId())
                        && !e.isVoided())
                .map(e -> {
                    e.voidAt(now);
                    if (e.getStudent() != null) {
                        mail.send(
                                e.getStudent().getEmail(),
                                "Voided: "
                                        + planner.endorsementKind(e.getCode())
                                                .map(EndorsementKindDto::label)
                                                .orElse(e.getCode()),
                                EndorsementRecords.nameOf(instructor) + " has voided this endorsement of "
                                        + e.getSignedOn().format(EndorsementRecords.DAY) + ":\n\n" + e.getText()
                                        + "\n\n" + e.getSignature());
                    }
                    return true;
                })
                .orElse(false);
    }

    /** AC 61-65K's: "/s/ [date] J. J. Jones 987654321CFI RE 12-31-2026". */
    static String signatureLine(Pilot instructor, LocalDate signedOn) {
        return "/s/ " + EndorsementRecords.DAY.format(signedOn) + " " + instructor.getFullName() + " "
                + instructor.getInstructorCertificate() + " " + instructor.getInstructorUntilKind().words + " "
                + EndorsementRecords.DAY.format(instructor.getInstructorUntil());
    }

    /** SHA-256 of what was signed: the words, the signature line and the
     *  moment, each on its own line. */
    static String digest(String text, String signature, Instant at) {
        try {
            byte[] sum = MessageDigest.getInstance("SHA-256")
                    .digest((text + "\n" + signature + "\n" + at).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(sum);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
