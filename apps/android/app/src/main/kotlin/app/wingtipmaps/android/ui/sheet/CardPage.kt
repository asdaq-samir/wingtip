package app.wingtipmaps.android.ui.sheet

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * How a card or a page is left: `back` one level -- to the page it was
 * opened from inside it, or the search where it was the first -- and
 * `close`, the whole stack of cards and pages, back to the search and the
 * plan under it. The bar's ← and system Back are `back`; its ✕ is `close`.
 */
@Immutable
class CardExit(val back: () -> Unit, val close: () -> Unit) {
    companion object {
        /** One level is all there is: both go the same way. */
        fun one(close: () -> Unit) = CardExit(close, close)
    }
}

/**
 * Every card and page of the sheet, Google Maps' way (the owner,
 * 2026-11-10): while it is open its bar takes the search's place at the
 * sheet's head -- ← and the card's name, as Maps turns its search bar
 * into "← KOSH" -- and the card fills the sheet below it. Material 3
 * Expressive's large flexible top app bar on every card and page (the
 * scrolling rule, 2026-11-10), its title large over the card and folding
 * into the pinned bar as the card scrolls (exitUntilCollapsed), so the
 * title, ← and ✕ never scroll away; the card's own actions, then ✕ at the
 * end, which closes every card back to the search. The plan, under the
 * search, has the same bar with no ← (`showBack`). Back, with the system's predictive gesture, is the NavHost's
 * own (SheetPagesHost): one level, then the search.
 *
 * @param content the card, given the Scaffold's padding; a scrolling
 *   child drives the bar's collapse through the Scaffold's nested scroll.
 */
/** The test tags the card rule's UI tests find a card's bar by. */
object CardPageTags {
    const val BAR = "card-bar"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardPage(
    title: String,
    exit: CardExit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    showBack: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    floatingActionButton: @Composable () -> Unit = {},
    snackbarHost: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val titleText: @Composable () -> Unit = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis) }
    val subtitleText: (@Composable () -> Unit)? = subtitle?.let { s -> { Text(s, maxLines = 1, overflow = TextOverflow.Ellipsis) } }
    val back: @Composable () -> Unit = {
        IconButton(onClick = exit.back) { Icon(WingtipIcons.back, contentDescription = stringResource(R.string.back)) }
    }
    val barActions: @Composable RowScope.() -> Unit = {
        actions()
        IconButton(onClick = exit.close) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
    }
    // The sheet already clears the system bars, so the bar adds none, and
    // it stays the sheet's own colour until the page scrolls under it.
    val colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
    Scaffold(
        modifier = modifier.fillMaxSize().nestedScroll(scroll.nestedScrollConnection),
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            LargeFlexibleTopAppBar(
                title = titleText, subtitle = subtitleText, navigationIcon = if (showBack) back else ({}), actions = barActions,
                windowInsets = WindowInsets(0), colors = colors, scrollBehavior = scroll,
                modifier = Modifier.testTag(CardPageTags.BAR),
            )
        },
        bottomBar = bottomBar,
        floatingActionButton = floatingActionButton,
        snackbarHost = snackbarHost,
        content = content,
    )
}
