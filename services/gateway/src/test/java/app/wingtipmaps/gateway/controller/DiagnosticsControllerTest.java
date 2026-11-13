package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.security.SecurityConfig;
import app.wingtipmaps.gateway.service.DiagnosticsService;
import app.wingtipmaps.gateway.service.DiagnosticsService.Fault;
import app.wingtipmaps.gateway.service.DiagnosticsService.Origin;
import app.wingtipmaps.gateway.service.PilotService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The one door for the apps' faults and speed, through the deployed
 * security rules: a report is taken with no session and no CSRF token, as
 * sendBeacon and the phones send it, within its hour's allowance; one
 * too big is cut to the limits; one that is not a report is refused; and only the developer reads them.
 */
@WebMvcTest(DiagnosticsController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = "spring.mail.host=smtp.example.com")
class DiagnosticsControllerTest {

    private static final String IOS = """
            {"platform": "ios", "version": "1.0 (42)", "os": "iOS 26.1", "device": "phone",
             "faults": [{"kind": "crash", "signature": "EXC_BAD_ACCESS SIGSEGV", "detail": "Wingtip 0x1a2b",
                         "at": "2026-11-09T10:00:00Z"}],
             "metrics": {"launch_ms_p50": 812, "hang_ms": 0}}""";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiagnosticsService diagnostics;

    @MockitoBean
    private PilotService pilotService;

    @Test
    void aPhonesReportIsKeptWithNoSessionOrToken() throws Exception {
        mockMvc.perform(post("/api/diagnostics")
                        .header("X-Forwarded-For", "203.0.113.20")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(IOS))
                .andExpect(status().isNoContent());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Fault>> faults = ArgumentCaptor.forClass(List.class);
        verify(diagnostics)
                .record(
                        eq(new Origin("ios", "1.0 (42)", "iOS 26.1", "phone")),
                        faults.capture(),
                        eq("app"),
                        eq(Map.of("launch_ms_p50", 812.0, "hang_ms", 0.0)));
        assertThat(faults.getValue())
                .singleElement()
                .satisfies(f -> assertThat(f.signature()).isEqualTo("EXC_BAD_ACCESS SIGSEGV"));
    }

    @Test
    void notAReportIsRefused() throws Exception {
        mockMvc.perform(post("/api/diagnostics")
                        .header("X-Forwarded-For", "203.0.113.21")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(IOS.replace("\"ios\"", "\"watch\"")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/diagnostics")
                        .header("X-Forwarded-For", "203.0.113.21")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(IOS.replace("launch_ms_p50", "Position")))
                .andExpect(status().isBadRequest());
        verify(diagnostics, never()).record(any(), any(), anyString(), anyMap());
    }

    @Test
    void anOversizedReportIsCutToTheLimitsNotRefused() throws Exception {
        String faults = String.join(
                ",",
                java.util.Collections.nCopies(
                        DiagnosticsController.MAX_FAULTS + 5,
                        "{\"kind\": \"error\", \"signature\": \"" + "s".repeat(DiagnosticsController.MAX_SIGNATURE + 9)
                                + "\", \"detail\": \"" + "d".repeat(DiagnosticsController.MAX_DETAIL + 9) + "\"}"));
        String figures = java.util.stream.IntStream.range(0, DiagnosticsController.MAX_METRICS + 4)
                .mapToObj(i -> "\"m" + i + "\": " + (i == 0 ? "1e9" : "1"))
                .collect(java.util.stream.Collectors.joining(","));
        mockMvc.perform(post("/api/diagnostics")
                        .header("X-Forwarded-For", "203.0.113.23")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"platform\": \"android\", \"version\": \"1.0 (1)\", \"os\": \"" + "x".repeat(60)
                                + "\", \"device\": \"phone\", \"faults\": [" + faults + "], \"metrics\": {" + figures
                                + "}}"))
                .andExpect(status().isNoContent());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Fault>> keptFaults = ArgumentCaptor.forClass(List.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Double>> keptFigures = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<Origin> origin = ArgumentCaptor.forClass(Origin.class);
        verify(diagnostics).record(origin.capture(), keptFaults.capture(), eq("app"), keptFigures.capture());
        assertThat(origin.getValue().os()).hasSize(DiagnosticsController.MAX_OS);
        assertThat(keptFaults.getValue())
                .hasSize(DiagnosticsController.MAX_FAULTS)
                .allSatisfy(f -> {
                    assertThat(f.signature()).hasSize(DiagnosticsController.MAX_SIGNATURE);
                    assertThat(f.detail()).hasSize(DiagnosticsController.MAX_DETAIL);
                });
        assertThat(keptFigures.getValue()).hasSize(DiagnosticsController.MAX_METRICS);
        assertThat(keptFigures.getValue().get("m0")).isEqualTo(DiagnosticsController.MAX_METRIC);
    }

    @Test
    void pastTheHoursAllowanceReportsAreDroppedQuietly() throws Exception {
        for (int i = 0; i < DiagnosticsController.PER_HOUR + 5; i++) {
            mockMvc.perform(post("/api/diagnostics")
                            .header("X-Forwarded-For", "203.0.113.22")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(IOS))
                    .andExpect(status().isNoContent());
        }
        verify(diagnostics, times(DiagnosticsController.PER_HOUR)).record(any(), any(), anyString(), anyMap());
    }

    @Test
    void nobodySignedInReadsThem() throws Exception {
        mockMvc.perform(get("/api/diagnostics")).andExpect(status().isUnauthorized());
    }
}
