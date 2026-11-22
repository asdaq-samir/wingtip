package app.wingtipmaps.android.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.CfrText
import app.wingtipmaps.android.design.generated.WingtipSpace

/** A row of the contents: a PDF's outline row (its page) or a CFR part's
 *  subpart or section (its section). */
data class ContentsRow(val title: String, val depth: Int, val page: Int? = null, val section: String? = null) {
    companion object {
        fun of(rows: List<OutlineRow>) = rows.map { ContentsRow(it.title, it.depth, page = it.page) }

        fun of(text: CfrText) = text.groups.flatMap { g ->
            val inGroup = g.head.isNotEmpty()
            (if (inGroup) listOfNotNull(g.sections.firstOrNull()?.let { ContentsRow(g.head, 0, section = it.id) }) else emptyList()) +
                g.sections.map { ContentsRow(it.head.ifEmpty { it.id }, if (inGroup) 1 else 0, section = it.id) }
        }
    }
}

/** Where a row, a bookmark or a note goes: a page or a section. */
data class ReaderGo(val page: Int? = null, val section: String? = null)

/**
 * Contents, ForeFlight's one panel of the table of contents and the named
 * bookmarks, with the highlights' notes beside them: Material's modal
 * bottom sheet over the reader, a segmented button to pick which, each
 * row a tap to its place. A bookmark is renamed by its pencil.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReaderContents(
    rows: List<ContentsRow>,
    bookmarks: List<Bookmark>,
    notes: List<Mark>,
    onGo: (ReaderGo) -> Unit,
    onRename: (Bookmark, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var naming by remember { mutableStateOf<Bookmark?>(null) }
    val go = { to: ReaderGo -> onGo(to); onDismiss() }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            val tabs = listOf(R.string.reader_contents, R.string.reader_bookmarks, R.string.reader_notes)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                tabs.forEachIndexed { i, name ->
                    SegmentedButton(selected = tab == i, onClick = { tab = i }, shape = SegmentedButtonDefaults.itemShape(i, tabs.size)) { Text(stringResource(name)) }
                }
            }
            LazyColumn {
                when (tab) {
                    0 -> if (rows.isEmpty()) item { Empty(R.string.reader_no_contents, R.string.reader_no_contents_body) } else items(rows) { r ->
                        Row(r.title, null, Modifier.padding(start = WingtipSpace.Lg * r.depth)) { go(ReaderGo(r.page, r.section)) }
                    }
                    1 -> if (bookmarks.isEmpty()) item { Empty(R.string.reader_no_bookmarks, R.string.reader_no_bookmarks_body) } else items(bookmarks) { b ->
                        Row(b.label, b.page?.let { stringResource(R.string.reader_page, it) }, trailing = {
                            IconButton(onClick = { naming = b }) { Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.reader_rename_bookmark)) }
                        }) { go(ReaderGo(b.page, b.at)) }
                    }
                    else -> if (notes.isEmpty()) item { Empty(R.string.reader_no_notes, R.string.reader_no_notes_body) } else items(notes) { m ->
                        Row(m.note.orEmpty(), stringResource(R.string.reader_page, m.page)) { go(ReaderGo(page = m.page)) }
                    }
                }
            }
        }
    }
    naming?.let { b ->
        NameDialog(stringResource(R.string.reader_rename_bookmark), stringResource(R.string.reader_bookmark_name), b.label) { name ->
            naming = null
            name?.let { onRename(b, it) }
        }
    }
}

@Composable
private fun Row(title: String, value: String?, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    ListItem(
        onClick = onClick,
        supportingContent = value?.let { { Text(it) } },
        trailingContent = trailing,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = modifier,
        content = { Text(title, maxLines = 2) },
    )
}

@Composable
private fun Empty(title: Int, body: Int) {
    Column(Modifier.padding(vertical = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        Text(stringResource(title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
