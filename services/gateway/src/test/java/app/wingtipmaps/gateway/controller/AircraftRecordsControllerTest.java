package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.AircraftDueItem;
import app.wingtipmaps.gateway.domain.DueItemKind;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.SquawkDto;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.service.AircraftLimits;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/** An airplane's squawks and due items, as its owner keeps them and as the
 *  list of airplanes carries them. The rest of the airplane's contract is
 *  AircraftControllerTest's. */
@WebMvcTest(AircraftController.class)
@Import(app.wingtipmaps.gateway.security.SecurityConfig.class)
class AircraftRecordsControllerTest {

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

    private static Aircraft aircraft(long id, String tail) {
        Aircraft a = new Aircraft(samplePilot(), tail, "C172", 110, 8.5, null, null, null, null, null, 40.0);
        ReflectionTestUtils.setField(a, "id", id);
        return a;
    }

    /** The list reads every airplane's open squawks and due items in one
     *  ask each, and each airplane carries its own. */
    @Test
    void eachAirplaneInTheListCarriesItsOwnSquawksAndItems() throws Exception {
        Aircraft first = aircraft(7L, "N12345");
        Aircraft second = aircraft(8L, "N54321");
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(aircraftService.list(any())).willReturn(List.of(first, second));
        given(squawkService.openOf(List.of(7L, 8L)))
                .willReturn(Map.of(
                        8L,
                        List.of(new SquawkDto(
                                3L, LocalDate.of(2026, 10, 10), "Landing light out", true, null, null, null))));
        AircraftDueItem ad = new AircraftDueItem(first)
                .set(DueItemKind.AD, "Oil filter adapter", "AD 2011-10-09", null, null, 2310.4);
        given(dueItemService.of(List.of(7L, 8L))).willReturn(Map.of(7L, List.of(ad)));

        mockMvc.perform(get("/api/aircraft").with(oidcLogin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].openSquawks.length()").value(0))
                .andExpect(jsonPath("$[0].dueItems[0].reference").value("AD 2011-10-09"))
                .andExpect(jsonPath("$[1].openSquawks[0].text").value("Landing light out"))
                .andExpect(jsonPath("$[1].dueItems.length()").value(0));
        verify(squawkService).openOf(List.of(7L, 8L));
        verify(dueItemService).of(List.of(7L, 8L));
    }

    /** Squawks: another pilot's airplane's a 404; one with no words, or
     *  found in the future, a 400; a good one back with its determination. */
    @Test
    void aSquawkIsTheOwnersAndSaysWhatWasFound() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(squawkService.list(any(), eq(9L))).willReturn(Optional.empty());
        mockMvc.perform(get("/api/aircraft/9/squawks").with(oidcLogin())).andExpect(status().isNotFound());

        given(squawkService.add(any(), eq(7L), any()))
                .willReturn(Optional.of(new app.wingtipmaps.gateway.dto.SquawkDto(
                        3L,
                        java.time.LocalDate.of(2026, 10, 10),
                        "Landing light out",
                        true,
                        app.wingtipmaps.gateway.domain.DeferredFor.VFR_DAY,
                        null,
                        null)));
        String body =
                "{\"reportedOn\":\"2026-10-10\",\"text\":\"Landing light out\",\"inoperative\":true,\"deferredFor\":\"VFR_DAY\"}";
        mockMvc.perform(post("/api/aircraft/7/squawks")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deferredFor").value("VFR_DAY"));
        mockMvc.perform(post("/api/aircraft/7/squawks")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("Landing light out", " ")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/aircraft/7/squawks")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("2026-10-10", "2999-01-01")))
                .andExpect(status().isBadRequest());
    }

    /** An AD kept on the airplane (14 CFR 91.417(a)(2)(v)): another
     *  pilot's airplane is 404, a title is needed, hours are not negative. */
    @Test
    void aDueItemIsTheOwnersAndNamesWhatIsDue() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        String body = "{\"kind\":\"AD\",\"title\":\"Oil filter adapter\",\"reference\":\"AD 2011-10-09\","
                + "\"method\":\"Inspect, 100 hours\",\"dueAtHours\":2310.4}";
        given(dueItemService.add(any(), eq(9L), any())).willReturn(Optional.empty());
        mockMvc.perform(post("/api/aircraft/9/due-items")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());

        given(dueItemService.add(any(), eq(7L), any()))
                .willReturn(Optional.of(new app.wingtipmaps.gateway.dto.DueItemDto(
                        4L,
                        app.wingtipmaps.gateway.domain.DueItemKind.AD,
                        "Oil filter adapter",
                        "AD 2011-10-09",
                        "Inspect, 100 hours",
                        null,
                        2310.4)));
        mockMvc.perform(post("/api/aircraft/7/due-items")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reference").value("AD 2011-10-09"))
                .andExpect(jsonPath("$.dueAtHours").value(2310.4));
        mockMvc.perform(post("/api/aircraft/7/due-items")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("Oil filter adapter", " ")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/aircraft/7/due-items")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("2310.4", "-1")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/aircraft/7/due-items/4").with(csrf())).andExpect(status().isUnauthorized());
    }
}
