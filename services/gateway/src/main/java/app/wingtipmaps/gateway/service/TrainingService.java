package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.ApproachLessonDto;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.EndorsementDto;
import app.wingtipmaps.gateway.dto.InstructorLinkDto;
import app.wingtipmaps.gateway.dto.SignedEndorsementDto;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.InstructorLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;

/**
 * A student's way to the private pilot checkride, kept beside the
 * logbook: 14 CFR 61.109(a)'s aeronautical experience item by item, as
 * the engine works it out from the logbook (asked through the planner,
 * PlannerClient#experience) -- with the ACS codes on their knowledge test
 * report and their instructor's endorsements, recorded by the student
 * from paper, or signed in the app by an instructor they asked in
 * (InstructorService). As with currency, none of this is anyone's
 * sign-off: the instructor's endorsement for the practical test is
 * (61.39(a)(6)).
 */
@Service
public class TrainingService {

    private final EndorsementRepository endorsements;
    private final PilotRepository pilots;
    private final SignedEndorsementRepository signed;
    private final InstructorLinkRepository links;
    private final CrossCountryReviewRepository reviews;
    private final LessonService lessons;
    private final PlannerClient planner;
    private final TransactionOperations read;

    public TrainingService(
            EndorsementRepository endorsements,
            PilotRepository pilots,
            SignedEndorsementRepository signed,
            InstructorLinkRepository links,
            CrossCountryReviewRepository reviews,
            LessonService lessons,
            PlannerClient planner,
            PlatformTransactionManager transactions) {
        this.endorsements = endorsements;
        this.pilots = pilots;
        this.signed = signed;
        this.links = links;
        this.reviews = reviews;
        this.lessons = lessons;
        this.planner = planner;
        this.read = ReadOnly.transactions(transactions);
    }

    /** The pilot's own record. */
    public TrainingDto training(Pilot pilot, List<LogbookEntry> entries, LocalDate today) {
        return record(pilot, entries, today, null);
    }

    /** A student's record as one of their instructors reads it: their
     *  other instructors, and what they put to them, left out. */
    public TrainingDto trainingFor(Pilot instructor, Pilot student, List<LogbookEntry> entries, LocalDate today) {
        return record(student, entries, today, instructor);
    }

    /** What the record holds, read in one short transaction, with the
     *  planner's asks gathered and its figures still to fill in. */
    private record Read(
            List<Endorsement> paper,
            int paperUntil,
            List<SignedEndorsementDto> theirs,
            int theirUntil,
            List<InstructorLinkDto> instructors,
            List<CrossCountryReviewDto> asked,
            List<Integer> checksOf,
            List<ApproachLessonDto> lessons) {}

    /**
     * The record read in a read-only transaction, then every rule it needs
     * asked of the planner in one call after it, with no connection held
     * (RecordsAsks): 61.109(a)'s experience, each paper and signed
     * endorsement's last good day, and 61.93(d)'s checks once a day flown.
     * Each review's endorsement is one of the student's signed list, so
     * its last good day is that list's.
     */
    private TrainingDto record(Pilot pilot, List<LogbookEntry> entries, LocalDate today, Pilot instructor) {
        RecordsAsks asks = new RecordsAsks();
        int experience = asks.experience(pilot.getId(), () -> entries, today);
        Read read = this.read.execute(tx -> read(pilot, instructor, asks));
        RecordsAsks.Answers answers = asks.ask(planner);
        List<SignedEndorsementDto> theirs = answers.until(read.theirUntil(), read.theirs());
        Map<Long, SignedEndorsementDto> theirById = new HashMap<>();
        theirs.forEach(d -> theirById.putIfAbsent(d.id(), d));
        List<CrossCountryReviewDto> asked = java.util.stream.IntStream.range(
                        0, read.asked().size())
                .mapToObj(i -> {
                    CrossCountryReviewDto r = read.asked().get(i);
                    SignedEndorsementDto e = r.endorsement();
                    return r.withAnswers(
                            answers.checks(read.checksOf().get(i)),
                            e == null ? null : theirById.getOrDefault(e.id(), e));
                })
                .toList();
        List<LocalDate> paperUntil = read.paperUntil() < 0
                ? List.of()
                : answers.endorsements(read.paperUntil()).getUntil();
        List<Endorsement> paper = read.paper();
        return new TrainingDto(
                answers.experience(experience),
                codesOf(pilot),
                java.util.stream.IntStream.range(0, paper.size())
                        .mapToObj(i -> new EndorsementDto(
                                paper.get(i).getKey().code(), paper.get(i).getEndorsedOn(), paperUntil.get(i)))
                        .toList(),
                theirs,
                planner.endorsementKinds(),
                pilot.getFullName(),
                read.instructors(),
                asked,
                read.lessons());
    }

