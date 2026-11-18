package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Endorsement;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.InstructorLink;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.AskReviewRequest;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.dto.InstructorRequest;
import app.wingtipmaps.gateway.dto.StudentDto;
import app.wingtipmaps.gateway.repository.ApproachLessonRepository;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.InstructorLinkRepository;
import app.wingtipmaps.gateway.repository.LogbookRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.hibernate.Hibernate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Flight instructors and their students. A student asks an instructor in
 * by address; whoever signs in with that address takes it, and from then
 * sees the student's way to the checkride, the solo cross-countries put to
 * them, and signs endorsements in the app from AC 61-65K's samples.
 *
 * <p>The signature itself is EndorsementSigning's.
 */
@Service
public class InstructorService {

    /** Instructors a student may ask in a day: each ask is an email to an
     *  address of the student's choosing. */
    static final int ASKS_A_DAY = 5;

    private final PilotRepository pilots;
    private final InstructorLinkRepository links;
    private final SignedEndorsementRepository signed;
    private final CrossCountryReviewRepository reviews;
    private final EndorsementRepository recorded;
    private final FlightRepository flights;
    private final LogbookRepository logbook;
    private final ApproachLessonRepository lessons;
    private final InstructorMail mail;
    private final PlannerClient planner;

    public InstructorService(
            PilotRepository pilots,
            InstructorLinkRepository links,
            SignedEndorsementRepository signed,
            CrossCountryReviewRepository reviews,
            EndorsementRepository recorded,
            FlightRepository flights,
            LogbookRepository logbook,
            ApproachLessonRepository lessons,
            InstructorMail mail,
            PlannerClient planner) {
        this.pilots = pilots;
        this.links = links;
        this.signed = signed;
        this.reviews = reviews;
        this.recorded = recorded;
        this.flights = flights;
        this.logbook = logbook;
        this.lessons = lessons;
        this.mail = mail;
        this.planner = planner;
    }

    // ---- The student's side

    @Transactional
    public void setFullName(Pilot pilot, String fullName) {
        pilot.setFullName(fullName.strip().replaceAll("\\s+", " "));
        pilots.save(pilot);
    }

