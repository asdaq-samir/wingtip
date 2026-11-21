package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SignedEndorsement;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceItem;
import app.wingtipmaps.gateway.planner.model.PlannerRecordsBatch;
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
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

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
    void theRecordIsOneCallToThePlannerAfterItsTransaction() {
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
        given(planner.records(any(), any())).willAnswer(ask -> {
            List<PlannerExperienceAsk> experience = ask.getArgument(0);
            List<PlannerEndorsementsAsk> endorsements = ask.getArgument(1);
            return new PlannerRecordsBatch()
                    .experience(experience.stream()
                            .map(e -> List.<PlannerExperienceItem>of())
                            .toList())
                    .endorsements(endorsements.stream()
                            .map(e -> new PlannerEndorsements()
                                    .until(Collections.nCopies(e.getHeld().size(), day.plusDays(60)))
                                    .checks(List.of()))
                            .toList());
        });
        PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        TrainingService service = new TrainingService(
                paper,
                mock(PilotRepository.class),
                signed,
                mock(InstructorLinkRepository.class),
                reviews,
                mock(LessonService.class),
                planner,
                transactions);

        TrainingDto record = service.training(pilot, List.of(), day);

        // One call: the experience, the signed list's days and the day's
        // checks once, not two a review; none of them one at a time.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PlannerEndorsementsAsk>> endorsements = ArgumentCaptor.forClass(List.class);
        verify(planner, times(1)).records(any(), endorsements.capture());
        assertThat(endorsements.getValue()).hasSize(2);
        verify(planner, never()).endorsements(any(), any());
        verify(planner, never()).experience(any(), any());
        assertThat(record.reviews()).hasSize(3);
        assertThat(record.reviews().get(2).endorsement().until()).isEqualTo(day.plusDays(60));
        assertThat(record.signed())
                .singleElement()
                .satisfies(e -> assertThat(e.until()).isEqualTo(day.plusDays(60)));
        // The transaction ends before the planner is asked.
        InOrder order = inOrder(transactions, planner);
        order.verify(transactions).commit(any());
        order.verify(planner).records(any(), any());
    }
}
