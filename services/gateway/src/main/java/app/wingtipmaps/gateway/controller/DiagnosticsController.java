package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.service.DiagnosticsService;
import app.wingtipmaps.gateway.service.DiagnosticsService.Fault;
import app.wingtipmaps.gateway.service.DiagnosticsService.Origin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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
 * <p>Reading them back is the developer's (SecurityConfig).
 */
@RestController
@RequestMapping("/api/diagnostics")
@Tag(name = "Diagnostics", description = "Faults and speed from pilots' devices, kept without anything of the pilot's")
public class DiagnosticsController {

    /** Reports per caller per hour. */
    static final int PER_HOUR = 30;

    private static final String NAME = "[a-z][a-z0-9-]{0,39}";
    private static final String VERSION = "[A-Za-z0-9._ ()+-]{1,40}";

    private final DiagnosticsService diagnostics;
    private final SlidingWindowLimiter recent = new SlidingWindowLimiter(Duration.ofHours(1));

    public DiagnosticsController(DiagnosticsService diagnostics) {
        this.diagnostics = diagnostics;
    }

    /** One fault: what kind, a one-line signature (the exception's type
     *  and message, the exit's reason), its detail (a stack, MetricKit's
     *  call tree) and when, where the device knows. */
    public record FaultReport(
            @NotNull @Pattern(regexp = "crash|hang|exit|error|exception|cpu|disk")
            String kind,

            @NotBlank @Size(max = 2000) String signature,
            @Size(max = 64000) String detail,
            Instant at) {}

    /** A device's faults and measurements, with the platform, the app's
     *  version and build, the system's version and the kind of device. */
    public record DiagnosticsReport(
            @NotNull @Pattern(regexp = "web|ios|android") String platform,
            @NotNull @Pattern(regexp = VERSION) String version,
            @Size(max = 40) String os,

            @NotNull @Pattern(regexp = "phone|tablet|desktop")
            String device,

            @Pattern(regexp = NAME) String page,
            @Size(max = 20) List<@Valid @NotNull FaultReport> faults,

            @Size(max = 30)
            Map<
                            @Pattern(regexp = "[a-z][a-z0-9_]{0,39}") String,
                            @NotNull @DecimalMin("0") @DecimalMax("100000000") Double>
                    metrics) {}

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
            List<Fault> faults = report.faults() == null
                    ? List.of()
                    : report.faults().stream()
                            .map(f -> new Fault(f.kind(), f.signature(), f.detail(), f.at()))
                            .toList();
            diagnostics.record(
                    new Origin(report.platform(), report.version(), report.os(), report.device()),
                    faults,
                    report.page() == null ? "app" : report.page(),
                    report.metrics() == null ? Map.of() : report.metrics());
        }
        return ResponseEntity.noContent().build();
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