    /** An instructor asked in by address, and emailed. */
    @Transactional
    public void ask(Pilot student, String email, Instant now) {
        String address = email.strip();
        if (address.equalsIgnoreCase(student.getEmail())) {
            throw new InstructorRefusedException(
                    HttpStatus.BAD_REQUEST, "That is your own address: ask your instructor's.");
        }
        if (links.existsByStudentIdAndEmailIgnoreCase(student.getId(), address)) {
            throw new InstructorRefusedException(HttpStatus.CONFLICT, "You have already asked " + address + ".");
        }
        if (links.countByStudentIdAndAskedAtAfter(student.getId(), now.minus(Duration.ofDays(1))) >= ASKS_A_DAY) {
            throw new InstructorRefusedException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "You have asked " + ASKS_A_DAY + " instructors today: ask again tomorrow.");
        }
        links.save(new InstructorLink(student, address, now));
        String name = EndorsementRecords.nameOf(student);
        mail.send(
                address,
                name + " asks you to be their flight instructor",
                name + " (" + student.getEmail()
                        + ") has asked you to be their flight instructor in Wingtip Maps: to see their"
                        + " way to the checkride, review the planning of their solo cross-countries and sign their endorsements"
                        + " there.\n\nTo answer, sign in to Wingtip Maps with this address (" + address
                        + ") and open Logbook, then"
                        + " Students." + mail.openLine());
    }

    /** @return false where the student has no such instructor */
    @Transactional
    public boolean drop(Pilot student, Long linkId) {
        return links.findById(linkId)
                .filter(l -> l.getStudent().getId().equals(student.getId()))
                .map(l -> {
                    end(l);
                    return true;
                })
                .orElse(false);
    }

    /** A saved flight put to one of the student's instructors, who is
     *  emailed. */
    @Transactional
    public void askReview(Pilot student, AskReviewRequest request, Instant now) {
        InstructorLink link = links.findById(request.instructorId())
                .filter(l -> l.getStudent().getId().equals(student.getId()) && l.isAccepted())
                .orElseThrow(() -> new InstructorRefusedException(
                        HttpStatus.NOT_FOUND, "That instructor has not taken you on yet."));
        Flight flight = flights.findByIdAndPilotId(request.flightId(), student.getId())
                .orElseThrow(() -> new InstructorRefusedException(HttpStatus.NOT_FOUND, "No such flight of yours."));
        Pilot instructor = link.getInstructor();
        boolean waiting =
                reviews.findByStudentIdAndInstructorIdOrderByAskedAtDesc(student.getId(), instructor.getId()).stream()
                        .anyMatch(r -> !r.isAnswered() && r.getFlight().getId().equals(flight.getId()));
        if (waiting) {
            throw new InstructorRefusedException(
                    HttpStatus.CONFLICT, "This flight is already with " + EndorsementRecords.nameOf(instructor) + ".");
        }
        String note = Typed.text(request.note());
        reviews.save(new CrossCountryReview(
                student, instructor, flight, request.makeModel().strip(), request.flightOn(), note, now));
        String name = EndorsementRecords.nameOf(student);
        mail.send(
                instructor.getEmail(),
                name + " asks you to review a solo cross-country",
                name + " asks you to review the planning of their solo cross-country, "
                        + String.join(" ", route(flight)) + " in a "
                        + request.makeModel().strip() + " on "
                        + EndorsementRecords.DAY.format(request.flightOn()) + " (14 CFR 61.93(c)(3)).\n"
                        + (note == null ? "" : "\n\"" + note + "\"\n")
                        + "\nOpen Logbook, then Students, in Wingtip Maps to review it." + mail.openLine());
    }

    /** @return false where there is no such review of the student's still
     *  waiting */
    @Transactional
    public boolean withdrawReview(Pilot student, Long reviewId) {
        return reviews.findById(reviewId)
                .filter(r -> r.getStudent().getId().equals(student.getId()) && !r.isAnswered())
                .map(r -> {
                    reviews.delete(r);
                    return true;
                })
                .orElse(false);
    }

    // ---- The instructor's side

    @Transactional
    public void setInstructor(Pilot pilot, InstructorRequest request) {
        pilot.setFullName(request.fullName().strip().replaceAll("\\s+", " "));
        pilot.setInstructor(
                request.certificate().strip().toUpperCase(Locale.ROOT), request.until(), request.untilKind());
        pilots.save(pilot);
    }

    /** No longer an instructor here: what they signed stays signed, and
     *  their students stay theirs until either ends it. */
    @Transactional
    public void stopInstructing(Pilot pilot) {
        pilot.setInstructor(null, null, null);
        pilots.save(pilot);
    }

    /** A student's ask taken, where it was made of this pilot's address.
     *  @return false where there is no such ask */
    @Transactional
    public boolean accept(Pilot instructor, Long linkId, Instant now) {
        Optional<InstructorLink> ask = links.findById(linkId)
                .filter(l -> !l.isAccepted() && l.getEmail().equalsIgnoreCase(instructor.getEmail()));
        ask.ifPresent(l -> {
            // Asked at two of the instructor's addresses, say: one is enough.
            if (links.findByStudentIdAndInstructorId(l.getStudent().getId(), instructor.getId())
                    .isPresent()) {
                links.delete(l);
            } else {
                l.accept(instructor, now);
            }
        });
        return ask.isPresent();
    }

    /** An ask turned down, or a student given up.
     *  @return false where there is no such ask or student */
    @Transactional
    public boolean leave(Pilot instructor, Long linkId) {
        return links.findById(linkId)
                .filter(l -> l.isAccepted()
                        ? l.getInstructor().getId().equals(instructor.getId())
                        : l.getEmail().equalsIgnoreCase(instructor.getEmail()))
                .map(l -> {
                    end(l);
                    return true;
                })
                .orElse(false);
    }

    /** One of the instructor's students, loaded: read after this
     *  transaction, by the record and the signature. */
    @Transactional(readOnly = true)
    public Optional<Pilot> student(Pilot instructor, Long studentId) {
        return links.findByStudentIdAndInstructorId(studentId, instructor.getId())
                .map(l -> (Pilot) Hibernate.unproxy(l.getStudent()));
    }

    /** @return false where there is no such review waiting on them */
    @Transactional
    public boolean decline(Pilot instructor, Long reviewId, String note, Instant now) {
        return reviews.findById(reviewId)
                .filter(r -> r.getInstructor().getId().equals(instructor.getId()) && !r.isAnswered())
                .map(r -> {
                    r.declined(note.strip(), now);
                    mail.send(
                            r.getStudent().getEmail(),
                            "Not endorsed: " + String.join(" ", route(r.getFlight())),
                            EndorsementRecords.nameOf(instructor) + " has not endorsed your solo cross-country, "
                                    + String.join(" ", route(r.getFlight())) + " on "
                                    + EndorsementRecords.DAY.format(r.getFlightOn())
                                    + ":\n\n\"" + note.strip() + "\"" + mail.openLine());
                    return true;
                })
                .orElse(false);
    }

    /** The instructor's page: their certificate, students, asks, reviews
     *  waiting and their record of the last 3 years. */
    @Transactional(readOnly = true)
    public InstructorDto instructor(Pilot pilot, Instant now) {
        List<CrossCountryReview> unanswered =
                reviews.findByInstructorIdAndAnsweredAtIsNullOrderByAskedAt(pilot.getId());
        // Each student's reviews waiting on this instructor, counted from
        // the list above rather than asked again a student.
        Map<Long, Long> waitingBy = unanswered.stream()
                .collect(Collectors.groupingBy(r -> r.getStudent().getId(), Collectors.counting()));
        List<StudentDto> students = links.findByInstructorIdOrderByAcceptedAt(pilot.getId()).stream()
                .map(l -> studentOf(l, waitingBy.getOrDefault(l.getStudent().getId(), 0L)))
                .toList();
        List<StudentDto> asking = links.findOpenFor(pilot.getEmail()).stream()
                .map(l -> studentOf(l, 0L))
                .toList();
        List<CrossCountryReviewDto> waiting =
                unanswered.stream().map(this::reviewOf).toList();
        // As far back as 14 CFR 61.189(c) has them keep it: the engine's.
        Instant since = planner.instructorRecordsSince(LocalDate.ofInstant(now, ZoneOffset.UTC))
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant();
        return new InstructorDto(
                pilot.getFullName(),
                pilot.getInstructorCertificate(),
                pilot.getInstructorUntil(),
                pilot.getInstructorUntilKind(),
                students,
                asking,
                waiting,
                EndorsementRecords.dtos(
                        planner, signed.findByInstructorIdAndSignedAtAfterOrderBySignedAtDesc(pilot.getId(), since)),
                planner.endorsementKinds());
    }

    /** A review as its instructor or student reads it, with what the
     *  student's record answers of 61.93(d). */
    CrossCountryReviewDto reviewOf(CrossCountryReview r) {
        Long studentId = r.getStudent().getId();
        return EndorsementRecords.dto(
                planner,
                r,
                EndorsementRecords.checks(
                        planner,
                        r.getFlightOn(),
                        recorded.findByKeyPilotIdOrderByKeyCode(studentId),
                        signed.findByStudentIdOrderBySignedAtDesc(studentId)));
    }

    /** A student or an ask, with how many of their reviews wait on the
     *  instructor (none for an ask). */
    private StudentDto studentOf(InstructorLink l, long waiting) {
        Pilot student = l.getStudent();
        var experience = planner.experience(
                logbook.findByPilotIdOrderByFlownOnDescIdDesc(student.getId()), LocalDate.now(ZoneOffset.UTC));
        List<Endorsement> paper = recorded.findByKeyPilotIdOrderByKeyCode(student.getId());
        List<SignedEndorsement> theirs = signed.findByStudentIdOrderBySignedAtDesc(student.getId());
        return new StudentDto(
                l.getId(),
                student.getId(),
                EndorsementRecords.nameOf(student),
                student.getEmail(),
                l.getAskedAt(),
                l.isAccepted(),
                (int) experience.stream().filter(i -> i.met()).count(),
                experience.size(),
                planner.endorsements(EndorsementRecords.held(paper, theirs), null)
                        .getSoloUntil(),
                (int) waiting);
    }

    /** A link ended, by either: the reviews still waiting between the two
     *  go with it, and the approach lessons the instructor set (V30), which
     *  neither could open again. */
    private void end(InstructorLink l) {
        if (l.isAccepted()) {
            reviews
                    .findByStudentIdAndInstructorIdOrderByAskedAtDesc(
                            l.getStudent().getId(), l.getInstructor().getId())
                    .stream()
                    .filter(r -> !r.isAnswered())
                    .forEach(reviews::delete);
            lessons.deleteByStudentIdAndInstructorId(
                    l.getStudent().getId(), l.getInstructor().getId());
        }
        links.delete(l);
    }

    /** The flight's airports in order: departure, stops, destination. */
    static List<String> route(Flight f) {
        return Stream.concat(
                        Stream.concat(Stream.of(f.getDepartureIdent()), f.getStops().stream()),
                        Stream.of(f.getDestinationIdent()))
                .toList();
    }
}
