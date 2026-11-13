package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.HandbookFigures;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.service.AircraftLimits;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** PUT /api/aircraft/{id}/handbook: the figures a pilot confirmed from a
 *  photographed page, kept as sent (AircraftControllerTest's setting,
 *  its own file as that one is at its size). */
@WebMvcTest(AircraftController.class)
@Import(app.wingtipmaps.gateway.security.SecurityConfig.class)
class AircraftHandbookControllerTest {

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
    }

    private static Pilot samplePilot() {
        return new Pilot("pilot@example.com", "A. Pilot", "sub-1");
    }

    private static Aircraft sampleAircraft() {
        return new Aircraft(samplePilot(), "N12345", "C172", 110, 8.5, null, null, null, 40.0);
    }

    /** The handbook figures a pilot confirmed from a photographed page
     *  are kept as sent and come back with the airplane; another pilot's
     *  airplane, or none, is a 404. */
    @Test
    void handbook_keepsTheConfirmedFiguresAsSent() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        HandbookFigures figures = new HandbookFigures(
                null,
                null,
                null,
                null,
                68.0,
                9.0,
                null,
                null,
                null,
                null,
                null,
                List.of(new HandbookFigures.Corner(35, 1500)),
                null,
                null);
        given(aircraftService.keepHandbook(
                        any(),
                        eq(7L),
                        argThat(f -> f != null
                                && f.glide_ratio() == 9.0
                                && f.envelope().get(0).weight_lb() == 1500.0)))
                .willReturn(Optional.of(sampleAircraft().keepHandbook(figures)));
        String body =
                "{\"figures\":{\"glide_speed_kias\":68,\"glide_ratio\":9,\"envelope\":[{\"arm_in\":35,\"weight_lb\":1500}]}}";

        mockMvc.perform(put("/api/aircraft/7/handbook")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handbook.glide_ratio").value(9))
                .andExpect(jsonPath("$.handbook.envelope[0].weight_lb").value(1500));

        given(aircraftService.keepHandbook(any(), eq(8L), any())).willReturn(Optional.empty());
        mockMvc.perform(put("/api/aircraft/8/handbook")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());
    }
}
