package app.wingtipmaps.android.diagnostics

import app.wingtipmaps.android.api.generated.gateway.DiagnosticsReport
import app.wingtipmaps.android.api.generated.gateway.FaultReport

/**
 * What the app sends the gateway (POST /api/diagnostics), its generated
 * DiagnosticsReport (from services/gateway/openapi.json): the build, the
 * system, a phone or a tablet, the faults since the last report and the
 * session's speed figures. Nothing of the pilot's: no account, no
 * position, no airplane or route, and the session's cookie is not sent
 * (DiagnosticsReporter), so a report is no one's.
 *
 * The body is cut to what the gateway takes, so a report is never refused
 * for its shape (a 400 would lose the faults in it): the limits are the
 * gateway's own (DiagnosticsController). Null when there is nothing to send.
 */
object DiagnosticsBodies {
    const val MAX_FAULTS = 20
    const val MAX_METRICS = 30
    const val MAX_SIGNATURE = 2000
    const val MAX_DETAIL = 64000
    const val MAX_METRIC = 1e8
    private const val MAX_WORDS = 40
    private val versionChars = Regex("[^A-Za-z0-9._ ()+-]")
    private val metricName = Regex("[a-z][a-z0-9_]{0,39}")
    private val kinds = setOf("crash", "hang", "exit", "error", "exception", "cpu", "disk")

    fun build(
        versionName: String,
        versionCode: Int,
        release: String,
        tablet: Boolean,
        faults: List<FaultReport>,
        metrics: Map<String, Double>,
    ): DiagnosticsReport? {
        val kept = faults.filter { it.kind in kinds }.takeLast(MAX_FAULTS).map { fault ->
            fault.copy(
                // One line: the first of the signature's, as the server groups by it.
                signature = fault.signature.lineSequence().firstOrNull { it.isNotBlank() }.orEmpty().trim().take(MAX_SIGNATURE)
                    .ifEmpty { fault.kind },
                detail = fault.detail.take(MAX_DETAIL),
            )
        }
        val figures = metrics.filter { (name, value) -> metricName.matches(name) && value.isFinite() }
            .entries.take(MAX_METRICS).associate { (name, value) -> name to value.coerceIn(0.0, MAX_METRIC) }
        if (kept.isEmpty() && figures.isEmpty()) return null
        val version = "$versionName ($versionCode)".replace(versionChars, "").take(MAX_WORDS).ifEmpty { "unknown" }
        return DiagnosticsReport(
            platform = "android",
            version = version,
            os = "Android $release".take(MAX_WORDS),
            device = if (tablet) "tablet" else "phone",
            // The app as a whole: the gateway's page for a report from no page.
            page = "app",
            faults = kept,
            metrics = figures,
        )
    }
}
