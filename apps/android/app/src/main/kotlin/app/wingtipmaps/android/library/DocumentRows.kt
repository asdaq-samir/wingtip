package app.wingtipmaps.android.library

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.LibraryDocument
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.WingtipIcons

/** One of the pilot's own PDFs: its name, when it was added and its size,
 *  and ••• with Rename and Delete (Material's menu). */
@Composable
internal fun OwnRow(doc: OwnDocument, onOpen: () -> Unit, onRename: (String) -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var naming by remember { mutableStateOf(false) }
    val added = Format.day(java.time.Instant.ofEpochMilli(doc.added).toString())
    ListItem(
        onClick = onOpen,
        leadingContent = { Icon(Icons.Filled.Description, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        supportingContent = { Text(stringResource(R.string.documents_added, added, Format.megabytes(doc.bytes))) },
        trailingContent = {
            Box {
                IconButton(onClick = { menu = true }) { Icon(WingtipIcons.more, contentDescription = stringResource(R.string.documents_more_for, doc.name)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.documents_rename)) }, leadingIcon = { Icon(Icons.Filled.Edit, null) }, onClick = { menu = false; naming = true })
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.delete), color = MaterialTheme.colorScheme.error) },
                        leadingIcon = { Icon(Icons.Filled.Delete, null, tint = MaterialTheme.colorScheme.error) },
                        onClick = { menu = false; onDelete() },
                    )
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.testTag("document-own"),
        content = { Text(doc.name, maxLines = 2) },
    )
    if (naming) NameDialog(stringResource(R.string.documents_rename), stringResource(R.string.documents_name), doc.name, onDone = { naming = false; it?.let(onRename) })
}

/**
 * A document of the FAA's: its title, its edition and date ("FAA-H-8083-25C
 * · 3 Nov 2026"), and at its end Keep for the Air (the download glyph, its
 * size in its name); under way, the download's own progress; kept, a
 * tinted check that takes it off. A document the planner has not had yet
 * is listed, greyed, so the shelf reads the same on every device.
 */
@Composable
internal fun ShelfRow(doc: LibraryDocument, keptEdition: String?, keeping: Float?, onOpen: () -> Unit, onKeep: () -> Unit, onTakeOff: () -> Unit) {
    val edition = doc.edition?.let { listOfNotNull(doc.label, doc.date?.let(Format::day)).joinToString(" · ") }
    val opens = doc.edition != null || keptEdition != null
    ListItem(
        onClick = onOpen,
        enabled = opens,
        leadingContent = { Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        supportingContent = { Text(edition ?: stringResource(R.string.documents_not_had)) },
        trailingContent = {
            when {
                keeping != null -> {
                    val said = stringResource(R.string.documents_keeping)
                    Box(Modifier.size(WingtipSize.Chip).semantics { contentDescription = said }) {
                        if (keeping > 0f) CircularProgressIndicator(progress = { keeping }) else CircularProgressIndicator()
                    }
                }
                keptEdition != null -> IconButton(onClick = onTakeOff, modifier = Modifier.testTag("document-kept")) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = stringResource(R.string.documents_kept_remove), tint = MaterialTheme.colorScheme.primary)
                }
                else -> IconButton(onClick = onKeep, enabled = doc.edition != null) {
                    val label = doc.bytes?.let { stringResource(R.string.documents_keep_sized, Format.megabytes(it)) } ?: stringResource(R.string.documents_keep)
                    Icon(Icons.Filled.DownloadForOffline, contentDescription = label)
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.testTag("document-" + doc.id),
        content = { Text(doc.title, maxLines = 2) },
    )
}

/** A name asked for in Material's dialog: a document's or a bookmark's. */
@Composable
internal fun NameDialog(title: String, label: String, start: String, onDone: (String?) -> Unit) {
    var text by remember { mutableStateOf(start) }
    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text(title) },
        text = { OutlinedTextField(text, { text = it }, singleLine = true, label = { Text(label) }) },
        confirmButton = { TextButton(onClick = { onDone(text) }, enabled = text.isNotBlank()) { Text(stringResource(R.string.save)) } },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text(stringResource(R.string.cancel)) } },
    )
}
