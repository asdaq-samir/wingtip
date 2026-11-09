package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import kotlinx.coroutines.delay

/**
 * "Removed KJVL · Undo" in the list the thing went from, for a few
 * seconds after a delete or an edit that took something away, as the
 * iPhone's UndoRow and the web's UndoRow: the result where it happened,
 * never a toast or a Snackbar (docs/navigation.md). Said once to TalkBack
 * as it appears; `onDone` runs when the time is up, so a delete can wait
 * for it to be kept. `key` starts the time again for a new removal.
 */
@Composable
fun UndoRow(words: String, key: Any, onUndo: () -> Unit, onDone: () -> Unit, modifier: Modifier = Modifier) {
    val done by rememberUpdatedState(onDone)
    AnnounceOnce(key, words)
    LaunchedEffect(key) {
        delay(UNDO_SHOWN_MS)
        done()
    }
    ListItem(
        leadingContent = { Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(words, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        trailingContent = { TextButton(onClick = onUndo) { Text(stringResource(R.string.undo), fontWeight = FontWeight.SemiBold) } },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = modifier.fillMaxWidth(),
    )
}

/** How long an Undo row stays: the iPhone's eight seconds. */
const val UNDO_SHOWN_MS = 8_000L
