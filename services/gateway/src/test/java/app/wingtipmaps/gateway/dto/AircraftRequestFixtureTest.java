package app.wingtipmaps.gateway.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The gateway's AircraftRequest limits held to the engine's
 * aircraft_problems, which every app checks the "Your Airplane" form with
 * before it sends it: each case of the shared fixture
 * (apps/web/src/lib/fixtures/aircraftForm.json, the engine's own test
 * reads it too) sent as the apps send it -- trimmed, a blank optional figure
 * null -- is refused here on exactly the fields the engine names. So the
 * two cannot drift: a limit changed on one side fails this test.
 */
class AircraftRequestFixtureTest {

    private static final Validator VALIDATOR =
            Validation.buildDefaultValidatorFactory().getValidator();

    private static final Path FIXTURE = Path.of("../../apps/web/src/lib/fixtures/aircraftForm.json");

    /** A figure as the apps send it: blank is null, else the number typed. */
    private static Double figure(JsonNode form, String key) {
        String typed = form.path(key).asString("").trim();
        return typed.isEmpty() ? null : Double.valueOf(typed);
    }

    private static String words(JsonNode form, String key) {
        String typed = form.path(key).asString("").trim();
        return typed.isEmpty() ? null : typed;
    }

    /** Whether every figure typed reads as a number: one that does not never
     *  leaves the app, so the gateway has no case to answer. */
    private static boolean sendable(JsonNode form) {
        for (String key : new String[] {
            "cruiseTasKt", "fuelBurnGph", "cruisePowerPct", "climbTasKt", "climbFuelBurnGph", "usableFuelGal"
        }) {
            try {
                figure(form, key);
            } catch (NumberFormatException notANumber) {
                return false;
            }
        }
        return true;
    }

    @Test
    void theGatewayRefusesExactlyWhatTheEngineNames() throws Exception {
        JsonNode cases =
                JsonMapper.builder().build().readTree(Files.readString(FIXTURE)).path("cases");
        assertThat(cases.size()).isGreaterThan(10);
        int checked = 0;
        for (JsonNode c : cases) {
            JsonNode form = c.path("form");
            if (!sendable(form)) {
                continue;
            }
            Double tas = figure(form, "cruiseTasKt");
            Double burn = figure(form, "fuelBurnGph");
            AircraftRequest request = new AircraftRequest(
                    form.path("tailNumber").asString("").trim(),
                    form.path("typeDesignator").asString("").trim(),
                    tas == null ? 0 : tas,
                    burn == null ? 0 : burn,
                    figure(form, "cruisePowerPct"),
                    figure(form, "climbTasKt"),
                    figure(form, "climbFuelBurnGph"),
                    figure(form, "usableFuelGal"),
                    words(form, "equipment"),
                    words(form, "surveillance"),
                    words(form, "colour"),
                    null);
            Set<String> refused = VALIDATOR.validate(request).stream()
                    .map(ConstraintViolation::getPropertyPath)
                    .map(Object::toString)
                    .collect(Collectors.toCollection(TreeSet::new));
            Set<String> named = new TreeSet<>(c.path("problems").propertyNames());
            assertThat(refused).as("%s", form).isEqualTo(named);
            checked++;
        }
        assertThat(checked).isGreaterThan(10);
    }
}
