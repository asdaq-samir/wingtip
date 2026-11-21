package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.argThat;

import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerInspectionsAsk;
import java.util.Collections;
import java.util.List;
import java.util.function.Predicate;
import org.mockito.stubbing.Answer;

/**
 * PlannerClient#inspections as the aircraft controllers' tests stub it:
 * the aircraft list asks every airplane in one call, so a stub answers
 * each ask with the same, or matches a call of one airplane's ask.
 */
final class InspectionsStub {

    private InspectionsStub() {}

    /** One {@code due} for each airplane asked, in order. */
    static Answer<List<PlannerInspections>> each(PlannerInspections due) {
        return asked -> Collections.nCopies(((List<?>) asked.getArgument(0)).size(), due);
    }

    /** A call of one airplane's ask that {@code fits}. */
    static List<PlannerInspectionsAsk> one(Predicate<PlannerInspectionsAsk> fits) {
        return argThat(asks -> asks != null && asks.size() == 1 && fits.test(asks.get(0)));
    }
}
