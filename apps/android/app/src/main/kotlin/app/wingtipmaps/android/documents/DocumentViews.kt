package app.wingtipmaps.android.documents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.rememberAiOffered
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.documents.model.DocumentFlag
import app.wingtipmaps.android.documents.model.DocumentRead
import app.wingtipmaps.android.ui.LocalInk

/** The row a screen opens "Add from a Photo" with, in its own list: a
 *  row, not a floating control.  Not there where no model can read the
 *  page (AiOffered: no Gemini Nano here). */
@Composable
fun AddFromPhotoRow(line: String, title: String = stringResource(R.string.add_from_photo), onOpen: () -> Unit) {
    if (!rememberAiOffered()) return
    ListItem(
        onClick = onOpen,
        supportingContent = { Text(line, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        leadingContent = { Icon(Icons.Outlined.DocumentScanner, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(title) },
    )
}

/** "Reading the page…" while the photo is with the reader. */
@Composable
fun ReadingLine() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Loading(Modifier.size(WingtipSize.Chip))
        Text(stringResource(R.string.reading_page), style = MaterialTheme.typography.bodyMedium)
    }
}

/** What could not be read, and the reader's notes on the page. */
@Composable
fun ReadNotes(answer: DocumentRead) {
    answer.unreadable?.let {
        Text(stringResource(R.string.photo_unreadable, it), style = MaterialTheme.typography.bodyMedium, color = LocalInk.current.cautionInk)
    }
    answer.notes.orEmpty().forEach {
        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** A row's flags, each in its tone: wrong in the stop ink, check in the
 *  caution ink. */
@Composable
fun FlagLines(flags: List<DocumentFlag>) {
    val ink = LocalInk.current
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        flags.forEach { flag ->
            Text(
                flag.says,
                style = MaterialTheme.typography.bodySmall,
                color = when (FlagTone.of(flag.level)) {
                    FlagTone.STOP -> ink.stopInk
                    FlagTone.CAUTION -> ink.cautionInk
                },
            )
        }
    }
}

/** An item the pilot confirms with a tap anywhere on its row (48 dp and
 *  more), or cannot where `enabled` is false; its lines and flags under
 *  its title. */
@Composable
fun ConfirmRow(
    title: String,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
    overline: String? = null,
    body: @Composable () -> Unit,
) {
    ListItem(
        checked = checked,
        onCheckedChange = { onToggle() },
        enabled = enabled,
        overlineContent = overline?.let { { Text(it) } },
        supportingContent = { Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) { body() } },
        trailingContent = { Checkbox(checked = checked, onCheckedChange = null, enabled = enabled) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(title) },
    )
}