    private Read read(Pilot pilot, Pilot instructor, RecordsAsks asks) {
        List<Endorsement> paper = endorsements.findByKeyPilotIdOrderByKeyCode(pilot.getId());
        List<SignedEndorsement> theirs = signed.findByStudentIdOrderBySignedAtDesc(pilot.getId());
        List<InstructorLinkDto> instructors = links.findByStudentIdOrderByAskedAt(pilot.getId()).stream()
                .filter(l -> instructor == null
                        || (l.isAccepted() && l.getInstructor().getId().equals(instructor.getId())))
                .map(l -> new InstructorLinkDto(
                        l.getId(),
                        l.getEmail(),
                        l.isAccepted() ? EndorsementRecords.nameOf(l.getInstructor()) : null,
                        l.isAccepted() ? l.getInstructor().getInstructorCertificate() : null,
                        l.isAccepted(),
                        l.getAskedAt()))
                .toList();
        List<CrossCountryReview> reviewed = instructor == null
                ? reviews.findByStudentIdOrderByAskedAtDesc(pilot.getId())
                : reviews.findByStudentIdAndInstructorIdOrderByAskedAtDesc(pilot.getId(), instructor.getId());
        // A review's endorsement is one the student holds, so its last good
        // day is the signed list's, filled in after the planner is asked.
        List<CrossCountryReviewDto> asked = new ArrayList<>();
        List<Integer> checksOf = new ArrayList<>();
        for (CrossCountryReview r : reviewed) {
            asked.add(EndorsementRecords.dto(r, List.of(), e -> EndorsementRecords.dto(e, null)));
            // 61.93(d)'s checks once a day flown, not once a review.
            checksOf.add(asks.endorsements(
                    List.of("checks", r.getFlightOn()), () -> EndorsementRecords.held(paper, theirs), r.getFlightOn()));
        }
        int paperUntil = paper.isEmpty()
                ? -1
                : asks.endorsements(
                        "paper",
                        () -> paper.stream()
                                .map(e -> PlannerAsks.held(e.getKey().code(), e.getEndorsedOn(), null))
                                .toList(),
                        null);
        return new Read(
                paper,
                paperUntil,
                theirs.stream().map(e -> EndorsementRecords.dto(e, null)).toList(),
                asks.untilOf("signed", theirs),
                instructors,
                asked,
                checksOf,
                lessons.lessonsOf(pilot, instructor));
    }

    @Transactional
    public Pilot setKnowledgeTestCodes(Pilot pilot, List<String> codes) {
        pilot.setKnowledgeTestCodes(
                codes.isEmpty()
                        ? null
                        : String.join(" ", codes.stream().distinct().toList()));
        return pilots.save(pilot);
    }

    /** Whether {@code code} is one of AC 61-65K's endorsements, as the
     *  engine's catalogue has them (asked through the planner). */
    public boolean isEndorsement(String code) {
        return planner.endorsementKind(code).isPresent();
    }

    @Transactional
    public void endorse(Pilot pilot, String code, LocalDate endorsedOn) {
        Endorsement.Key key = new Endorsement.Key(pilot.getId(), code);
        endorsements
                .findById(key)
                .ifPresentOrElse(
                        e -> e.endorsedOn(endorsedOn),
                        () -> endorsements.save(new Endorsement(pilot.getId(), code, endorsedOn)));
    }

    /** @return true if the endorsement was there to take out */
    @Transactional
    public boolean withdraw(Pilot pilot, String code) {
        Endorsement.Key key = new Endorsement.Key(pilot.getId(), code);
        if (!endorsements.existsById(key)) {
            return false;
        }
        endorsements.deleteById(key);
        return true;
    }

    static List<String> codesOf(Pilot pilot) {
        String codes = pilot.getKnowledgeTestCodes();
        return codes == null || codes.isBlank()
                ? List.of()
                : Arrays.asList(codes.trim().split("\\s+"));
    }
}
