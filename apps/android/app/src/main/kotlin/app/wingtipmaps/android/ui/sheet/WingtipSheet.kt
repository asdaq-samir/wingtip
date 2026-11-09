package app.wingtipmaps.android.ui.sheet

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * Every sheet over the map, one component: Material's modal bottom sheet
 * with its drag handle, and a title row -- the title at the start, as an
 * Android top bar sets it, and a Close icon button at the end that goes
 * back one level (decision 0015). Back and a swipe down close it too, as
 * the system's predictive back previews. The sheet pads the navigation
 * bar itself (Material's windowInsets), so its content does not again.
 *
 * @param full whether it opens at the whole height (a page: Ask, the
 *   airplane, Setup) or half first (a card).
 * @param actions what goes before Close in the title row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WingtipSheet(
    title: String,
    onClose: () -> Unit,
    full: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = full),
    ) {
        SheetTitleRow(title = title, onClose = onClose, actions = actions)
        content()
    }
}

/** A sheet's title row: the title at the start, then `actions` and the
 *  Close icon button at the end. Material's own top app bar, its insets
 *  the sheet's. */
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
