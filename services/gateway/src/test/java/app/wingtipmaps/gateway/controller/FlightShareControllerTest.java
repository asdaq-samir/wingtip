package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.FlightShare;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.FlightCheckpointDto;
import app.wingtipmaps.gateway.dto.SharedFlightDto;
import app.wingtipmaps.gateway.service.FlightShareService;
import app.wingtipmaps.gateway.service.PilotService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** Sharing a saved flight by link, stopping it, and reading it signed out. */
@WebMvcTest(FlightShareController.class)
@Import(app.wingtipmaps.gateway.security.SecurityConfig.class)
class FlightShareControllerTest {

    private static final String TOKEN = "abcdefghijklmnopqrstuv";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FlightShareService shares;

    @MockitoBean
    private PilotService pilotService;

    private static Pilot samplePilot() {
        return new Pilot("pilot@example.com", "A. Pilot", "sub-1");
    }

    static SharedFlightDto sampleShared() {
        return new SharedFlightDto(
                "KMSN",
                "KOSH",
                List.of(),
                "C172",
                null,
                3500,
                55.0,
                30.0,
                4.3,
                null,
                null,
                null,
                List.of(
                        new FlightCheckpointDto(
                                0, "KMSN", "departure", 43.14, -89.34, 0, 55.0, 40.0, 42.0, 110.0, 30.0, 4.3, 3500.0),
                        new FlightCheckpointDto(
                                1, "KOSH", "destination", 43.98, -88.56, 55, null, null, null, null, null, null, null)),
                Instant.parse("2026-11-09T12:00:00Z"));
    }

    @Test
    void share_answersTheLink_withTheNumberLeftOutUnlessAskedFor() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(shares.share(any(), eq(7L), anyBoolean())).willReturn(Optional.of(new FlightShare(7L, TOKEN, false)));

        mockMvc.perform(post("/api/flights/7/share").with(oidcLogin()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(TOKEN))
                .andExpect(jsonPath("$.includeTail").value(false))
                .andExpect(jsonPath("$.url").value("http://localhost/app/plan?open=shared&share=" + TOKEN));
        verify(shares).share(any(), eq(7L), eq(false));
    }

    @Test
    void share_takesTheNumberWhenThePilotTurnsItOn() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(shares.share(any(), eq(7L), anyBoolean())).willReturn(Optional.of(new FlightShare(7L, TOKEN, true)));

        mockMvc.perform(post("/api/flights/7/share")
                        .with(oidcLogin())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"includeTail\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.includeTail").value(true));
        verify(shares).share(any(), eq(7L), eq(true));
    }

    @Test
    void share_is404_forAFlightNotTheirs_and401_signedOut() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(shares.share(any(), eq(8L), anyBoolean())).willReturn(Optional.empty());
        mockMvc.perform(post("/api/flights/8/share").with(oidcLogin()).with(csrf()))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/flights/7/share").with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void stop_is204_andNeedsTheCsrfToken() throws Exception {
        given(pilotService.current(any())).willReturn(Optional.of(samplePilot()));
        given(shares.stop(any(), eq(7L))).willReturn(true);

        mockMvc.perform(delete("/api/flights/7/share").with(oidcLogin()).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/flights/7/share").with(oidcLogin())).andExpect(status().isForbidden());
    }

    @Test
    void aLinkIsReadSignedOut_andNeverKept() throws Exception {
        given(shares.shared(TOKEN)).willReturn(Optional.of(sampleShared()));

        mockMvc.perform(get("/api/shared-flights/" + TOKEN))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.departureIdent").value("KMSN"))
                .andExpect(jsonPath("$.aircraftType").value("C172"))
                .andExpect(jsonPath("$.aircraftTailNumber").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.checkpoints.length()").value(2));
    }

    @Test
    void aStoppedLinkIs404() throws Exception {
        given(shares.shared(any())).willReturn(Optional.empty());

        mockMvc.perform(get("/api/shared-flights/" + TOKEN)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/shared-flights/" + TOKEN + "/image.png")).andExpect(status().isNotFound());
    }

    @Test
    void theRoutesPictureIsAPng() throws Exception {
        given(shares.shared(TOKEN)).willReturn(Optional.of(sampleShared()));

        mockMvc.perform(get("/api/shared-flights/" + TOKEN + "/image.png"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));
    }
}
