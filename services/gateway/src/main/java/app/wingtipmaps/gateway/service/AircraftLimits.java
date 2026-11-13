package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.dto.AircraftRequest;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.io.Serial;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import org.springframework.web.ErrorResponseException;

/**
 * An airplane a pilot saves, held to the limits the apps check the "Your
 * Airplane" form with: the engine's aircraft_problems
 * (engine/crates/pilot/src/aircraft/form.rs), asked through the planner's
 * POST /api/aircraft/problems. The limits are stated there once -- the
 * cruise power a cruise table has, the columns' lengths, FAA Form 7233-4's
 * items 10a and 10b -- and this app keeps no copy of them (CLAUDE.md:
 * Spring Boot holds no aviation logic).
 */
@Component
public class AircraftLimits {

    private final PlannerApi planner;

    public AircraftLimits(PlannerApi planner) {
        this.planner = planner;
    }

    /**
     * Refuses {@code request} with a 400 naming each field the engine
     * finds wrong, in its words, as a failed {@code @Valid} check is
     * answered (GlobalExceptionHandler).
     *
     * @throws Refused when a field may not be saved
     * @throws PlannerUnavailableException when the planner cannot be asked
     */
    public void check(AircraftRequest request) {
        Map<String, String> problems =
                PlannerClient.rule("the airplane's limits", () -> planner.aircraftProblems(form(request)), p -> p);
        if (!problems.isEmpty()) {
            throw new Refused(problems);
        }
    }

    /** The request's fields by the names the engine reads, the figures as
     *  numbers; one not given is left out. */
    static Map<String, Object> form(AircraftRequest r) {
        Map<String, Object> form = new LinkedHashMap<>();
        put(form, "tailNumber", r.tailNumber());
        put(form, "typeDesignator", r.typeDesignator());
        put(form, "cruiseTasKt", r.cruiseTasKt());
        put(form, "fuelBurnGph", r.fuelBurnGph());
        put(form, "cruisePowerPct", r.cruisePowerPct());
        put(form, "climbTasKt", r.climbTasKt());
        put(form, "climbFuelBurnGph", r.climbFuelBurnGph());
        put(form, "usableFuelGal", r.usableFuelGal());
        put(form, "equipment", r.equipment());
        put(form, "surveillance", r.surveillance());
        put(form, "colour", r.colour());
        return form;
    }

    private static void put(Map<String, Object> form, String key, @Nullable Object value) {
        if (value != null) {
            form.put(key, value);
        }
    }

    /** An airplane refused: a 400 problem, its detail naming each field
     *  and {@code errors} listing them, as the apps read a failed
     *  {@code @Valid} check. */
    public static class Refused extends ErrorResponseException {

        @Serial
        private static final long serialVersionUID = 1L;

        public Refused(Map<String, String> problems) {
            super(HttpStatus.BAD_REQUEST, problem(problems), null);
        }

        private static ProblemDetail problem(Map<String, String> problems) {
            List<String> errors = problems.entrySet().stream()
                    .map(e -> e.getKey() + ": " + e.getValue())
                    .toList();
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                    HttpStatus.BAD_REQUEST, "Invalid request: " + String.join("; ", errors));
            problem.setProperty("errors", errors);
            return problem;
        }
    }
}
