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
import app.wingtipmaps.gateway.domain.InstructorLink;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceItem;
import app.wingtipmaps.gateway.planner.model.PlannerRecordsBatch;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.EndorsementRepository;
import app.wingtipmaps.gateway.repository.InstructorLinkRepository;
import app.wingtipmaps.gateway.repository.LogbookRepository;
import app.wingtipmaps.gateway.repository.SignedEndorsementRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * The instructor's page asks the planner once for all its students and
 * reviews, reads each student's records once however many reviews they
 * have waiting, and asks only after its read-only transaction has ended,
 * so no database connection waits on the planner (waste-server audit A, B).
 */
class InstructorPageTest {

    private static final Instant NOW = Instant.parse("2026-11-21T12:00:00Z");
    private static final LocalDate DAY = LocalDate.parse("2026-11-28");

    private final Pilot instructor = pilot(1L, "cfi@example.com");
    private final Pilot avery = pilot(2L, "avery@example.com");
    private final Pilot blake = pilot(3L, "blake@example.com");
    private final InstructorLinkRepository links = mock(InstructorLinkRepository.class);
    private final CrossCountryReviewRepository reviews = mock(CrossCountryReviewRepository.class);
    private final EndorsementRepository recorded = mock(EndorsementRepository.class);
    private final SignedEndorsementRepository signed = mock(SignedEndorsementRepository.class);
    private final LogbookRepository logbook = mock(LogbookRepository.class);
    private final PlannerClient planner = mock(PlannerClient.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);

    private static Pilot pilot(Long id, String email) {
        Pilot p = new Pilot(email, email, "sub-" + id);
        ReflectionTestUtils.setField(p, "id", id);
        return p;
    }

    private static InstructorLink taken(Pilot student, Pilot instructor, Long id) {
        InstructorLink l = new InstructorLink(student, instructor.getEmail(), NOW);
        l.accept(instructor, NOW);
        ReflectionTestUtils.setField(l, "id", id);
        return l;
    }

    @Test
    void twoStudentsAndThreeReviewsAreOneCallAfterTheTransaction() {
        given(planner.instructorRecordsSince(any())).willReturn(LocalDate.parse("2023-11-21"));
        given(links.findByInstructorIdOrderByAcceptedAt(1L))
                .willReturn(List.of(taken(avery, instructor, 10L), taken(blake, instructor, 11L)));
        given(links.findOpenFor(any())).willReturn(List.of());
        // Avery's two reviews are of one day: their checks are asked once.
        given(reviews.findByInstructorIdAndAnsweredAtIsNullOrderByAskedAt(1L))
                .willReturn(List.of(
                        new CrossCountryReview(avery, instructor, mock(Flight.class), "C172", DAY, "", NOW),
                        new CrossCountryReview(avery, instructor, mock(Flight.class), "C172", DAY, "", NOW),
                        new CrossCountryReview(blake, instructor, mock(Flight.class), "PA28", DAY, "", NOW)));
        given(signed.findByInstructorIdAndSignedAtAfterOrderBySignedAtDesc(any(), any()))
                .willReturn(List.of());
        given(planner.records(any(), any())).willAnswer(ask -> {
            List<PlannerExperienceAsk> experience = ask.getArgument(0);
            List<PlannerEndorsementsAsk> endorsements = ask.getArgument(1);
            return new PlannerRecordsBatch()
                    .experience(experience.stream()
                            .map(e -> List.<PlannerExperienceItem>of())
                            .toList())
                    .endorsements(endorsements.stream()
                            .map(e -> new PlannerEndorsements()
                                    .until(Collections.nCopies(e.getHeld().size(), (LocalDate) null))
                                    .soloUntil(DAY.plusDays(60))
                                    .checks(List.of()))
                            .toList());
        });
        InstructorPage page = new InstructorPage(links, signed, reviews, recorded, logbook, planner, transactions);

        InstructorDto dto = page.of(instructor, NOW);

        assertThat(dto.students())
                .hasSize(2)
                .allSatisfy(s -> assertThat(s.soloUntil()).isEqualTo(DAY.plusDays(60)));
        assertThat(dto.reviews()).hasSize(3);
        assertThat(dto.students().get(0).reviewsWaiting()).isEqualTo(2);
        // One call for the page: the students' experience, their solo
        // days and the reviews' checks, Avery's day once.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PlannerExperienceAsk>> experience = ArgumentCaptor.forClass(List.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PlannerEndorsementsAsk>> endorsements = ArgumentCaptor.forClass(List.class);
        verify(planner, times(1)).records(experience.capture(), endorsements.capture());
        assertThat(experience.getValue()).hasSize(2);
        assertThat(endorsements.getValue()).hasSize(2 + 2);
        verify(planner, never()).endorsements(any(), any());
        verify(planner, never()).experience(any(), any());
        // Each student's records read once, not again for each review.
        verify(recorded, times(1)).findByKeyPilotIdOrderByKeyCode(2L);
        verify(signed, times(1)).findByStudentIdOrderBySignedAtDesc(2L);
        verify(logbook, times(1)).findByPilotIdOrderByFlownOnDescIdDesc(2L);
        // The transaction ends before the planner is asked.
        InOrder order = inOrder(transactions, planner);
        order.verify(transactions).commit(any());
        order.verify(planner).records(any(), any());
    }

    @Test
    void aPageOfNothingAsksThePlannerNothingButItsDay() {
        given(planner.instructorRecordsSince(any())).willReturn(LocalDate.parse("2023-11-21"));
        given(planner.records(any(), any())).willCallRealMethod();
        InstructorPage page = new InstructorPage(links, signed, reviews, recorded, logbook, planner, transactions);

        InstructorDto dto = page.of(instructor, NOW);

        assertThat(dto.students()).isEmpty();
        assertThat(dto.reviews()).isEmpty();
        assertThat(dto.signed()).isEmpty();
    }
}
