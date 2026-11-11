package app.wingtipmaps.android.ui

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
 * stock ones. The stack is Home, perhaps the plan, then the cards and
 * pages over the search: one shown from the map, the search or a link
 * takes the place of those there ([show]); one opened from inside a card
 * goes on top of it ([push]), and Back steps down to it.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Stable
class SheetNav internal constructor(
    val nav: NavHostController,
    val panes: ThreePaneScaffoldNavigator<String>,
    private val scope: CoroutineScope,
) {
    internal var wide by mutableStateOf(false)

    // The sheet brought to where the page shown opens: a card shown from
    // the search or the map at half, the plan raised from the peek; a card
    // pushed from inside another leaves the sheet where it is.
    internal var onShown: (SheetPage) -> Unit = {}

    /** The page on top of the NavHost's stack. */
    var top: SheetPage by mutableStateOf(SheetPage.Home)
        internal set

    /** Whether the plan is on the stack, on top or under the cards. */
    var planShown by mutableStateOf(false)
        internal set

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
            page == SheetPage.Home -> {
                dropCards()
                nav.popBackStack<SheetPage.Home>(inclusive = false)
            }
            page == SheetPage.Plan -> {
                dropCards()
                if (planOnStack()) nav.popBackStack<SheetPage.Plan>(inclusive = false) else nav.navigate(SheetPage.Plan) { popUpTo<SheetPage.Home>() }
            }
            wide -> {
                dropCards()
                panes.navigateTo(ListDetailPaneScaffoldRole.Detail, page.key)
            }
            planOnStack() -> nav.navigate(CardRoute(page.key)) { popUpTo<SheetPage.Plan>() }
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
        if (!nav.popBackStack<SheetPage.Plan>(inclusive = false)) nav.popBackStack<SheetPage.Home>(inclusive = false)
    }

    /** The plan closed, back to what the search shows with nothing typed. */
    fun closePlan() {
        nav.popBackStack<SheetPage.Plan>(inclusive = true)
    }

    // Read from the stack itself, for a show that follows another at once.
    internal fun planOnStack(): Boolean = runCatching { nav.getBackStackEntry<SheetPage.Plan>() }.isSuccess

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
    val scope = rememberCoroutineScope()
    val sheet = remember(nav, panes, scope) { SheetNav(nav, panes, scope) }
    SideEffect {
        sheet.wide = wide
        sheet.onShown = onShown
    }
    LaunchedEffect(sheet) {
        nav.currentBackStackEntryFlow.collect { entry ->
            sheet.top = entry.page()
            sheet.planShown = sheet.planOnStack()
        }
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

/** How many frames a page asked for waits for the NavHost: a second's worth. */
private const val HOST_FRAMES = 60
