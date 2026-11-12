package app.wingtipmaps.android.ui

import android.content.ClipData
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * A frequency wherever one is shown -- the field's card, an airspace's
 * whom to call, the emergency assistant's -- the same row everywhere: its
 * name, the frequency in the tint, and the whole row Copy, the copy glyph
 * turning to a tick for a moment so the pilot sees it was taken. Tune is
 * left out: this phone has no link to a radio that sets one (the cockpit
 * receiver only listens), so none is offered. A NOTAM on it puts its
 * badge after its name (`badge`), its own tap.
 */
@Composable
fun FrequencyRow(name: String, frequency: String, line: String? = null, badge: (@Composable () -> Unit)? = null) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember(frequency) { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(COPIED_SHOWN_MS)
            copied = false
        }
    }
    val copyLabel = stringResource(R.string.frequency_copy, frequency)
    ListItem(
        // Compose's own clipboard (Android's, which shows the system's
        // own copied notice from Android 13); the tick once it is taken.
        onClick = {
            scope.launch {
                clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(name, frequency)))
                copied = true
            }
        },
        supportingContent = line?.let { { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                Text(frequency, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                Icon(
                    if (copied) Icons.Filled.Check else WingtipIcons.copy,
                    contentDescription = if (copied) stringResource(R.string.frequency_copied) else null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().semantics { onClick(label = copyLabel, action = null) },
        // A NOTAM's badge by its name, a tap of its own (the airport card's).
        content = {
            if (badge == null) {
                Text(name)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(name)
                    badge()
                }
            }
        },
    )
}

/** How long the tick stays after a Copy. */
private const val COPIED_SHOWN_MS = 2_000L
