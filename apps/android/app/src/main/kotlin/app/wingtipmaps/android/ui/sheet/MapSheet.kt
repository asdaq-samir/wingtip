package app.wingtipmaps.android.ui.sheet

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * The map's sheet's state: Material's own standard bottom sheet, which
 * rests at its peek (the one search) or expanded. The owner, 2026-11-09:
 * with stock components, follow the stock component's behaviour, so the
 * hand-built three-stop sheet of decision 0018 (pill, half, full, a
 * 300 ms ease-out with no spring) gave way to this one, which moves on
 * the theme's expressive motion scheme as every Material sheet does.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Stable
class MapSheetState internal constructor(internal val sheet: SheetState) {
    /** Whether the sheet rests at its peek, the one search alone. */
    val atPeek: Boolean get() = sheet.currentValue == SheetValue.PartiallyExpanded

    internal val expanded: Boolean get() = sheet.currentValue == SheetValue.Expanded

    suspend fun expand() = sheet.expand()

    internal suspend fun lower() = sheet.partialExpand()
}

// BottomSheetScaffold and its SheetState are still ExperimentalMaterial3Api
// in material3 1.5.0-rc01; MapSheetState keeps the opt-in to this file.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun rememberMapSheetState(): MapSheetState {
    val sheet = rememberBottomSheetState(initialValue = SheetValue.PartiallyExpanded, enabledValues = setOf(SheetValue.PartiallyExpanded, SheetValue.Expanded))
    return remember(sheet) { MapSheetState(sheet) }
}

/**
 * The map's panel on a phone: Material's standard bottom sheet
 * (BottomSheetScaffold), as Google Maps' place sheet sits over its map,
 * with the stock drag handle (its tap and TalkBack's expand and collapse
 * actions are the stock ones), the stock fling, nested scrolling and
 * motion scheme. The panel stays on the screen's foot (decision 0013).
 *
 * The map is drawn under the whole window, edge to edge; the scaffold
 * itself stops under the status bar, so the expanded sheet ends there,
 * and rises over the keyboard, so a field in the sheet is never typed
 * into under it. The standard sheet has no back handling of its own, so
 * Back, with the system's predictive gesture, brings an expanded sheet
 * down to its peek before the screen's own handlers (a card popped) and
 * then the app's exit.
 *
 * @param peek how much shows at rest, the navigation bar included.
 * @param body what lies under the sheet, given what the sheet covers at
 *   its peek, where the map centres what it shows.
 * @param sheet the sheet's content, under the stock handle; a child with
 *   Modifier.weight(1f) fills it to the top.
 * @param snackbars the screen's Snackbars (an edit's Undo), shown by the
 *   scaffold's own host, over the sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapSheet(
    state: MapSheetState,
    peek: Dp,
    modifier: Modifier = Modifier,
    snackbars: SnackbarHostState = remember { SnackbarHostState() },
    body: @Composable (covered: Dp) -> Unit,
    sheet: @Composable ColumnScope.() -> Unit,
) {
    PredictiveBackHandler(enabled = state.expanded) { progress ->
        progress.collect {}
        state.lower()
    }
    Box(modifier.fillMaxSize()) {
        body(peek)
        BottomSheetScaffold(
            scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = state.sheet, snackbarHostState = snackbars),
            sheetPeekHeight = peek,
            // Transparent and empty: the map behind it takes every touch
            // the sheet does not.
            containerColor = Color.Transparent,
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
                .padding(top = WingtipSpace.Sm)
                .windowInsetsPadding(WindowInsets.ime.exclude(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom)),
            sheetContent = {
                // Clear of a cutout or a navigation bar at the side in landscape.
                Column(Modifier.weight(1f).fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))) {
                    sheet()
                }
            },
            content = {},
        )
    }
}
