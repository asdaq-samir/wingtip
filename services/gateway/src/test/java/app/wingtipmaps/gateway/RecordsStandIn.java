package app.wingtipmaps.gateway;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsements;
import app.wingtipmaps.gateway.planner.model.PlannerEndorsementsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceItem;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerRecordsBatch;
import app.wingtipmaps.gateway.planner.model.PlannerReviewCheck;
import app.wingtipmaps.gateway.service.PlannerClient;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * What the engine says of a student's endorsements, as the flow tests
 * stand in for it (records.json holds the engine's own, through the
 * planner): a day for a solo endorsement held, the checks given for a
 * review's day, and no experience logged. Answered the same asked one at
 * a time (PlannerClient#endorsements) or in a page's batch
 * (PlannerClient#records), so the tests see the gateway send what is
 * held -- voided ones left out -- and pass the answer on.
 */
public final class RecordsStandIn {

    private RecordsStandIn() {}

    public static void answer(PlannerClient planner, LocalDate soloUntil, List<ReviewCheckDto> checks) {
        given(planner.endorsements(any(), any(), any()))
                .willAnswer(ask -> say(ask.getArgument(0), ask.getArgument(1), soloUntil, checks));
        given(planner.records(any(), any())).willAnswer(ask -> {
            List<PlannerExperienceAsk> experience = ask.getArgument(0);
            List<PlannerEndorsementsAsk> endorsements = ask.getArgument(1);
            return new PlannerRecordsBatch()
                    .experience(experience.stream()
                            .map(e -> List.<PlannerExperienceItem>of())
                            .toList())
                    .endorsements(endorsements.stream()
                            .map(e -> say(e.getHeld(), e.getFlightOn(), soloUntil, checks))
                            .toList());
        });
    }

    private static PlannerEndorsements say(
            List<PlannerHeldEndorsement> held,
            @Nullable LocalDate flightOn,
            LocalDate soloUntil,
            List<ReviewCheckDto> checks) {
        return new PlannerEndorsements()
                .until(Collections.nCopies(held.size(), (LocalDate) null))
                .soloUntil(
                        held.stream()
                                        .anyMatch(h ->
                                                List.of("solo-first", "solo-90").contains(h.getCode()))
                                ? soloUntil
                                : null)
                .checks(
                        flightOn == null
                                ? List.of()
                                : checks.stream()
                                        .map(c -> new PlannerReviewCheck()
                                                .rule(c.rule())
                                                .label(c.label())
                                                .met(c.met())
                                                .detail(c.detail()))
                                        .toList());
    }
}
