package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AssignLessonRequest;
import app.wingtipmaps.gateway.dto.DeclineRequest;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.dto.InstructorRequest;
import app.wingtipmaps.gateway.dto.SignRequest;
import app.wingtipmaps.gateway.dto.TrackDto;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.service.InstructorService;
import app.wingtipmaps.gateway.service.LessonService;
import app.wingtipmaps.gateway.service.LogbookService;
import app.wingtipmaps.gateway.service.TrainingService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.LocalDate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A pilot as a flight instructor (see {@link InstructorService}): their
 * certificate, the students who asked them in, each student's record,
 * the endorsements they sign and void, the solo cross-countries put to
 * them, and the approaches they set as lessons (LessonService). Pilot-scoped: 401 signed out; a student not theirs is 404.
 */
@RestController
@RequestMapping("/api/instructor")
public class InstructorController {

    private final InstructorService instructors;
    private final LessonService lessons;
    private final TrainingService training;
    private final LogbookService logbook;

    public InstructorController(
            InstructorService instructors, LessonService lessons, TrainingService training, LogbookService logbook) {
        this.instructors = instructors;
        this.lessons = lessons;
        this.training = training;
        this.logbook = logbook;
    }

    @GetMapping
    public ResponseEntity<InstructorDto> get(Pilot pilot) {
        return ResponseEntity.ok(page(pilot));
    }

    /** Their certificate as endorsements print it, and their name. */
    @PutMapping
    public ResponseEntity<InstructorDto> set(Pilot pilot, @Valid @RequestBody InstructorRequest request) {
        instructors.setInstructor(pilot, request);
        return ResponseEntity.ok(page(pilot));
    }

    /** No longer an instructor: what they signed stays signed. */
    @DeleteMapping
    public ResponseEntity<InstructorDto> stop(Pilot pilot) {
        instructors.stopInstructing(pilot);
        return ResponseEntity.ok(page(pilot));
    }

    /** A student's ask taken, where it was made of this pilot's address. */
    @PostMapping("/students/{linkId}/accept")
    public ResponseEntity<InstructorDto> accept(Pilot pilot, @PathVariable Long linkId) {
        return changed(pilot, instructors.accept(pilot, linkId, Instant.now()));
    }

    /** An ask turned down, or a student given up. */
    @DeleteMapping("/students/{linkId}")
    public ResponseEntity<InstructorDto> leave(Pilot pilot, @PathVariable Long linkId) {
        return changed(pilot, instructors.leave(pilot, linkId));
    }

    /** One student's record, as their instructor reads it. */
    @GetMapping("/students/{studentId}/training")
    public ResponseEntity<TrainingDto> student(Pilot pilot, @PathVariable Long studentId) {
        return ResponseEntity.of(instructors.student(pilot, studentId).map(student -> recordOf(pilot, student)));
    }

    /** An endorsement signed for one of their students: 400 a field
     *  missing or a day not today, 409 the words not what the fields make,
     *  their certificate not given, or the student's name not given. A
     *  certificate past its date (14 CFR 61.197(a), (e)) is signed with,
     *  the screens having warned: the app never refuses on it. */
    @PostMapping("/students/{studentId}/endorsements")
    public ResponseEntity<TrainingDto> sign(
            Pilot pilot, @PathVariable Long studentId, @Valid @RequestBody SignRequest request) {
        return ResponseEntity.of(instructors.student(pilot, studentId).map(student -> {
            instructors.sign(pilot, student, request, Instant.now());
            return recordOf(pilot, student);
        }));
    }

    /** An approach set as a lesson for one of their students, who is
     *  emailed: 409 the same one set them already and not yet quizzed. */
    @PostMapping("/students/{studentId}/lessons")
    public ResponseEntity<TrainingDto> assignLesson(
            Pilot pilot, @PathVariable Long studentId, @Valid @RequestBody AssignLessonRequest request) {
        return ResponseEntity.of(instructors.student(pilot, studentId).map(student -> {
            lessons.assign(pilot, student, request, Instant.now());
            return recordOf(pilot, student);
        }));
    }

    /** A lesson they set taken back. */
    @DeleteMapping("/students/{studentId}/lessons/{id}")
    public ResponseEntity<TrainingDto> removeLesson(Pilot pilot, @PathVariable Long studentId, @PathVariable Long id) {
        return ResponseEntity.of(instructors
                .student(pilot, studentId)
                .filter(student -> lessons.remove(pilot, studentId, id))
                .map(student -> recordOf(pilot, student)));
    }

    /** The track of a flight the student put to them, for its approach to
     *  be debriefed against a lesson's: 404 for any other flight. */
    @GetMapping("/students/{studentId}/flights/{flightId}/track")
    public ResponseEntity<TrackDto> reviewedTrack(
            Pilot pilot, @PathVariable Long studentId, @PathVariable Long flightId) {
        return ResponseEntity.of(lessons.reviewedTrack(pilot, studentId, flightId));
    }

    /** One they signed, voided for a correction. */
    @PostMapping("/endorsements/{id}/void")
    public ResponseEntity<InstructorDto> voidEndorsement(Pilot pilot, @PathVariable Long id) {
        return changed(pilot, instructors.voidEndorsement(pilot, id, Instant.now()));
    }

    /** A solo cross-country turned down, and why. */
    @PostMapping("/reviews/{id}/decline")
    public ResponseEntity<InstructorDto> decline(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody DeclineRequest request) {
        return changed(pilot, instructors.decline(pilot, id, request.note(), Instant.now()));
    }

    private ResponseEntity<InstructorDto> changed(Pilot pilot, boolean changed) {
        return changed
                ? ResponseEntity.ok(page(pilot))
                : ResponseEntity.notFound().build();
    }

    private InstructorDto page(Pilot pilot) {
        return instructors.instructor(pilot, Instant.now());
    }

    private TrainingDto recordOf(Pilot instructor, Pilot student) {
        return training.trainingFor(instructor, student, logbook.list(student), LocalDate.now());
    }
}
