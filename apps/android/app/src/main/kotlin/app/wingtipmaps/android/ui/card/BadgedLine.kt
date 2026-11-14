package app.wingtipmaps.android.ui.card

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.wingtipmaps.android.design.generated.WingtipSpace

/** A status a row leads with, and the words it says where they are more
 *  than its own word ("Closed indefinitely"). */
data class Badged(val status: Status, val words: String? = null)

/**
 * A row's line under its name, led by the statuses a pilot scans for
 * (rules.md 9): each a StatusBadge, then the words that explain, wrapping
 * under them at a large text size rather than cutting them off.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BadgedLine(badges: List<Badged>, text: String?, modifier: Modifier = Modifier) {
    FlowRow(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        badges.forEach { StatusBadge(it.status, words = it.words) }
        text?.takeIf { it.isNotEmpty() }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
