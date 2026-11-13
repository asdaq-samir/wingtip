package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
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

/** POST /api/aircraft's performance figures: the cruise power and the
 *  climb's and the descent's own speed and burn, saved with the airplane
 *  and returned. The rest of the airplane's contract is
 *  AircraftControllerTest's. */
@WebMvcTest(AircraftController.class)
@Import(app.wingtipmaps.gateway.security.SecurityConfig.class)
class AircraftPerformanceControllerTest {

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
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
    }

    private static Pilot samplePilot() {
        return new Pilot("pilot@example.com", "A. Pilot", "sub-1");
    }

    /** The cruise's power and the climb's and the descent's own speed and burn go through
     *  to the aeroplane and back: the nav log flies every leg and every
     *  climb on them. */
    @Test
    void add_passesTheCruisePowerAndTheClimbsAndDescentsOwnSpeedAndBurnThrough() throws Exception {
        given(aircraftService.add(
                        any(),
                        eq("N12345"),
                        eq("C172"),
                        eq(110.0),
                        eq(8.5),
                        eq(65.0),
                        eq(74.0),
                        eq(11.0),
                        eq(90.0),
                        eq(7.5),
                        eq(40.0),
                        any(),
                        any(),
                        any(),
                        any()))
                .willReturn(new Aircraft(samplePilot(), "N12345", "C172", 110, 8.5, 65.0, 74.0, 11.0, 90.0, 7.5, 40.0));

        mockMvc.perform(post("/api/aircraft")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tailNumber\":\"N12345\",\"typeDesignator\":\"C172\",\"cruiseTasKt\":110,"
                                + "\"fuelBurnGph\":8.5,\"cruisePowerPct\":65,\"climbTasKt\":74,\"climbFuelBurnGph\":11,"
                                + "\"descentIasKt\":90,\"descentFuelBurnGph\":7.5,\"usableFuelGal\":40}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cruisePowerPct").value(65.0))
                .andExpect(jsonPath("$.climbTasKt").value(74.0))
                .andExpect(jsonPath("$.climbFuelBurnGph").value(11.0))
                .andExpect(jsonPath("$.descentIasKt").value(90.0))
                .andExpect(jsonPath("$.descentFuelBurnGph").value(7.5));
    }
}
