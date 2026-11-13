package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.service.DiagnosticText;
import app.wingtipmaps.gateway.service.DiagnosticsService;
import app.wingtipmaps.gateway.service.DiagnosticsService.Fault;
import app.wingtipmaps.gateway.service.DiagnosticsService.Origin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * What goes wrong on a pilot's device, and how fast the app is there, from
 * all three apps by one door, so the owner hears of a fault without the
 * pilot writing in:
 *
 * <ul>
 *   <li>the web app: an error, a promise or a render nobody caught
 *   (apps/web/src/lib/errorReports.ts), and its long tasks
 *   (apps/web/src/lib/longTasks.ts);</li>
 *   <li>the iPhone app: MetricKit's crash, hang and exception diagnostics
 *   and its daily launch and hang figures (apps/ios/Wingtip/Metrics.swift);</li>
 *   <li>the Android app: the reasons the system gives for its last exits
 *   (ApplicationExitInfo), an uncaught exception, and its start-up time
 *   and slow frames (apps/android/.../diagnostics).</li>
 * </ul>
 *
 * <p>Nothing of the pilot's: no session is read, the caller's address is
 * used in memory only for the hour's allowance, and the text is scrubbed
 * before it is kept (DiagnosticText). Open to anyone, since a fault before
 * sign-in counts as much as one after, and so held to 30 reports an hour
 * per caller, past which they are dropped without a word: an app in a
 * loop must not fill the table. No CSRF token: the web sends it with
 * navigator.sendBeacon, which carries no header, the phones hold no
 * cookie to echo, and a forged report can only add a row the owner reads.
 *
 * <p>The shape rules are here and nowhere else: a report past the size
 * limits is cut to them, a version is cleaned to its alphabet and cut, and
 * a fault of an unknown kind or a figure of an unknown name is dropped,
 * none of them refused, so the faults in a report are not lost to one bad
 * field and the apps hold no copy of the rules. What was cut or dropped
 * is logged.
 *
 * <p>Reading them back is the developer's (SecurityConfig).
 */
@RestController
@RequestMapping("/api/diagnostics")
@Tag(name = "Diagnostics", description = "Faults and speed from pilots' devices, kept without anything of the pilot's")
public class DiagnosticsController {

    /** Reports per caller per hour. */
    static final int PER_HOUR = 30;

    /** The most faults kept from one report; the first ones, as the
     *  oldest is the likeliest cause of the rest. */
    static final int MAX_FAULTS = 20;

    /** The longest signature and detail kept, in characters. */
    static final int MAX_SIGNATURE = 2000;

    static final int MAX_DETAIL = 64000;

    /** The longest system name kept. */
    static final int MAX_OS = 40;

    /** The most figures kept, and the range each is held to. */
    static final int MAX_METRICS = 30;

    static final double MAX_METRIC = 100_000_000;

    private static final Logger log = LoggerFactory.getLogger(DiagnosticsController.class);

    private static final String NAME = "[a-z][a-z0-9-]{0,39}";

    /** The version's alphabet and its longest length, in characters. */
    private static final java.util.regex.Pattern NOT_VERSION = java.util.regex.Pattern.compile("[^A-Za-z0-9._ ()+-]");

    static final int MAX_VERSION = 40;

    private static final java.util.regex.Pattern METRIC_NAME = java.util.regex.Pattern.compile("[a-z][a-z0-9_]{0,39}");

    private static final java.util.Set<String> KINDS =
            java.util.Set.of("crash", "hang", "exit", "error", "exception", "cpu", "disk");

    private final DiagnosticsService diagnostics;
    private final SlidingWindowLimiter recent = new SlidingWindowLimiter(Duration.ofHours(1));

    public DiagnosticsController(DiagnosticsService diagnostics) {
        this.diagnostics = diagnostics;
    }

    /** One fault: what kind, a one-line signature (the exception's type
     *  and message, the exit's reason), its detail (a stack, MetricKit's
     *  call tree) and when, where the device knows. */
    public record FaultReport(
            @NotNull String kind, @NotBlank String signature, String detail, Instant at) {}

    /** A device's faults and measurements, with the platform, the app's
     *  version and build, the system's version and the kind of device. */
    public record DiagnosticsReport(
            @NotNull @Pattern(regexp = "web|ios|android") String platform,
            @NotNull String version,
            String os,

            @NotNull @Pattern(regexp = "phone|tablet|desktop")
            String device,

            @Pattern(regexp = NAME) String page,
            List<@Valid @NotNull FaultReport> faults,

            Map<String, @NotNull Double> metrics) {}

