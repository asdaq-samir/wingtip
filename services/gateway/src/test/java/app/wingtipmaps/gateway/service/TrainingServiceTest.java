package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.InstructorLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** The record kept beside 61.109's experience; the experience itself is
 *  the engine's (pilot_experience, held to apps/web/src/lib/fixtures/currency.json). */
class TrainingServiceTest {

    private final Pilot pilot = new Pilot("student@example.com", "A. Student", "sub-1");

    @Test
    void theKnowledgeTestCodesComeBackAsGiven() {
        pilot.setKnowledgeTestCodes("PA.I.E.K1 PA.I.D.K2");
        assertThat(TrainingService.codesOf(pilot)).containsExactly("PA.I.E.K1", "PA.I.D.K2");
        pilot.setKnowledgeTestCodes(null);
        assertThat(TrainingService.codesOf(pilot)).isEmpty();
    }

    @Test
    void reviewsOfOneDayAskThePlannerOnceForTheirChecksAndNotAgainForTheirEndorsement() {
        Pilot instructor = new Pilot("cfi@example.com", "A. Instructor", "sub-2");
        LocalDate day = LocalDate.parse("2026-11-20");
        SignedEndorsement solo = new SignedEndorsement(
                pilot, instructor, "solo-xc", "A. Student", Map.of(), "", "", day, Instant.EPOCH, "");
        ReflectionTestUtils.setField(solo, "id", 7L);
        List<CrossCountryReview> asked = List.of(
                new CrossCountryReview(pilot, instructor, mock(Flight.class), "C172", day, "", Instant.EPOCH),
                new CrossCountryReview(pilot, instructor, mock(Flight.class), "C172", day, "", Instant.EPOCH),
                new CrossCountryReview(pilot, instructor, mock(Flight.class), "C172", day, "", Instant.EPOCH));
        asked.forEach(r -> r.endorsed(solo, Instant.EPOCH));
        EndorsementRepository paper = mock(EndorsementRepository.class);
        SignedEndorsementRepository signed = mock(SignedEndorsementRepository.class);
        given(signed.findByStudentIdOrderBySignedAtDesc(any())).willReturn(List.of(solo));
        CrossCountryReviewRepository reviews = mock(CrossCountryReviewRepository.class);
        given(reviews.findByStudentIdOrderByAskedAtDesc(any())).willReturn(asked);
        PlannerClient planner = mock(PlannerClient.class);
        given(planner.endorsements(any(), any())).willAnswer(ask -> {
            List<PlannerHeldEndorsement> held = ask.getArgument(0);
            return new PlannerEndorsements()
                    .until(Collections.nCopies(held.size(), day.plusDays(60)))
                    .checks(List.of());
        });
        TrainingService service = new TrainingService(
                paper,
                mock(PilotRepository.class),
                signed,
                mock(InstructorLinkRepository.class),
                reviews,
                mock(LessonService.class),
                planner);

        TrainingDto record = service.training(pilot, List.of(), day);

        // The signed list's days once, the day's checks once: not two a review.
        verify(planner, times(2)).endorsements(any(), any());
        assertThat(record.reviews()).hasSize(3);
        assertThat(record.reviews().get(2).endorsement().until()).isEqualTo(day.plusDays(60));
    }
}
