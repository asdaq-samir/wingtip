package app.wingtipmaps.android.ui

import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldRole
import androidx.compose.material3.adaptive.navigation.BackNavigationBehavior
import androidx.compose.material3.adaptive.navigation.ThreePaneScaffoldNavigator
import androidx.compose.material3.adaptive.navigation.rememberListDetailPaneScaffoldNavigator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import app.wingtipmaps.android.airplane.ProfileOpen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

/**
 * Where the docked sheet's cards and pages are (the card rule, the owner,
 * 2026-11-10): Navigation Compose's back stack (the NavHost,
 * SheetPagesHost) on a phone and in the strip layout, and on a tablet or
 * an unfolded phone the list-detail scaffold's navigator (WidePanes), the
 * cards in its detail pane, so Back and its predictive gesture are the
 * stock ones. The stack is Home, then the cards and pages over it: one
 * shown from the map, the search or a link takes the place of those there
 * ([show]); one opened from inside a card goes on top of it ([push]), and
 * Back steps down to it.
 *
 * Home is the sheet's carousel (the owner, 2026-11-11, rules.md): two
 * pages side by side in Compose's own pager ([pager]), Search -- the one
 * search and what it shows with nothing typed -- and the FPL, the plan.
 * A card opens over both and ✕ comes back to the page it was opened from,
 * as the pager's state outlives the cards over it.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Stable
class SheetNav internal constructor(
    val nav: NavHostController,
    val panes: ThreePaneScaffoldNavigator<String>,
    /** The carousel's pager under the cards: [SEARCH_PAGE] or [PLAN_PAGE]. */
    val pager: PagerState,
    private val scope: CoroutineScope,
) {
    internal var wide by mutableStateOf(false)

    // The sheet brought to where the page shown opens: a card shown from
    // the search or the map at half, the plan raised from the peek; a card
    // pushed from inside another leaves the sheet where it is.
    internal var onShown: (SheetPage) -> Unit = {}

    // The NavHost's top entry: Home (the carousel) or a card.
    internal var stackTop: SheetPage by mutableStateOf(SheetPage.Home)

    /** The page on top: a card, else the carousel's page in view. */
    val top: SheetPage get() = if (stackTop == SheetPage.Home && planShown) SheetPage.Plan else stackTop

    /** Whether the carousel is at the plan, on top or under the cards. */
    val planShown: Boolean get() = pager.currentPage == PLAN_PAGE

    /** The card in the wide layout's detail pane, or none. */
    val card: SheetPage? get() = panes.currentDestination?.contentKey?.let(SheetPage::of)

    /** What the pilot sees on top, in either layout. */
    val shown: SheetPage get() = (if (wide) card else null) ?: top

    /** Whether a card or a page covers the search. */
    val covered: Boolean get() = shown.covers

    // A NavHost has set its graph.
    private val hosted: Boolean get() = nav.currentBackStackEntry != null

    /** Whether a NavHost has its graph, waiting the few frames the sheet's
     *  content takes to be composed (it is composed as it is measured). */
    internal suspend fun awaitHost(): Boolean {
        repeat(HOST_FRAMES) {
            if (hosted) return true
            withFrameNanos { }
        }
        return hosted
    }

    /** `page` shown from the map, the search or a link: the cards over
     *  the search closed first, so it is the one card there. */
    fun show(page: SheetPage) = go(page) { showNow(page) }

    /** `page` opened from inside a card or a page, on top of it, so Back
     *  comes back to it. It keeps the sheet's height (the owner's decision,
     *  2026-11-10, on the audit's SC-1): only a card shown from the search
     *  or the map brings the sheet to half, so `onShown` is not told of a
     *  card pushed over another. */
    fun push(page: SheetPage) = go(page, tell = !page.covers) { pushNow(page) }

    /** A page asked for by its name: on top of the page it was asked from,
     *  else shown as the one card. */
    fun open(page: SheetPage) = if (covered && page.covers) push(page) else show(page)

    private fun go(page: SheetPage, tell: Boolean = true, step: suspend () -> Unit) {
        scope.launch {
            if (!awaitHost()) return@launch
            step()
            if (tell) onShown(page)
        }
    }

    private suspend fun showNow(page: SheetPage) {
        when {
            page == SheetPage.Home || page == SheetPage.Plan -> {
                dropCards()
                nav.popBackStack<SheetPage.Home>(inclusive = false)
                pager.animateScrollToPage(if (page == SheetPage.Plan) PLAN_PAGE else SEARCH_PAGE)
            }
            wide -> {
                dropCards()
                panes.navigateTo(ListDetailPaneScaffoldRole.Detail, page.key)
            }
            else -> nav.navigate(CardRoute(page.key)) { popUpTo<SheetPage.Home>() }
        }
    }

    private suspend fun pushNow(page: SheetPage) {
        when {
            !page.covers -> showNow(page)
            wide -> panes.navigateTo(ListDetailPaneScaffoldRole.Detail, page.key)
            else -> nav.navigate(CardRoute(page.key))
        }
    }

    /** Back one level: the card on top closed, or the plan. */
    fun back() {
        when {
            wide && card != null -> scope.launch { panes.navigateBack(BackNavigationBehavior.PopUntilContentChange) }
            else -> nav.popBackStack()
        }
    }

    /** Every card and page closed, back to the search and what is under it. */
    fun closeAll() {
        if (wide) {
            scope.launch { dropCards() }
            return
        }
        if (!top.covers) return
        nav.popBackStack<SheetPage.Home>(inclusive = false)
    }

    /** The plan's ✕: the carousel back at the Search page, the cards over
     *  it, if any, left as they are. */
    fun closePlan() {
        scope.launch { pager.animateScrollToPage(SEARCH_PAGE) }
    }

    /** The carousel at the plan's page, the cards over it left as they
     *  are: a route made or opened from anywhere (the carousel's rule). */
    fun toPlanPage() {
        scope.launch { pager.animateScrollToPage(PLAN_PAGE) }
    }

    /** The cards moved to where the layout now shows them, as the window
     *  crosses Material's medium width (a phone unfolded or folded). */
    internal suspend fun relayout() {
        if (!awaitHost()) return
        if (wide && top.covers) {
            val cards = ArrayDeque<SheetPage>()
            while (true) {
                val page = nav.currentBackStackEntry?.page()?.takeIf { it.covers } ?: break
                cards.addFirst(page)
                nav.popBackStack()
            }
            cards.forEach { panes.navigateTo(ListDetailPaneScaffoldRole.Detail, it.key) }
        } else if (!wide) {
            card?.let { shown ->
                dropCards()
                showNow(shown)
            }
        }
    }

    private suspend fun dropCards() {
        var popped = true
        while (popped && panes.currentDestination?.contentKey != null) popped = panes.navigateBack(BackNavigationBehavior.PopUntilContentChange)
    }
}

