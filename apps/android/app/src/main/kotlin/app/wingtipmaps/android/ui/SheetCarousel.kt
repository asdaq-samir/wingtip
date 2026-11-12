package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

/** The carousel's page dots, for the UI tests ("sheet-dot-0", "sheet-dot-1"). */
const val SHEET_DOT_TAG = "sheet-dot-"

/** The carousel's pager, for the UI tests' swipes. */
const val SHEET_PAGER_TAG = "sheet-pager"

/** The dots' row: one tap target high, so each dot's area is the whole
 *  48 dp while the dot itself stays small (nothing grows). */
internal val SheetDotsHeight = WingtipSize.TapTarget

/**
 * The sheet's carousel (the owner, 2026-11-11; rules.md): Search, the one
 * search and what it shows with nothing typed, and the FPL, the plan, side
 * by side in Compose's own HorizontalPager, with two page dots under the
 * stock drag handle. The pager takes only a sideways drag, so an upward
 * or downward one still belongs to the sheet, and to the page's own list
 * at full, through the stock nested scrolling. Both pages stay composed
 * (one page beyond the one in view), so each keeps its scroll, and the
 * one search, on the first page, still opens for an ask made from the
 * plan (Add a Stop) as the pager brings it into view.
 *
 * Material 3 has no page indicator for a phone (only Wear's), so the dots
 * are the foundation pager's own state drawn in the theme's colours, as
 * Compose's pager guide draws its indicator.
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
    Column(Modifier.fillMaxSize()) {
        SheetPageDots(pager)
        HorizontalPager(
            state = pager,
            modifier = Modifier.weight(1f).fillMaxWidth().testTag(SHEET_PAGER_TAG),
            beyondViewportPageCount = 1,
            key = { it },
        ) { page ->
            Box(Modifier.fillMaxSize()) { if (page == PLAN_PAGE) plan() else search() }
        }
    }
}

/** The two dots, centred, the page in view in the tint: each a tab that
 *  brings its page, read to TalkBack as "Page 1 of 2, Search". */
@Composable
private fun SheetPageDots(pager: PagerState) {
    val scope = rememberCoroutineScope()
    val names = listOf(stringResource(R.string.sheet_page_search), stringResource(R.string.sheet_page_fpl))
    Row(
        Modifier.fillMaxWidth().height(SheetDotsHeight).selectableGroup(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        names.forEachIndexed { page, name ->
            val shown = pager.currentPage == page
            val words = stringResource(R.string.sheet_page_of, page + 1, names.size, name)
            Box(
                Modifier.size(WingtipSize.TapTarget)
                    .selectable(selected = shown, role = Role.Tab, onClick = { scope.launch { pager.animateScrollToPage(page) } })
                    .semantics { contentDescription = words }
                    .testTag(SHEET_DOT_TAG + page),
                contentAlignment = Alignment.Center,
            ) {
                val colour = if (shown) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                Box(Modifier.size(WingtipSpace.Sm).background(colour, CircleShape))
            }
        }
    }
}
