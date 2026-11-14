package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.dto.AircraftRequest;
import app.wingtipmaps.gateway.dto.OwnFigures;
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
 * POST /api/aircraft/problems. The limits are stated there once -- each
 * figure's range (airplane_figure_ranges: the speeds, burns and fuel, and
 * its own handbook figures, the service ceiling, climb rate, taxi fuel and
 * glide ratio), the columns' lengths, FAA Form 7233-4's items 10a and 10b
 * -- and this app keeps no copy of them (CLAUDE.md: Spring Boot holds no
 * aviation logic).
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
        refuse(ask(form(request)));
    }

    /** The airplane's own handbook figures the engine checks, by its names. */
    static final List<String> OWN_FIGURES = List.of("serviceCeilingFt", "climbRateFpm", "taxiFuelGal", "glideRatio");

    /**
     * Refuses {@code figures}, an inline ask's own figures saved on their
     * own (PUT /api/aircraft/{id}/figures), where the engine finds one
     * wrong. Sent alone, the form's other fields are missing, which the
     * engine names too; only these figures' problems count here.
     *
     * @throws Refused when a figure may not be saved
     * @throws PlannerUnavailableException when the planner cannot be asked
     */
    public void checkFigures(OwnFigures figures) {
        Map<String, Object> form = new LinkedHashMap<>();
        putFigures(form, figures);
        Map<String, String> problems = new LinkedHashMap<>(ask(form));
        problems.keySet().retainAll(OWN_FIGURES);
        refuse(problems);
    }

    private Map<String, String> ask(Map<String, Object> form) {
        return PlannerClient.rule("the airplane's limits", () -> planner.aircraftProblems(form), p -> p);
    }

    private static void refuse(Map<String, String> problems) {
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
        put(form, "descentIasKt", r.descentIasKt());
        put(form, "descentFuelBurnGph", r.descentFuelBurnGph());
        put(form, "usableFuelGal", r.usableFuelGal());
        put(form, "equipment", r.equipment());
        put(form, "surveillance", r.surveillance());
        put(form, "colour", r.colour());
        putFigures(form, r.figures());
        return form;
    }

    /** The four of its own figures the engine holds to their ranges; the
     *  empty weight and moment are not its to check. */
    private static void putFigures(Map<String, Object> form, @Nullable OwnFigures f) {
        if (f == null) {
            return;
        }
        put(form, "serviceCeilingFt", f.serviceCeilingFt());
        put(form, "climbRateFpm", f.climbRateFpm());
        put(form, "taxiFuelGal", f.taxiFuelGal());
        put(form, "glideRatio", f.glideRatio());
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
