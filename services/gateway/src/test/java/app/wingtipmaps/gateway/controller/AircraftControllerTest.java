package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerVorCheckOutput;
import app.wingtipmaps.gateway.service.AircraftLimits;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import java.math.BigDecimal;
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
import org.springframework.test.web.servlet.MockMvc;

/** The HTTP contract: signed out is 401 (not a redirect a fetch() would follow), a bad body
 *  400, a good one 200; the services mocked, pilot-scoping being the repository's. */
@WebMvcTest(AircraftController.class)
@Import(app.wingtipmaps.gateway.security.SecurityConfig.class)
class AircraftControllerTest {

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

    /** The planner, whose engine says when the inspections fall due
     *  (inspections_due, tested against the shared records.json): nothing
     *  due here unless a test says. */
    @MockitoBean
    private PlannerClient planner;

    /** The engine's limits, asked through the planner: nothing wrong unless a test says. */
    @MockitoBean
    private AircraftLimits limits;

    private static final PlannerInspections NOTHING_DUE = new PlannerInspections();

    @BeforeEach
    void nothingDue() {
        given(planner.inspections(any(), any(), any(), any(), any(), any(), any(), any()))
                .willReturn(NOTHING_DUE);
    }

    private static Pilot samplePilot() {
        return new Pilot("pilot@example.com", "A. Pilot", "sub-1");
    }

    private static Aircraft sampleAircraft() {
        return new Aircraft(samplePilot(), "N12345", "C172", 110, 8.5, null, null, null, null, null, 40.0);
    }

    /** A method the path doesn't map is a 405, not the catch-all 500 --
     *  see {@code GlobalExceptionHandler}. */
    @Test
    void put_returns405_becauseTheCollectionOnlyListsAndCreates() throws Exception {
        mockMvc.perform(put("/api/aircraft").with(oidcLogin()).with(csrf())).andExpect(status().isMethodNotAllowed());
    }

