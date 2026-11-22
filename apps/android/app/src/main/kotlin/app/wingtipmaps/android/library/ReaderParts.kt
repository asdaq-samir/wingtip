package app.wingtipmaps.android.library

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.LayersClear
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The search of the document under the reader's bar, as the web's: its
 * field, how many it found or Not Found, and the match before and after.
 * Focused, the places found are listed under it (listing).
 */
@Composable
internal fun ReaderSearch(state: ReaderModel.State, focus: FocusRequester, onQuery: (String) -> Unit, onStep: (Int) -> Unit, onFocus: (Boolean) -> Unit) {
    val found = state.hits.size
    OutlinedTextField(
        value = state.query,
        onValueChange = onQuery,
        singleLine = true,
        placeholder = { Text(stringResource(R.string.reader_search)) },
        leadingIcon = { Icon(WingtipIcons.search, contentDescription = null) },
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                when {
                    state.searching -> Text(stringResource(R.string.reader_reading), style = MaterialTheme.typography.bodySmall)
                    state.query.trim().length >= 2 && found == 0 -> Text(stringResource(R.string.reader_not_found), style = MaterialTheme.typography.bodySmall)
                    found > 0 -> Text("${state.hit + 1}/$found", style = MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick = { onStep(-1) }, enabled = found > 0) { Icon(Icons.Filled.KeyboardArrowUp, contentDescription = stringResource(R.string.reader_previous)) }
                IconButton(onClick = { onStep(1) }, enabled = found > 0) { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = stringResource(R.string.reader_next)) }
                if (state.query.isNotEmpty()) IconButton(onClick = { onQuery("") }) { Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.close)) }
            }
        },
        modifier = Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg).focusRequester(focus).onFocusChanged { onFocus(it.isFocused) }.testTag("reader-search"),
    )
}

/** Every place found, the match in bold among its words; a tap goes there. */
@Composable
internal fun ReaderHits(hits: List<Hit>, onPick: (Int) -> Unit, modifier: Modifier = Modifier) {
    LazyColumn(modifier.testTag("reader-hits")) {
        itemsIndexed(hits) { i, h ->
            ListItem(
                onClick = { onPick(i) },
                overlineContent = { Text(h.page?.let { stringResource(R.string.reader_page, it) } ?: h.section.orEmpty()) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                content = {
                    Text(
                        buildAnnotatedString {
                            append(h.before)
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(h.match) }
                            append(h.after)
                        },
                        maxLines = 2,
                    )
                },
            )
        }
    }
}

/** Markup's bar, at the foot as a drawing app's tools are: the pen or the
 *  highlighter (a segmented button), Undo Last Mark, Clear This Page, Done. */
@Composable
internal fun MarkupBar(pen: Pen, onPen: (Pen) -> Unit, onUndo: () -> Unit, onClear: () -> Unit, onDone: () -> Unit) {
    BottomAppBar(
        actions = {
            val pens = listOf(Pen.INK to R.string.reader_pen, Pen.HIGHLIGHT to R.string.reader_highlighter)
            SingleChoiceSegmentedButtonRow(Modifier.padding(start = WingtipSpace.Sm)) {
                pens.forEachIndexed { i, (p, name) ->
                    SegmentedButton(selected = pen == p, onClick = { onPen(p) }, shape = SegmentedButtonDefaults.itemShape(i, pens.size)) { Text(stringResource(name)) }
                }
            }
            IconButton(onClick = onUndo) { Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = stringResource(R.string.reader_undo_mark)) }
            IconButton(onClick = onClear) { Icon(Icons.Filled.LayersClear, contentDescription = stringResource(R.string.reader_clear_page)) }
        },
        floatingActionButton = { TextButton(onClick = onDone) { Text(stringResource(R.string.done)) } },
        modifier = Modifier.testTag("reader-markup"),
    )
}

/** A highlight's note, asked as it is made or edited from its glyph:
 *  Material's dialog with Save, and Delete Highlight to take it off. */
@Composable
internal fun NoteDialog(mark: Mark, onSave: (String) -> Unit, onDelete: () -> Unit, onDismiss: () -> Unit) {
    var text by remember(mark.id) { mutableStateOf(mark.note.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(if (mark.note == null) R.string.reader_note_add else R.string.reader_note)) },
        text = { OutlinedTextField(text, { text = it }, label = { Text(stringResource(R.string.reader_note)) }, minLines = 2) },
        confirmButton = { TextButton(onClick = { onSave(text) }) { Text(stringResource(R.string.save)) } },
        dismissButton = { TextButton(onClick = onDelete) { Text(stringResource(R.string.reader_note_delete), color = MaterialTheme.colorScheme.error) } },
    )
}
