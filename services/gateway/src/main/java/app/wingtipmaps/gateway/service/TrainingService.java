package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.EndorsementDto;
import app.wingtipmaps.gateway.dto.InstructorLinkDto;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.InstructorLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public TrainingService(EndorsementRepository endorsements, PilotRepository pilots, SignedEndorsementRepository signed,
                           InstructorLinkRepository links, CrossCountryReviewRepository reviews, LessonService lessons,
                           PlannerClient planner) {
        this.endorsements = endorsements;
        this.pilots = pilots;
        this.signed = signed;
        this.links = links;
        this.reviews = reviews;
        this.lessons = lessons;
        this.planner = planner;
    }

    /** The pilot's own record. */
    @Transactional(readOnly = true)
    public TrainingDto training(Pilot pilot, List<LogbookEntry> entries, LocalDate today) {
        return record(pilot, entries, today, null);
    }

    /** A student's record as one of their instructors reads it: their
     *  other instructors, and what they put to them, left out. */
    @Transactional(readOnly = true)
    public TrainingDto trainingFor(Pilot instructor, Pilot student, List<LogbookEntry> entries, LocalDate today) {
        return record(student, entries, today, instructor);
    }

    private TrainingDto record(Pilot pilot, List<LogbookEntry> entries, LocalDate today, Pilot instructor) {
        List<Endorsement> paper = endorsements.findByKeyPilotIdOrderByKeyCode(pilot.getId());
        List<SignedEndorsement> theirs = signed.findByStudentIdOrderBySignedAtDesc(pilot.getId());
        List<InstructorLinkDto> instructors = links.findByStudentIdOrderByAskedAt(pilot.getId()).stream()
                .filter(l -> instructor == null || (l.isAccepted() && l.getInstructor().getId().equals(instructor.getId())))
                .map(l -> new InstructorLinkDto(l.getId(), l.getEmail(), l.isAccepted() ? EndorsementRecords.nameOf(l.getInstructor()) : null,
                        l.isAccepted() ? l.getInstructor().getInstructorCertificate() : null, l.isAccepted(), l.getAskedAt()))
                .toList();
        List<CrossCountryReviewDto> asked = (instructor == null
                ? reviews.findByStudentIdOrderByAskedAtDesc(pilot.getId())
                : reviews.findByStudentIdAndInstructorIdOrderByAskedAtDesc(pilot.getId(), instructor.getId())).stream()
                .map(r -> EndorsementRecords.dto(planner, r, EndorsementRecords.checks(planner, r.getFlightOn(), paper, theirs))).toList();
        // Each paper endorsement's last good day, the engine's, in order.
        List<LocalDate> paperUntil = paper.isEmpty() ? List.of() : planner.endorsements(paper.stream()
                .map(e -> new PlannerClient.Held(e.getKey().code(), e.getEndorsedOn(), null)).toList(), null).until();
        return new TrainingDto(planner.experience(entries, today), codesOf(pilot),
                java.util.stream.IntStream.range(0, paper.size()).mapToObj(i -> new EndorsementDto(paper.get(i).getKey().code(),
                        paper.get(i).getEndorsedOn(), paperUntil.get(i))).toList(),
                EndorsementRecords.dtos(planner, theirs),
                planner.endorsementKinds(), pilot.getFullName(), instructors, asked, lessons.lessonsOf(pilot, instructor));
    }

    @Transactional
    public Pilot setKnowledgeTestCodes(Pilot pilot, List<String> codes) {
        pilot.setKnowledgeTestCodes(codes.isEmpty() ? null : String.join(" ", codes.stream().distinct().toList()));
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
        endorsements.findById(key).ifPresentOrElse(
                e -> e.endorsedOn(endorsedOn), () -> endorsements.save(new Endorsement(pilot.getId(), code, endorsedOn)));
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
        return codes == null || codes.isBlank() ? List.of() : Arrays.asList(codes.trim().split("\\s+"));
    }

}
