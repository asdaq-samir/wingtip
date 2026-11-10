package app.wingtipmaps.android.ui.sheet

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The app's one modal sheet, for a task done over whatever is open -- a
 * form (Add Flight, a flight logged, a photo read), the welcome, a shared
 * flight's preview, the Downloads map -- never for a thing or a page,
 * which are cards on the sheet's own stack (CardPage; the card rule, the
 * owner, 2026-11-10). Material's modal bottom sheet with its drag handle,
 * opening at half and growing to the whole height (or at the whole
 * height, `full`), and a title row -- the title at the start, as an
 * Android top bar sets it, and ✕ at the end. Back and a swipe down close
 * it too, as the system's predictive back previews; with an edit not yet
 * saved (`edited`) they ask first, the stock confirmation dialog, and
 * Keep Editing leaves the edit as it was (the scrolling rule, 2026-11-10).
 * The sheet pads the navigation bar itself, so its content does not again.
 *
 * @param actions what goes before ✕ in the title row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WingtipSheet(
    title: String,
    onClose: () -> Unit,
    full: Boolean = false,
    edited: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    var asking by remember { mutableStateOf(false) }
    val unsaved by rememberUpdatedState(edited)
    val state = rememberBottomSheetState(
        initialValue = SheetValue.Hidden,
        enabledValues = if (full) {
            setOf(SheetValue.Hidden, SheetValue.Expanded)
        } else {
            setOf(SheetValue.Hidden, SheetValue.PartiallyExpanded, SheetValue.Expanded)
        },
        confirmValueChange = { to ->
            // A swipe down past the edit asks rather than throws it away.
            if (to == SheetValue.Hidden && unsaved) {
                asking = true
                false
            } else {
                true
            }
        },
    )
    val close = { if (unsaved) asking = true else onClose() }
    ModalBottomSheet(onDismissRequest = close, sheetState = state) {
        BackHandler(enabled = edited) { asking = true }
        SheetTitleRow(title = title, onClose = close, actions = actions)
        content()
    }
    if (asking) {
        DiscardDialog(onDiscard = {
            asking = false
            onClose()
        }, onKeep = { asking = false })
    }
}

/** An edit not yet saved, about to be thrown away: the stock
 *  confirmation dialog, Discard in the error's place and Keep Editing. */
@Composable
fun DiscardDialog(onDiscard: () -> Unit, onKeep: () -> Unit) {
    AlertDialog(
        onDismissRequest = onKeep,
        title = { Text(stringResource(R.string.discard_title)) },
        text = { Text(stringResource(R.string.discard_line)) },
        confirmButton = { TextButton(onClick = onDiscard) { Text(stringResource(R.string.discard)) } },
        dismissButton = { TextButton(onClick = onKeep) { Text(stringResource(R.string.keep_editing)) } },
    )
}

/** A sheet's title row: the title at the start, then `actions` and ✕ at
 *  the end. Material's own top app bar, its insets the sheet's. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SheetTitleRow(title: String, onClose: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        actions = {
            actions()
            IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
        },
        windowInsets = WindowInsets(0),
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
    )
}
