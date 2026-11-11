package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Diagnostic;
import app.wingtipmaps.gateway.repository.DiagnosticRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What the apps report about themselves (DiagnosticsController): each
 * fault kept, scrubbed (DiagnosticText), and written to the server's log
 * as one line too, where the owner already reads the web's; each
 * measurement put in the speed trend beside the browsers' (SpeedService),
 * under its platform's name. A fault is let go after 30 days (the owner,
 * 2026-11-09), each night and as reports come in.
 */
@Service
public class DiagnosticsService {

    /** How long a fault is kept: a release's first month, and no longer
     *  than the server's own log keeps the same lines (CloudWatch's 30 days). */
    static final Duration KEPT = Duration.ofDays(30);

    /** The most of a fault's detail kept: a symbolicated stack's worth. */
    public static final int DETAIL_MAX = 16_000;

    private static final Logger log = LoggerFactory.getLogger(DiagnosticsService.class);

    private final DiagnosticRepository faults;
    private final SpeedService speed;
    private final AtomicReference<LocalDate> pruned = new AtomicReference<>();

    public DiagnosticsService(DiagnosticRepository faults, SpeedService speed) {
        this.faults = faults;
        this.speed = speed;
    }

    /** Where and on what a report was made. */
    public record Origin(String platform, String version, String os, String device) {}

    /** One fault as the device described it. */
    public record Fault(String kind, String signature, String detail, Instant at) {}

    /** Keeps a device's faults and measurements. The measurements are of
     *  {@code page}: the web's page, "app" for a phone's. */
    @Transactional
    public void record(Origin origin, List<Fault> reported, String page, Map<String, Double> metrics) {
        Instant now = Instant.now();
        String os = origin.os() == null ? null : DiagnosticText.oneLine(origin.os(), 40);
        for (Fault fault : reported) {
            String signature = DiagnosticText.oneLine(fault.signature(), 200);
            String detail = DiagnosticText.scrub(fault.detail(), DETAIL_MAX);
            faults.save(new Diagnostic(
                    now,
                    fault.at(),
                    origin.platform(),
                    origin.version(),
                    os,
                    origin.device(),
                    fault.kind(),
                    signature,
                    detail));
            log.warn(
                    "{} {} [{}] {} ({}, {})\n{}",
                    origin.platform(),
                    origin.version(),
                    fault.kind(),
                    signature,
                    os == null ? "" : os,
                    origin.device(),
                    DiagnosticText.indented(detail));
        }
        if (!metrics.isEmpty()) {
            speed.record(origin.platform(), page, origin.device(), origin.version(), metrics);
        }
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate last = pruned.get();
        if (!today.equals(last) && pruned.compareAndSet(last, today)) {
            faults.deleteOlderThan(now.minus(KEPT));
        }
    }

    /** The faults past KEPT let go, each night, so a quiet day with no
     *  report still forgets them. Off where app.diagnostics.prune-cron is "-". */
    @Scheduled(cron = "${app.diagnostics.prune-cron:0 15 3 * * *}", zone = "UTC")
    @Transactional
    public void prune() {
        int gone = faults.deleteOlderThan(Instant.now().minus(KEPT));
        if (gone > 0) {
            log.info("{} device faults past {} days let go", gone, KEPT.toDays());
        }
    }

    /** The newest faults of the last {@code days}, at most 200. */
    @Transactional(readOnly = true)
    public List<Diagnostic> recent(int days) {
        return faults.findTop200ByReceivedAtAfterOrderByReceivedAtDesc(
                Instant.now().minus(Duration.ofDays(days)));
    }
}
