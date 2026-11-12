package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.domain.InstructorUntil;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.AskReviewRequest;
import app.wingtipmaps.gateway.dto.CrossCountryReviewDto;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.dto.InstructorRequest;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.dto.SaveFlightRequest;
import app.wingtipmaps.gateway.dto.SignRequest;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementFilled;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerReviewCheck;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.service.FlightService;
import app.wingtipmaps.gateway.service.InstructorRefusedException;
import app.wingtipmaps.gateway.service.InstructorService;
import app.wingtipmaps.gateway.service.Mailer;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.TrainingService;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * An instructor and a student against a real Postgres (V26): asked in by
 * address and taken by whoever signs in with it; an endorsement signed
 * from AC 61-65K's words only as read, by an instructor whose recent
 * experience is current, with the signature line AC 61-65K asks for; a
 * solo cross-country put to them, the record's answer to 61.93(d)(4) and
 * (5) beside it, answered by its endorsement; and the instructor's record
 * of it kept when the student's account goes (14 CFR 61.189).
 */
@SpringBootTest
@Testcontainers
class InstructorFlowTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    @Autowired
    private PilotRepository pilots;

    @Autowired
    private InstructorService instructors;

    @Autowired
    private TrainingService training;

    @Autowired
    private FlightService flights;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private Mailer mail;

    /** The planner, which works 61.109 out (tested in the engine): no
     *  experience logged here. */
    @MockitoBean
    private PlannerClient planner;

    /** What the engine says of the endorsements is its own (records.json,
     *  through the planner); here, a day for a solo endorsement held and
     *  two checks for a review, so these tests see the gateway send what
     *  is held -- voided ones left out -- and pass the answer on. */
    static final LocalDate SOLO_UNTIL = LocalDate.of(2099, 1, 1);

    static final List<ReviewCheckDto> CHECKS = List.of(
            new ReviewCheckDto("61.93(d)(4)", "A", false, "None on record"),
            new ReviewCheckDto("61.93(d)(5)", "B", false, "None on record"));

    @org.junit.jupiter.api.BeforeEach
    void theEnginesAnswer() {
        org.mockito.BDDMockito.given(planner.endorsements(any(), any())).willAnswer(ask -> {
            List<PlannerHeldEndorsement> held = ask.getArgument(0);
            LocalDate flightOn = ask.getArgument(1);
            return new PlannerEndorsements()
                    .until(java.util.Collections.nCopies(held.size(), (LocalDate) null))
                    .soloUntil(
                            held.stream()
                                            .anyMatch(h -> List.of("solo-first", "solo-90")
                                                    .contains(h.getCode()))
                                    ? SOLO_UNTIL
                                    : null)
                    .checks(
                            flightOn == null
                                    ? List.of()
                                    : CHECKS.stream()
                                            .map(c -> new PlannerReviewCheck()
                                                    .rule(c.rule())
                                                    .label(c.label())
                                                    .met(c.met())
                                                    .detail(c.detail()))
                                            .toList());
        });
        // AC 61-65K's words are the engine's (kinds.rs, records.json's
        // fills); here every code is one, its words standing in for them.
        org.mockito.BDDMockito.given(planner.endorsementKind(any()))
                .willAnswer(ask -> java.util.Optional.of(new app.wingtipmaps.gateway.dto.EndorsementKindDto(
                        ask.getArgument(0), "A.10", "61.93(c)(3)", "An endorsement", "", List.of())));
        org.mockito.BDDMockito.given(planner.fill(any(), any(), any()))
                .willAnswer(ask -> new PlannerEndorsementFilled()
                        .fields(ask.getArgument(2))
                        .missing(List.of())
                        .text(words(ask.getArgument(0), ask.getArgument(1))));
    }

    /** The words the engine's stand-in gives an endorsement of `code`. */
    static String words(String code, String student) {
        return code.equals("solo-xc-flight")
                ? "I have reviewed the cross-country planning of " + student + "."
                : "I certify that " + student + " has received the training of " + code + ".";
    }

    private static final Instant NOW = Instant.parse("2026-10-13T18:00:00Z");
    private static final LocalDate TODAY = LocalDate.ofInstant(NOW, ZoneOffset.UTC);

    private Pilot newPilot(String name) {
        String unique = UUID.randomUUID().toString();
        return pilots.save(new Pilot(unique + "@example.com", name, "sub-" + unique));
    }

    /** A student and the instructor who took them on, the instructor's
     *  recent experience good to the end of 2027. */
    private Pilot[] pair() {
        Pilot student = newPilot("avery");
        Pilot instructor = newPilot("Jo");
        instructors.setFullName(student, "Avery B. Student");
        instructors.setInstructor(
                instructor,
                new InstructorRequest("J. J. Jones", "987654321cfi", LocalDate.of(2027, 12, 31), InstructorUntil.RE));
        instructors.ask(student, instructor.getEmail().toUpperCase(), NOW);
        InstructorDto page = instructors.instructor(instructor, NOW);
        assertThat(page.asking())
                .singleElement()
                .satisfies(s -> assertThat(s.name()).isEqualTo("Avery B. Student"));
        assertThat(instructors.accept(instructor, page.asking().get(0).linkId(), NOW))
                .isTrue();
        return new Pilot[] {student, instructor};
    }

    private SignRequest soloXc(Pilot student, Long reviewId) {
        Map<String, String> fields = Map.of(
                "from",
                "KUGN",
                "to",
                "KUGN",
                "via",
                "KRFD",
                "landings",
                "KRFD and KUGN",
                "mm",
                "Cessna 172",
                "date",
                "10-14-2026",
                "conditions",
                "");
        String text = words("solo-xc-flight", student.getFullName());
        return new SignRequest("solo-xc-flight", fields, text, TODAY, reviewId);
    }

    @Test
    void anAskIsTakenByTheAddressAsked_andTheStudentSeesTheirInstructor() {
        Pilot[] p = pair();
        // Read as the controller reads them, after the lookup's transaction.
        Pilot theirs = instructors.student(p[1], p[0].getId()).orElseThrow();
        assertThat(training.trainingFor(p[1], theirs, List.of(), TODAY).fullName())
                .isEqualTo("Avery B. Student");
        TrainingDto record = training.training(p[0], List.of(), TODAY);
        assertThat(record.instructors()).singleElement().satisfies(l -> {
            assertThat(l.accepted()).isTrue();
            assertThat(l.name()).isEqualTo("J. J. Jones");
            assertThat(l.certificate()).isEqualTo("987654321CFI");
        });
        assertThat(instructors.instructor(p[1], NOW).students())
                .extracting(s -> s.studentId())
                .containsExactly(p[0].getId());
        // Someone else's address takes nothing.
        Pilot stranger = newPilot("Stranger");
        instructors.ask(p[0], "jo.other@example.com", NOW);
        Long open = training.training(p[0], List.of(), TODAY).instructors().stream()
                .filter(l -> !l.accepted())
                .findFirst()
                .orElseThrow()
                .id();
        assertThat(instructors.accept(stranger, open, NOW)).isFalse();
        assertThat(instructors.student(stranger, p[0].getId())).isEmpty();
    }

    @Test
    void anEndorsementIsSignedAsReadWithTheAcsSignatureLine() {
        Pilot[] p = pair();
        SignedEndorsement signed = instructors.sign(p[1], p[0], soloXc(p[0], null), NOW);
        assertThat(signed.getSignature()).isEqualTo("/s/ 10-13-2026 J. J. Jones 987654321CFI RE 12-31-2027");
        assertThat(signed.getDigest()).hasSize(64);
        assertThat(training.training(p[0], List.of(), TODAY).signed())
                .singleElement()
                .satisfies(s -> assertThat(s.text())
                        .startsWith("I have reviewed the cross-country planning of Avery B. Student."));
        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, atLeastOnce()).send(sent.capture());
        assertThat(sent.getAllValues()).extracting(m -> m.getTo()[0]).contains(p[0].getEmail(), p[1].getEmail());

        // Words other than the fields make are not signed.
        SignRequest changed = new SignRequest(
                "solo-xc-flight", soloXc(p[0], null).fields(), "I certify something else.", TODAY, null);
        assertThatThrownBy(() -> instructors.sign(p[1], p[0], changed, NOW))
                .isInstanceOfSatisfying(
                        InstructorRefusedException.class,
                        r -> assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    /** 61.197(a) and (e): the privileges end with the date, but the app
     *  warns and never refuses (the owner's rule, 2026-10-26), so the
     *  endorsement is signed and its signature line carries the passed
     *  date for the record. */
    @Test
    void anInstructorPastTheirDateIsWarnedButStillSigns() {
        Pilot[] p = pair();
        LocalDate yesterday = TODAY.minusDays(1);
        instructors.setInstructor(
                p[1], new InstructorRequest("J. J. Jones", "987654321CFI", yesterday, InstructorUntil.RE));
        assertThat(instructors.sign(p[1], p[0], soloXc(p[0], null), NOW).getSignature())
                .endsWith("987654321CFI RE " + yesterday.format(DateTimeFormatter.ofPattern("MM-dd-yyyy")));
        instructors.setInstructor(
                p[1],
                new InstructorRequest("J. J. Jones", "987654321CFI", LocalDate.of(2025, 11, 30), InstructorUntil.EXP));
        assertThat(instructors.sign(p[1], p[0], soloXc(p[0], null), NOW).getSignature())
                .endsWith("987654321CFI Exp. 11-30-2025");
    }

    @Test
    void aSoloCrossCountryIsPutToTheInstructorAndAnsweredByItsEndorsement() {
        Pilot[] p = pair();
        Long flightId = flights.save(
                        p[0],
                        new SaveFlightRequest(
                                null,
                                "KUGN",
                                "KUGN",
                                4500,
                                140.0,
                                75.0,
                                9.0,
                                null,
                                List.of(),
                                List.of("KRFD"),
                                null,
                                null,
                                null))
                .getId();
        Long link =
                training.training(p[0], List.of(), TODAY).instructors().get(0).id();
        // A solo endorsement 91 days before the flight is not current for it.
        instructors.sign(p[1], p[0], soloEndorsement(p[0], "solo-first"), NOW);
        LocalDate flightOn = TODAY.plusDays(91);
        instructors.askReview(p[0], new AskReviewRequest(flightId, link, "Cessna 172", flightOn, "Back by four"), NOW);
        assertThatThrownBy(() -> instructors.askReview(
                        p[0], new AskReviewRequest(flightId, link, "Cessna 172", flightOn, null), NOW))
                .isInstanceOf(InstructorRefusedException.class);

        CrossCountryReviewDto waiting =
                instructors.instructor(p[1], NOW).reviews().get(0);
        assertThat(waiting.flight().stops()).containsExactly("KRFD");
        assertThat(waiting.checks()).isEqualTo(CHECKS);

        instructors.sign(p[1], p[0], soloXc(p[0], waiting.id()), NOW);
        assertThat(instructors.instructor(p[1], NOW).reviews()).isEmpty();
        assertThat(training.training(p[0], List.of(), TODAY).reviews())
                .singleElement()
                .satisfies(r -> assertThat(r.endorsement()).isNotNull());
    }

    private SignRequest soloEndorsement(Pilot student, String code) {
        Map<String, String> fields = Map.of("mm", "Cessna 172");
        return new SignRequest(code, fields, words(code, student.getFullName()), TODAY, null);
    }

    /** 61.189(b), (c): the instructor keeps their record of what they
     *  signed when the student's account goes; the student's own
     *  instructors and reviews go with it. */
    @Test
    void theInstructorKeepsTheirRecordWhenTheStudentsAccountGoes() {
        Pilot[] p = pair();
        instructors.sign(p[1], p[0], soloEndorsement(p[0], "solo-first"), NOW);
        jdbc.update("DELETE FROM pilots WHERE id = ?", p[0].getId());
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM instructor_students WHERE student_id = ?", Integer.class, p[0].getId()))
                .isZero();
        assertThat(instructors.instructor(p[1], NOW).signed())
                .singleElement()
                .satisfies(s -> assertThat(s.studentName()).isEqualTo("Avery B. Student"));
    }

    @Test
    void aVoidedEndorsementStaysOnRecordButHoldsNothing() {
        Pilot[] p = pair();
        SignedEndorsement solo = instructors.sign(p[1], p[0], soloEndorsement(p[0], "solo-first"), NOW);
        assertThat(instructors.instructor(p[1], NOW).students().get(0).soloUntil())
                .isEqualTo(SOLO_UNTIL);
        assertThat(instructors.voidEndorsement(p[1], solo.getId(), NOW)).isTrue();
        assertThat(instructors.voidEndorsement(p[1], solo.getId(), NOW)).isFalse();
        assertThat(instructors.instructor(p[1], NOW).students().get(0).soloUntil())
                .isNull();
        assertThat(training.training(p[0], List.of(), TODAY).signed())
                .singleElement()
                .satisfies(s -> assertThat(s.voided()).isTrue());
    }

    @Test
    void endingIt_takesTheReviewsStillWaitingWithIt() {
        Pilot[] p = pair();
        Long flightId = flights.save(
                        p[0],
                        new SaveFlightRequest(
                                null, "KUGN", "KRFD", null, null, null, null, null, List.of(), null, null, null, null))
                .getId();
        Long link =
                training.training(p[0], List.of(), TODAY).instructors().get(0).id();
        instructors.askReview(p[0], new AskReviewRequest(flightId, link, "Cessna 172", TODAY, null), NOW);
        assertThat(instructors.leave(p[1], link)).isTrue();
        assertThat(training.training(p[0], List.of(), TODAY).reviews()).isEmpty();
        assertThat(instructors.student(p[1], p[0].getId())).isEmpty();
        verify(mail, atLeastOnce()).send(any());
    }
}
