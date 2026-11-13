package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.OwnFigures;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.service.AircraftLimits;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** PUT /api/aircraft/{id}/figures, what the apps' inline ask saves: one
 *  figure added to the airplane's own, each held to the planner's limits
 *  (OwnFigures). The rest of the airplane's contract is
 *  AircraftControllerTest's. */
@WebMvcTest(AircraftController.class)
@Import(app.wingtipmaps.gateway.security.SecurityConfig.class)
class AircraftFiguresControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AircraftService aircraftService;

    @MockitoBean
    private PilotService pilotService;

    @MockitoBean
    private SquawkService squawkService;

    @MockitoBean
    private DueItemService dueItemService;

    @MockitoBean
    private PlannerClient planner;

    @MockitoBean
    private AircraftLimits limits;

    @BeforeEach
    void nothingDue() {
        given(planner.inspections(any(), any(), any(), any(), any(), any(), any(), any()))
                .willReturn(new PlannerInspections());
        given(pilotService.current(any())).willReturn(Optional.of(pilot()));
    }

    private static Pilot pilot() {
        return new Pilot("pilot@example.com", "A. Pilot", "sub-1");
    }

    /** An inline ask's one figure goes through and comes back with the
     *  airplane's own figures. */
    @Test
    void aFigureAskedInlineIsAddedAndReturned() throws Exception {
        Aircraft airplane = new Aircraft(pilot(), "N12345", "C172", 110, 8.5, null, null, null, null, null, 40.0)
                .keepFigures(null, null, 1.2, null, null, null);
        given(aircraftService.addFigures(any(), eq(8L), eq(new OwnFigures(null, null, 1.2, null, null, null))))
                .willReturn(Optional.of(airplane));

        mockMvc.perform(put("/api/aircraft/8/figures")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"taxiFuelGal\":1.2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.figures.taxiFuelGal").value(1.2))
                .andExpect(jsonPath("$.figures.glideRatio").isEmpty());
    }

    /** A glide ratio of 1 or less, a ceiling no airplane has, or negative
     *  taxi fuel is refused. */
    @Test
    void aFigureOutsideItsLimitsIsRefused() throws Exception {
        for (String body : new String[] {"{\"glideRatio\":1}", "{\"serviceCeilingFt\":500}", "{\"taxiFuelGal\":-1}"}) {
            mockMvc.perform(put("/api/aircraft/8/figures")
                            .with(oidcLogin())
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }
    }
}
