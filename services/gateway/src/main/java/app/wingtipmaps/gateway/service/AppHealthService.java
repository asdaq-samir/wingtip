package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.repository.DiagnosticRepository;
import app.wingtipmaps.gateway.repository.SpeedSampleRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The apps' health by build, for the owner's status page
 * (AppHealthController): each build's crashes, hangs and other faults
 * from the diagnostics the apps send (DiagnosticsService, 30 days), and
 * how many speed figures came from it and how they fell (SpeedService).
 * Read from the rows already kept, which carry no pilot; nothing more is
 * stored for it.
 */
@Service
public class AppHealthService {

    /** The most days asked: as long as a fault is kept. */
    public static final int MOST_DAYS = (int) DiagnosticsService.KEPT.toDays();

    private final DiagnosticRepository faults;
    private final SpeedSampleRepository samples;

    public AppHealthService(DiagnosticRepository faults, SpeedSampleRepository samples) {
        this.faults = faults;
        this.samples = samples;
    }

    /** The last {@code days}' faults and figures, each by platform, build
     *  and kind or metric. */
    public record ByVersion(
            List<DiagnosticRepository.VersionFaults> faults, List<SpeedSampleRepository.VersionFigure> figures) {}

    @Transactional(readOnly = true)
    public ByVersion byVersion(int days) {
        Instant since = Instant.now().minus(Duration.ofDays(Math.max(1, Math.min(MOST_DAYS, days))));
        return new ByVersion(faults.faultsByVersionSince(since), samples.figuresByVersionSince(since));
    }
}
