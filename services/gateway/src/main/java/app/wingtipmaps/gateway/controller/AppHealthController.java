package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.service.AppHealthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The apps' crashes, hangs and speed figures counted by build, for the
 * owner's status page (the web's developer console, System, Apps): what a
 * release changed, without reading 200 faults one by one. The owner's
 * alone (SecurityConfig, the developer's GETs), from the rows
 * DiagnosticsController and SpeedController keep, which name no pilot.
 */
@RestController
@RequestMapping("/api/diagnostics/versions")
@Tag(name = "Diagnostics", description = "Faults and speed from pilots' devices, kept without anything of the pilot's")
public class AppHealthController {

    private final AppHealthService health;

    public AppHealthController(AppHealthService health) {
        this.health = health;
    }

    /** One build's faults of one kind: the platform, the build, the kind
     *  (crash, hang, exit, error, exception, cpu, disk), how many and the
     *  newest's arrival. */
    public record VersionFaultsDto(String platform, String version, String kind, long count, String lastAt) {}

    /** One build's figures of one metric: where from (field, the web's
     *  Core Web Vitals; web, its long tasks; ios; android), how many and
     *  the 50th, 75th and 95th percentile. */
    public record VersionFigureDto(
            String source, String version, String metric, long count, double p50, double p75, double p95) {}

    /** The last days' faults and figures by build, newest build first. */
    public record AppVersionsDto(List<VersionFaultsDto> faults, List<VersionFigureDto> figures) {}

    @Operation(
            summary = "The apps' faults and speed figures by build",
            description = "Counted over the last few days (at most the 30 a fault is kept); the developer's.")
    @GetMapping
    public AppVersionsDto byVersion(@RequestParam(defaultValue = "7") int days) {
        AppHealthService.ByVersion found = health.byVersion(days);
        return new AppVersionsDto(
                found.faults().stream()
                        .map(f -> new VersionFaultsDto(
                                f.getPlatform(), f.getVersion(), f.getKind(), f.getCount(), f.getLastAt()))
                        .toList(),
                found.figures().stream()
                        .map(f -> new VersionFigureDto(
                                f.getSource(),
                                f.getVersion(),
                                f.getMetric(),
                                f.getCount(),
                                f.getP50(),
                                f.getP75(),
                                f.getP95()))
                        .toList());
    }
}
