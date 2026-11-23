package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract

/**
 * The runway proximity advisor's two lines over the airport diagram, the
 * engine's words as they are (RunwayAdvisor): "Approaching runway 9-27"
 * and "Hold short line in about 150 ft · Hot spot HS 1, 300 ft". On a
 * runway, or near a closed one, in the error container, the runway being
 * where an incursion happens; else the secondary container. Read out by
 * TalkBack as it changes (a polite live region). Nothing with no words.
 */
@Composable
fun RunwayAdviceBanner(advice: EngineContract.RunwayProximityAnswer?, modifier: Modifier = Modifier) {
    advice ?: return
    val shown = advice.shown
    val detail = advice.detail
    if (shown == null && detail == null) return
    val urgent = advice.state == "on_runway" || advice.closed
    val colors = MaterialTheme.colorScheme
    Surface(
        modifier.semantics { liveRegion = LiveRegionMode.Polite },
        shape = MaterialTheme.shapes.large,
        color = if (urgent) colors.errorContainer else colors.secondaryContainer,
        contentColor = if (urgent) colors.onErrorContainer else colors.onSecondaryContainer,
        tonalElevation = 3.dp,
        shadowElevation = 2.dp,
    ) {
        Column(Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm)) {
            shown?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
            detail?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}
