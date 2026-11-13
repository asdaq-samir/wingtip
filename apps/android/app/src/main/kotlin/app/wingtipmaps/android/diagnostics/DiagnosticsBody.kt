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
 * The shape rules are the gateway's alone (DiagnosticsController cuts a
 * report to its limits, cleans the version and drops what it does not
 * know); the values go as they are. Null when there is nothing to send.
 */
object DiagnosticsBodies {
    fun build(
        versionName: String,
        versionCode: Int,
        release: String,
        tablet: Boolean,
        faults: List<FaultReport>,
        metrics: Map<String, Double>,
    ): DiagnosticsReport? {
        val kept = faults.map { fault ->
            fault.copy(
                // One line: the first of the signature's, as the server groups by it.
                signature = fault.signature.lineSequence().firstOrNull { it.isNotBlank() }.orEmpty().trim()
                    .ifEmpty { fault.kind },
            )
        }
        val figures = metrics.filter { (_, value) -> value.isFinite() }
            .entries.associate { (name, value) -> name to value }
        if (kept.isEmpty() && figures.isEmpty()) return null
        val version = "$versionName ($versionCode)"
        return DiagnosticsReport(
            platform = "android",
            version = version,
            os = "Android $release",
            device = if (tablet) "tablet" else "phone",
            // The app as a whole: the gateway's page for a report from no page.
            page = "app",
            faults = kept,
            metrics = figures,
        )
    }
}
