package app.wingtipmaps.gateway.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.PilotRole;
import app.wingtipmaps.gateway.repository.DiagnosticRepository;
import app.wingtipmaps.gateway.repository.SpeedSampleRepository;
import app.wingtipmaps.gateway.security.SecurityConfig;
import app.wingtipmaps.gateway.service.AppHealthService;
import app.wingtipmaps.gateway.service.PilotService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The apps' faults and figures by build, the owner's status page: read by
 * the developer alone, a build's crashes counted under its version.
 */
@WebMvcTest(AppHealthController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = "spring.mail.host=smtp.example.com")
class AppHealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AppHealthService health;

    @MockitoBean
    private PilotService pilotService;

    @Test
    void nobodySignedInReadsThem() throws Exception {
        mockMvc.perform(get("/api/diagnostics/versions")).andExpect(status().isUnauthorized());
    }

    @Test
    void aPilotWhoIsNotTheDeveloperIsRefused() throws Exception {
        signedInAs(PilotRole.PILOT);
        mockMvc.perform(get("/api/diagnostics/versions").with(oidcLogin())).andExpect(status().isForbidden());
    }

    @Test
    void theDeveloperReadsEachBuildsCrashesAndFigures() throws Exception {
        signedInAs(PilotRole.DEVELOPER);
        DiagnosticRepository.VersionFaults crashes = mock(DiagnosticRepository.VersionFaults.class);
        given(crashes.getPlatform()).willReturn("ios");
        given(crashes.getVersion()).willReturn("1.0 (42)");
        given(crashes.getKind()).willReturn("crash");
        given(crashes.getCount()).willReturn(3L);
        given(crashes.getLastAt()).willReturn("2026-11-21T10:00:00Z");
        SpeedSampleRepository.VersionFigure launch = mock(SpeedSampleRepository.VersionFigure.class);
        given(launch.getSource()).willReturn("android");
        given(launch.getVersion()).willReturn("1.0 (42)");
        given(launch.getMetric()).willReturn("launch_ms");
        given(launch.getCount()).willReturn(12L);
        given(launch.getP50()).willReturn(640.0);
        given(launch.getP75()).willReturn(810.0);
        given(launch.getP95()).willReturn(1400.0);
        given(health.byVersion(anyInt())).willReturn(new AppHealthService.ByVersion(List.of(crashes), List.of(launch)));

        mockMvc.perform(get("/api/diagnostics/versions").param("days", "14").with(oidcLogin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faults[0].platform").value("ios"))
                .andExpect(jsonPath("$.faults[0].kind").value("crash"))
                .andExpect(jsonPath("$.faults[0].count").value(3))
                .andExpect(jsonPath("$.figures[0].metric").value("launch_ms"))
                .andExpect(jsonPath("$.figures[0].p95").value(1400.0));
        verify(health).byVersion(14);
    }

    private void signedInAs(PilotRole role) {
        Pilot pilot = new Pilot("pilot@example.com", "A. Pilot", "sub-1");
        ReflectionTestUtils.setField(pilot, "role", role);
        given(pilotService.current(any())).willReturn(Optional.of(pilot));
    }
}
