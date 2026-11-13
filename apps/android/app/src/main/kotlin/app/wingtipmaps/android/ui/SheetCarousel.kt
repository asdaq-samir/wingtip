package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import kotlinx.coroutines.flow.drop

/** The carousel's pager, for the UI tests. */
const val SHEET_PAGER_TAG = "sheet-pager"

/**
 * The sheet's two pages (the owner, 2026-11-11; rules.md): Search, the
 * one search and what it shows with nothing typed, and the FPL, the plan,
 * side by side in Compose's own HorizontalPager, turned by the round
 * button in the map's left column alone (SheetSideButtons; the owner,
 * 2026-11-13: no tab bar and no page dots), so a sideways drag on a list
 * is never a page turned; an upward or downward drag belongs to the
 * sheet, and to the page's own list at full, through the stock nested
 * scrolling. Both pages stay composed (one page beyond the one in view),
 * so each keeps its scroll, and the one search, on the first page, still
 * opens for an ask made from the plan (Add a Stop) as the pager brings it
 * into view.
 *
 * A page put away gives up the focus, so a field typed in on it (the
 * search's, the plan's) lets the keyboard go down (the web's 5805b5bfa).
 */
@Composable
internal fun SheetCarousel(pager: PagerState, search: @Composable () -> Unit, plan: @Composable () -> Unit) {
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(pager) {
        snapshotFlow { pager.currentPage }.drop(1).collect {
            focus.clearFocus()
            keyboard?.hide()
        }
    }
    HorizontalPager(
        state = pager,
        modifier = Modifier.fillMaxSize().testTag(SHEET_PAGER_TAG),
        beyondViewportPageCount = 1,
        userScrollEnabled = false,
        key = { it },
    ) { page ->
        Box(Modifier.fillMaxSize()) { if (page == PLAN_PAGE) plan() else search() }
    }
}