    /** A kept fault, as the developer reads it. */
    public record DiagnosticDto(
            Instant receivedAt,
            Instant occurredAt,
            String platform,
            String version,
            String os,
            String device,
            String kind,
            String signature,
            String detail) {}

    @Operation(
            summary = "Report faults and speed from a pilot's device",
            description = "Kept without the pilot's session, address or anything they typed; 30 an hour per caller, "
                    + "the rest dropped.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Kept, or dropped past the hour's allowance"),
        @ApiResponse(responseCode = "400", description = "Not a diagnostics report")
    })
    @PostMapping
    public ResponseEntity<Void> report(@Valid @RequestBody DiagnosticsReport report, HttpServletRequest request) {
        if (recent.allow("diagnostics:" + SlidingWindowLimiter.clientOf(request), PER_HOUR, Instant.now())) {
            List<FaultReport> allFaults = report.faults() == null ? List.of() : report.faults();
            List<FaultReport> sent =
                    allFaults.stream().filter(f -> KINDS.contains(f.kind())).toList();
            Map<String, Double> allFigures = report.metrics() == null ? Map.of() : report.metrics();
            Map<String, Double> figures = new LinkedHashMap<>();
            allFigures.forEach((name, value) -> {
                if (METRIC_NAME.matcher(name).matches()) {
                    figures.put(name, value);
                }
            });
            String version = cleanVersion(report.version());
            List<Fault> faults = sent.stream()
                    .limit(MAX_FAULTS)
                    .map(f ->
                            new Fault(f.kind(), cut(f.signature(), MAX_SIGNATURE), cut(f.detail(), MAX_DETAIL), f.at()))
                    .toList();
            Map<String, Double> kept = new LinkedHashMap<>();
            figures.entrySet().stream()
                    .limit(MAX_METRICS)
                    .forEach(e -> kept.put(e.getKey(), Math.max(0, Math.min(MAX_METRIC, e.getValue()))));
            logTrimmed(
                    report, version, allFaults.size() - sent.size(), sent, allFigures.size() - figures.size(), figures);
            diagnostics.record(
                    new Origin(report.platform(), version, cut(report.os(), MAX_OS), report.device()),
                    faults,
                    report.page() == null ? "app" : report.page(),
                    kept);
        }
        return ResponseEntity.noContent().build();
    }

    /** The version in its alphabet and at most 40 characters; "unknown"
     *  when nothing of it is left. */
    private static String cleanVersion(String version) {
        String clean = NOT_VERSION.matcher(version).replaceAll("");
        clean = cut(clean, MAX_VERSION);
        return clean.isEmpty() ? "unknown" : clean;
    }

    private static String cut(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max);
    }

    /** One line saying how much of an oversized report was cut, so the
     *  owner sees an app that sends too much. */
    private static void logTrimmed(
            DiagnosticsReport report,
            String version,
            int unknownKinds,
            List<FaultReport> sent,
            int unknownFigures,
            Map<String, Double> figures) {
        int faultsDropped = Math.max(0, sent.size() - MAX_FAULTS) + unknownKinds;
        int figuresDropped = Math.max(0, figures.size() - MAX_METRICS) + unknownFigures;
        long cutText = sent.stream()
                        .limit(MAX_FAULTS)
                        .filter(f -> f.signature().length() > MAX_SIGNATURE
                                || (f.detail() != null && f.detail().length() > MAX_DETAIL))
                        .count()
                + (report.os() != null && report.os().length() > MAX_OS ? 1 : 0)
                + (version.equals(report.version()) ? 0 : 1);
        if (faultsDropped > 0 || figuresDropped > 0 || cutText > 0) {
            log.info(
                    "{} {} diagnostics report trimmed: {} faults dropped, {} figures dropped, {} long texts cut",
                    report.platform(),
                    DiagnosticText.oneLine(report.version(), 80),
                    faultsDropped,
                    figuresDropped,
                    cutText);
        }
    }

    @Operation(
            summary = "The newest faults from pilots' devices",
            description = "At most 200, newest first, from the last few days; the developer's.")
    @GetMapping
    public List<DiagnosticDto> recent(@RequestParam(defaultValue = "7") int days) {
        // Held to the 30 days a fault is kept (DiagnosticsService.KEPT).
        return diagnostics.recent(Math.max(1, Math.min(30, days))).stream()
                .map(d -> new DiagnosticDto(
                        d.getReceivedAt(),
                        d.getOccurredAt(),
                        d.getPlatform(),
                        d.getVersion(),
                        d.getOs(),
                        d.getDevice(),
                        d.getKind(),
                        d.getSignature(),
                        d.getDetail()))
                .toList();
    }
}