    @Test
    void list_returns401_whenSignedOut() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.empty());

        mockMvc.perform(get("/api/aircraft")).andExpect(status().isUnauthorized());
    }

    @Test
    void list_returns200_withThisPilotsAircraft() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(aircraftService.list(any())).willReturn(List.of(sampleAircraft()));

        mockMvc.perform(get("/api/aircraft").with(oidcLogin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tailNumber").value("N12345"));
    }

    /** What the engine's aircraft_problems finds wrong (AircraftLimits,
     *  its cases the engine's own tests and the shared fixture
     *  aircraftForm.json) is a 400 naming each field, and nothing is saved. */
    @Test
    void add_returns400_namingEachField_whenTheLimitsRefuseIt() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        willThrow(new AircraftLimits.Refused(Map.of("cruisePowerPct", "Cruise power must be between 40 and 100%")))
                .given(limits)
                .check(any());

        mockMvc.perform(post("/api/aircraft")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tailNumber\":\"N1\",\"typeDesignator\":\"C172\",\"cruiseTasKt\":110,"
                                + "\"fuelBurnGph\":8.5,\"cruisePowerPct\":30}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("Invalid request: ")))
                .andExpect(jsonPath("$.errors[0]").value("cruisePowerPct: Cruise power must be between 40 and 100%"));
        verifyNoInteractions(aircraftService);
    }

    @Test
    void add_returns200_forAValidRequest() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(aircraftService.add(
                        any(),
                        anyString(),
                        anyString(),
                        anyDouble(),
                        anyDouble(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any()))
                .willReturn(sampleAircraft());

        mockMvc.perform(
                        post("/api/aircraft")
                                .with(oidcLogin())
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"tailNumber\":\"N12345\",\"typeDesignator\":\"C172\",\"cruiseTasKt\":110,\"fuelBurnGph\":8.5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tailNumber").value("N12345"));
    }

    /** The flight plan's items 10a, 10b and 19 A/ go through to the
     *  airplane and back, as the Brief's form fills them in. */
    @Test
    void add_passesTheFlightPlansEquipmentSurveillanceAndColourThrough() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(aircraftService.add(
                        any(),
                        eq("N12345"),
                        eq("C172"),
                        eq(110.0),
                        eq(8.5),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        eq("SDFGRY"),
                        eq("B1"),
                        eq("White blue stripes"),
                        any()))
                .willReturn(sampleAircraft().describeForFlightPlan("SDFGRY", "B1", "White blue stripes"));

        mockMvc.perform(post("/api/aircraft")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tailNumber\":\"N12345\",\"typeDesignator\":\"C172\",\"cruiseTasKt\":110,"
                                + "\"fuelBurnGph\":8.5,\"equipment\":\"SDFGRY\",\"surveillance\":\"B1\","
                                + "\"colour\":\"White blue stripes\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.equipment").value("SDFGRY"))
                .andExpect(jsonPath("$.surveillance").value("B1"))
                .andExpect(jsonPath("$.colour").value("White blue stripes"));
    }

    @Test
    void delete_returns404_whenTheAircraftIsNotThisPilots() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(aircraftService.delete(any(), anyLong())).willReturn(false);

        mockMvc.perform(delete("/api/aircraft/999").with(oidcLogin()).with(csrf()))
                .andExpect(status().isNotFound());
    }

    /** 14 CFR 91.171: a VOR check recorded with its date, kind, place and
     *  error, and the engine's word on it (good for 30 days, within 4
     *  degrees at a VOT) passed on. */
    @Test
    void aVorCheckIsRecordedAndSaysHowLongItIsGoodFor() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(planner.inspections(
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        eq(java.time.LocalDate.of(2026, 10, 1)),
                        eq("VOT"),
                        eq(-5.0)))
                .willReturn(new PlannerInspections()
                        .vorCheck(new PlannerVorCheckOutput()
                                .limitDeg(new BigDecimal("4.0"))
                                .within(false)
                                .until(java.time.LocalDate.of(2026, 10, 31))));
        given(aircraftService.recordVorCheck(any(), eq(7L), any(), any(), any(), anyDouble()))
                .willReturn(Optional.of(sampleAircraft()
                        .recordVorCheck(
                                java.time.LocalDate.of(2026, 10, 1),
                                app.wingtipmaps.gateway.domain.VorCheck.VOT,
                                "KDLH VOT",
                                -5.0)));

        mockMvc.perform(
                        put("/api/aircraft/7/vor-check")
                                .with(oidcLogin())
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"checkedOn\":\"2026-10-01\",\"kind\":\"VOT\",\"place\":\"KDLH VOT\",\"errorDeg\":-5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vorCheck.goodThrough").value("2026-10-31"))
                .andExpect(jsonPath("$.vorCheck.limitDeg").value(4.0))
                // 5 degrees off at a VOT is over its 4.
                .andExpect(jsonPath("$.vorCheck.withinLimit").value(false));

        mockMvc.perform(put("/api/aircraft/7/vor-check")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checkedOn\":\"2999-01-01\",\"kind\":\"VOT\",\"errorDeg\":1}"))
                .andExpect(status().isBadRequest());
    }

    /** 14 CFR 91.409(a), 91.411(a), 91.413(a), 91.207(d): each good to the
     *  end of its calendar month 12 or 24 months on -- an annual on
     *  5 October 2025 to 31 October 2026, an annual on 31 January 2026 to
     *  31 January 2027 -- and the 100-hour due 100 hours of time in service
     *  after the last (91.409(b)). */
    @Test
    void theInspectionsAreRecordedEachWithTheLastDayItIsGoodFor() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(aircraftService.recordInspections(any(), eq(7L), any()))
                .willReturn(Optional.of(sampleAircraft()
                        .recordInspections(
                                java.time.LocalDate.of(2025, 10, 5),
                                1200.5,
                                1290.0,
                                java.time.LocalDate.of(2024, 11, 30),
                                java.time.LocalDate.of(2025, 2, 1),
                                java.time.LocalDate.of(2026, 1, 31),
                                java.time.LocalDate.of(2028, 6, 1))));
        // The days are the engine's, through the planner (inspections_due):
        // its answer for the airplane's own dates, which the gateway sends.
        given(planner.inspections(
                        eq(java.time.LocalDate.of(2025, 10, 5)),
                        eq(java.time.LocalDate.of(2026, 1, 31)),
                        eq(java.time.LocalDate.of(2024, 11, 30)),
                        eq(java.time.LocalDate.of(2025, 2, 1)),
                        eq(1200.5),
                        any(),
                        any(),
                        any()))
                .willReturn(new PlannerInspections()
                        .annualUntil(java.time.LocalDate.of(2026, 10, 31))
                        .eltUntil(java.time.LocalDate.of(2027, 1, 31))
                        .staticCheckUntil(java.time.LocalDate.of(2026, 11, 30))
                        .transponderCheckUntil(java.time.LocalDate.of(2027, 2, 28))
                        .hundredHourDueAtHours(new BigDecimal("1300.5")));

        mockMvc.perform(put("/api/aircraft/7/inspections")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"annualOn\":\"2025-10-05\",\"hundredHourAtHours\":1200.5,\"hoursNow\":1290,"
                                + "\"staticCheckOn\":\"2024-11-30\",\"transponderCheckOn\":\"2025-02-01\","
                                + "\"eltInspectedOn\":\"2026-01-31\",\"eltBatteryDueOn\":\"2028-06-01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inspections.annualGoodThrough").value("2026-10-31"))
                .andExpect(jsonPath("$.inspections.hundredHourDueAtHours").value(1300.5))
                .andExpect(jsonPath("$.inspections.staticCheckGoodThrough").value("2026-11-30"))
                .andExpect(jsonPath("$.inspections.transponderCheckGoodThrough").value("2027-02-28"))
                .andExpect(jsonPath("$.inspections.eltInspectionGoodThrough").value("2027-01-31"))
                .andExpect(jsonPath("$.inspections.eltBatteryDueOn").value("2028-06-01"));

        // An inspection to come is not one done; negative hours are no hours.
        mockMvc.perform(put("/api/aircraft/7/inspections")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"annualOn\":\"2999-01-01\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/aircraft/7/inspections")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"hoursNow\":-1}"))
                .andExpect(status().isBadRequest());
    }

    /** An airplane whose owner has said nothing is neither current nor overdue. */
    @Test
    void noInspectionsRecordedIsNoDates() {
        AircraftDto.InspectionsDto none = AircraftController.inspectionsOf(sampleAircraft(), NOTHING_DUE);
        org.assertj.core.api.Assertions.assertThat(none.annualGoodThrough()).isNull();
        org.assertj.core.api.Assertions.assertThat(none.hundredHourDueAtHours()).isNull();
        org.assertj.core.api.Assertions.assertThat(none.eltBatteryDueOn()).isNull();
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