/**
 * The sheet's pages for the root: an airplane's card asked for anywhere
 * (ProfileOpen) opened as a card, and the map's ring round a field let go
 * once its card is closed.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun rememberSheetNav(wide: Boolean, airports: AirportModel, onShown: (SheetPage) -> Unit): SheetNav {
    val nav = rememberNavController()
    val panes = rememberListDetailPaneScaffoldNavigator<String>()
    val pager = rememberPagerState(initialPage = SEARCH_PAGE) { CAROUSEL_PAGES }
    val scope = rememberCoroutineScope()
    val sheet = remember(nav, panes, pager, scope) { SheetNav(nav, panes, pager, scope) }
    SideEffect {
        sheet.wide = wide
        sheet.onShown = onShown
    }
    LaunchedEffect(sheet) {
        nav.currentBackStackEntryFlow.collect { entry -> sheet.stackTop = entry.page() }
    }
    LaunchedEffect(sheet, wide) { sheet.relayout() }
    LaunchedEffect(sheet) { snapshotFlow { sheet.shown is SheetPage.Airport }.drop(1).collect { if (!it) airports.close() } }
    val profile by ProfileOpen.at.collectAsStateWithLifecycle()
    LaunchedEffect(profile) {
        val at = profile ?: return@LaunchedEffect
        sheet.open(SheetPage.of(at))
        ProfileOpen.close()
    }
    return sheet
}

/** The carousel's pages, in their order (the owner, 2026-11-11). */
internal const val SEARCH_PAGE = 0
internal const val PLAN_PAGE = 1
internal const val CAROUSEL_PAGES = 2

/** How many frames a page asked for waits for the NavHost: a second's worth. */
private const val HOST_FRAMES = 60
