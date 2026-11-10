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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
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

/** The map sheet's content, for the card rule's UI tests. */
const val MAP_SHEET_TAG = "map-sheet"

/** Where the map's sheet rests (SheetValue's name: PartiallyExpanded,
 *  Expanded), a semantics property only tests read, never TalkBack. */
val SheetDetent = SemanticsPropertyKey<String>("SheetDetent")
var SemanticsPropertyReceiver.sheetDetent by SheetDetent

/** Half the window: where a card opens on the sheet before it is pulled
 *  up to the whole height (the scrolling rule, 2026-11-10: every card
 *  opens at half and grows), the sheet's peek while a card is open. */
@Composable
fun halfWindow(): Dp {
    val window = LocalWindowInfo.current.containerSize
    return with(LocalDensity.current) { (window.height / 2).toDp() }
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
 * down to its peek, then the app's exit -- but only with no card open
 * (`lowerOnBack`): while a card covers the search, Back closes the card
 * and never just lowers the sheet (the card rule, 2026-11-10).
 *
 * @param peek how much shows at rest, the navigation bar included.
 * @param lowerOnBack whether Back lowers the expanded sheet: not while a
 *   card is open.
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
    lowerOnBack: Boolean = true,
    snackbars: SnackbarHostState = remember { SnackbarHostState() },
    body: @Composable (covered: Dp) -> Unit,
    sheet: @Composable ColumnScope.() -> Unit,
) {
    PredictiveBackHandler(enabled = state.expanded && lowerOnBack) { progress ->
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
                Column(
                    Modifier.weight(1f).fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
                        .testTag(MAP_SHEET_TAG).semantics { sheetDetent = state.sheet.currentValue.name },
                ) {
                    sheet()
                }
            },
            content = {},
        )
    }
}
