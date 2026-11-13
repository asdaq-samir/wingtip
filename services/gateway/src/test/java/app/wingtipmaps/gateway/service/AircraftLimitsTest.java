package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import app.wingtipmaps.gateway.dto.AircraftRequest;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

/** The gateway asks the engine's aircraft_problems (through the planner)
 *  before a save and refuses what it names: the figures sent as numbers,
 *  one not given left out, and each problem a field of the 400. The cases
 *  themselves are the engine's (form.rs) and the shared aircraftForm.json. */
class AircraftLimitsTest {

    private final PlannerApi planner = mock(PlannerApi.class);
    private final AircraftLimits limits = new AircraftLimits(planner);

    private static AircraftRequest request(Double power) {
        return new AircraftRequest("N1", "C172", 110, 8.5, power, null, null, null, null, null, null, null);
    }

    @Test
    void theFormSentIsTheFieldsGivenWithTheFiguresAsNumbers() {
        assertThat(AircraftLimits.form(request(65.0)))
                .containsExactly(
                        Map.entry("tailNumber", "N1"),
                        Map.entry("typeDesignator", "C172"),
                        Map.entry("cruiseTasKt", 110.0),
                        Map.entry("fuelBurnGph", 8.5),
                        Map.entry("cruisePowerPct", 65.0));
    }

    @Test
    void nothingWrongIsSaved() {
        given(planner.aircraftProblems(any())).willReturn(Map.of());
        limits.check(request(65.0));
    }

    @Test
    void whatTheEngineNamesIsA400NamingEachField() {
        given(planner.aircraftProblems(any()))
                .willReturn(Map.of("cruisePowerPct", "Cruise power must be between 40 and 100%"));
        assertThatThrownBy(() -> limits.check(request(30.0)))
                .isInstanceOfSatisfying(ErrorResponseException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getBody().getProperties())
                            .containsEntry(
                                    "errors", List.of("cruisePowerPct: Cruise power must be between 40 and 100%"));
                });
    }
}
