package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.repository.DiagnosticRepository;
import app.wingtipmaps.gateway.repository.SpeedSampleRepository;
import app.wingtipmaps.gateway.service.DiagnosticsService;
import app.wingtipmaps.gateway.service.DiagnosticsService.Fault;
import app.wingtipmaps.gateway.service.DiagnosticsService.Origin;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** The apps' faults and speed (V35) against a real Postgres: the migration
 *  applies, a fault is kept scrubbed, and a phone's figures join the speed
 *  trend under its platform. */
@SpringBootTest
@Testcontainers
class DiagnosticsPersistenceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:18");

    @Autowired
    private DiagnosticsService diagnostics;

    @Autowired
    private DiagnosticRepository faults;

    @Autowired
    private SpeedSampleRepository samples;

    @BeforeEach
    void empty() {
        faults.deleteAll();
        samples.deleteAll();
    }

    @Test
    void aFaultIsKeptScrubbedAndAPhonesFiguresJoinTheTrend() {
        diagnostics.record(new Origin("android", "1.0 (7)", "Android 16", "phone"),
                List.of(new Fault("crash", "IllegalStateException: no pilot pilot@example.com",
                        "at app.wingtipmaps.android.Plan.load(Plan.kt:42)", Instant.parse("2026-11-09T10:00:00Z"))),
                "app", Map.of("launch_ms", 640.0));

        var kept = diagnostics.recent(1);
        assertThat(kept).singleElement().satisfies(d -> {
            assertThat(d.getPlatform()).isEqualTo("android");
            assertThat(d.getSignature()).isEqualTo("IllegalStateException: no pilot <email>");
            assertThat(d.getDetail()).contains("Plan.kt:42");
        });
        assertThat(samples.findAll()).singleElement().satisfies(s -> {
            assertThat(s.getSource()).isEqualTo("android");
            assertThat(s.getMetric()).isEqualTo("launch_ms");
            assertThat(s.getPage()).isEqualTo("app");
        });
    }
}
