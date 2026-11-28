package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.InstructorLink;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.dto.SignedEndorsementDto;
import app.wingtipmaps.gateway.dto.StudentDto;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.InstructorLinkRepository;
import app.wingtipmaps.gateway.repository.LogbookRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;

/**
 * An instructor's page (GET /api/instructor, and the answer to each of
 * their changes): their certificate, their students and the asks made of
 * them, each with how far along 61.109(a) they are and their solo
 * endorsement's day, the solo cross-countries waiting on them with
 * 61.93(d)'s checks, and what they signed in the last 3 years
 * (61.189(c)). The rules are the engine's, through the planner.
 */
@Component
class InstructorPage {

    private final InstructorLinkRepository links;
    private final SignedEndorsementRepository signed;
    private final CrossCountryReviewRepository reviews;
    private final EndorsementRepository recorded;
    private final LogbookRepository logbook;
    private final PlannerClient planner;
    private final TransactionOperations read;

    InstructorPage(
            InstructorLinkRepository links,
            SignedEndorsementRepository signed,
            CrossCountryReviewRepository reviews,
            EndorsementRepository recorded,
            LogbookRepository logbook,
            PlannerClient planner,
            PlatformTransactionManager transactions) {
        this.links = links;
        this.signed = signed;
        this.reviews = reviews;
        this.recorded = recorded;
        this.logbook = logbook;
        this.planner = planner;
        this.read = ReadOnly.transactions(transactions);
    }

    /** The instructor's page: their certificate, students, asks, reviews
     *  waiting and their record of the last 3 years.
     *
     *  <p>Read in one short read-only transaction -- each student's
     *  logbook, paper and signed endorsements once, however many of their
     *  reviews wait -- then every rule the page needs asked of the planner
     *  in one call after it, with no connection held (RecordsAsks). For 10
     *  students and 5 reviews that was about 70 queries and 31 planner
     *  calls one after another inside the transaction. */
    InstructorDto of(Pilot pilot, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        // As far back as 14 CFR 61.189(c) has them keep it: the engine's.
        Instant since = planner.instructorRecordsSince(today)
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant();
        RecordsAsks asks = new RecordsAsks();
        Page page = read.execute(tx -> page(pilot, since, today, asks));
        RecordsAsks.Answers answers = asks.ask(planner);
        return new InstructorDto(
                pilot.getFullName(),
                pilot.getInstructorCertificate(),
                pilot.getInstructorUntil(),
                pilot.getInstructorUntilKind(),
                page.students().stream().map(st -> st.answered(answers)).toList(),
                page.asking().stream().map(st -> st.answered(answers)).toList(),
                page.waiting().stream().map(r -> r.answered(answers)).toList(),
                answers.until(page.signedUntil(), page.signed()),
                planner.endorsementKinds());
    }

    /** The page as read, the planner's figures still to fill in. */
    private record Page(
            List<StudentRow> students,
            List<StudentRow> asking,
            List<ReviewRow> waiting,
            List<SignedEndorsementDto> signed,
            int signedUntil) {}

    /** A student or an ask, read, with the indexes of its experience and
     *  its solo endorsement's day among the asks. */
    private record StudentRow(StudentDto read, int experience, int solo) {
        StudentDto answered(RecordsAsks.Answers answers) {
            List<ExperienceItemDto> items = answers.experience(experience);
            return new StudentDto(
                    read.linkId(),
                    read.studentId(),
                    read.name(),
                    read.email(),
                    read.askedAt(),
                    read.accepted(),
                    (int) items.stream().filter(ExperienceItemDto::met).count(),
                    items.size(),
                    answers.endorsements(solo).getSoloUntil(),
                    read.reviewsWaiting());
        }
    }

    /** A review, read, with the indexes of its 61.93(d) checks and its
     *  endorsement's last good day (-1 for none) among the asks. */
    private record ReviewRow(CrossCountryReviewDto read, int checks, int until) {
        CrossCountryReviewDto answered(RecordsAsks.Answers answers) {
            SignedEndorsementDto e = read.endorsement();
            return read.withAnswers(
                    answers.checks(checks),
                    e == null ? null : answers.until(until, List.of(e)).get(0));
        }
    }

    /** A student's records, read once for the page. */
    private record Records(List<Endorsement> paper, List<SignedEndorsement> signed) {}

    private Page page(Pilot pilot, Instant since, LocalDate today, RecordsAsks asks) {
        Map<Long, Records> records = new HashMap<>();
        List<CrossCountryReview> unanswered =
                reviews.findByInstructorIdAndAnsweredAtIsNullOrderByAskedAt(pilot.getId());
        // Each student's reviews waiting on this instructor, counted from
        // the list above rather than asked again a student.
        Map<Long, Long> waitingBy = unanswered.stream()
                .collect(Collectors.groupingBy(r -> r.getStudent().getId(), Collectors.counting()));
        List<StudentRow> students = links.findByInstructorIdOrderByAcceptedAt(pilot.getId()).stream()
                .map(l -> studentOf(l, waitingBy.getOrDefault(l.getStudent().getId(), 0L), today, records, asks))
                .toList();
        List<StudentRow> asking = links.findOpenFor(pilot.getEmail()).stream()
                .map(l -> studentOf(l, 0L, today, records, asks))
                .toList();
        List<ReviewRow> waiting =
                unanswered.stream().map(r -> reviewOf(r, records, asks)).toList();
        List<SignedEndorsement> theirs =
                signed.findByInstructorIdAndSignedAtAfterOrderBySignedAtDesc(pilot.getId(), since);
        return new Page(
                students,
                asking,
                waiting,
                theirs.stream().map(e -> EndorsementRecords.dto(e, null)).toList(),
                asks.untilOf("signed", theirs));
    }

    private Records recordsOf(Long studentId, Map<Long, Records> records) {
        return records.computeIfAbsent(
                studentId,
                id -> new Records(
                        recorded.findByKeyPilotIdOrderByKeyCode(id), signed.findByStudentIdOrderBySignedAtDesc(id)));
    }

    /** A review as its instructor reads it, with what the student's record
     *  answers of 61.93(d) asked once a student and day. */
    private ReviewRow reviewOf(CrossCountryReview r, Map<Long, Records> records, RecordsAsks asks) {
        Long studentId = r.getStudent().getId();
        Records theirs = recordsOf(studentId, records);
        // 61.93(d)(4), (5): in the make and model the review names.
        int checks = asks.endorsements(
                List.of("checks", studentId, r.getFlightOn(), r.getMakeModel()),
                () -> EndorsementRecords.held(theirs.paper(), theirs.signed()),
                r.getFlightOn(),
                r.getMakeModel());
        SignedEndorsement e = r.getEndorsement();
        int until = e == null ? -1 : asks.untilOf(List.of("until", e.getId()), List.of(e));
        return new ReviewRow(EndorsementRecords.dto(r, List.of(), x -> EndorsementRecords.dto(x, null)), checks, until);
    }

    /** A student or an ask, with how many of their reviews wait on the
     *  instructor (none for an ask). */
    private StudentRow studentOf(
            InstructorLink l, long waiting, LocalDate today, Map<Long, Records> records, RecordsAsks asks) {
        Pilot student = l.getStudent();
        Records theirs = recordsOf(student.getId(), records);
        int experience = asks.experience(
                student.getId(), () -> logbook.findByPilotIdOrderByFlownOnDescIdDesc(student.getId()), today);
        int solo = asks.endorsements(
                List.of("solo", student.getId()),
                () -> EndorsementRecords.held(theirs.paper(), theirs.signed()),
                null,
                null);
        return new StudentRow(
                new StudentDto(
                        l.getId(),
                        student.getId(),
                        EndorsementRecords.nameOf(student),
                        student.getEmail(),
                        l.getAskedAt(),
                        l.isAccepted(),
                        0,
                        0,
                        null,
                        (int) waiting),
                experience,
                solo);
    }
}
