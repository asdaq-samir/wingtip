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
 * Where the docked sheet's pages are: Navigation Compose's back stack
 * (the NavHost, SheetPagesHost) on a phone, and on a tablet or an
 * unfolded phone a card in the list-detail scaffold's navigator
 * (WidePanes), so Back and its predictive gesture are the stock ones. The
 * stack is Home, perhaps the plan, perhaps one card on top: a card shown
 * takes the place of another, the plan shown drops a card.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Stable
class SheetNav internal constructor(
    val nav: NavHostController,
    val panes: ThreePaneScaffoldNavigator<String>,
    private val scope: CoroutineScope,
) {
    internal var wide by mutableStateOf(false)

    // The sheet raised from its peek as a page is shown.
    internal var onShown: () -> Unit = {}

    /** The page on top of the NavHost's stack. */
    var top: SheetPage by mutableStateOf(SheetPage.Home)
        internal set

    /** Whether the plan is on the stack, on top or under a card. */
    var planShown by mutableStateOf(false)
        internal set

    /** The card in the wide layout's detail pane, or none. */
    val card: SheetPage? get() = panes.currentDestination?.contentKey?.let(SheetPage::of)

    /** Whether a field's card is up, in either layout. */
    val airportShown: Boolean get() = (if (wide) card else top) is SheetPage.Airport

    // Read from the stack itself, for a show that follows another at once.
    private val planOnStack: Boolean
        get() = listOfNotNull(nav.currentBackStackEntry, nav.previousBackStackEntry).any { it.page() == SheetPage.Plan }

    // A NavHost has set its graph (none in the strip layout).
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

    /** `page` shown, once a NavHost is there to show it (a link opened
     *  as the app starts comes before the sheet's content is composed). */
    fun show(page: SheetPage) {
        scope.launch {
            if (!awaitHost()) return@launch
            showNow(page)
            onShown()
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
                if (planOnStack) nav.popBackStack<SheetPage.Plan>(inclusive = false) else nav.navigate(SheetPage.Plan) { popUpTo<SheetPage.Home>() }
            }
            wide -> {
                dropCards()
                panes.navigateTo(ListDetailPaneScaffoldRole.Detail, page.key)
            }
            planOnStack -> nav.navigate(page) { popUpTo<SheetPage.Plan>() }
            else -> nav.navigate(page) { popUpTo<SheetPage.Home>() }
        }
    }

    /** `page` closed, back one level from it. */
    fun close(page: SheetPage) {
        when {
            page.isCard && wide -> scope.launch { dropCards() }
            page == SheetPage.Plan -> nav.popBackStack<SheetPage.Plan>(inclusive = true)
            else -> nav.popBackStack()
        }
    }

    /** A card moved to where the layout now shows it, as the window
     *  crosses Material's medium width (a phone unfolded or folded). */
    internal suspend fun relayout() {
        if (!awaitHost()) return
        if (wide && top.isCard) {
            val shown = top
            nav.popBackStack()
            panes.navigateTo(ListDetailPaneScaffoldRole.Detail, shown.key)
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
 * (ProfileOpen) shown as a page, and the map's ring round a field let go
 * once its card is closed. `active` false in the strip layout, which has
 * no pages and shows its cards over the map.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun rememberSheetNav(wide: Boolean, active: Boolean, airports: AirportModel, onShown: () -> Unit): SheetNav {
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
            sheet.planShown = sheet.top == SheetPage.Plan || nav.previousBackStackEntry?.page() == SheetPage.Plan
        }
    }
    LaunchedEffect(sheet, wide) { sheet.relayout() }
    LaunchedEffect(sheet) { snapshotFlow { sheet.airportShown }.drop(1).collect { if (!it) airports.close() } }
    val profile by ProfileOpen.at.collectAsStateWithLifecycle()
    LaunchedEffect(profile, active) {
        val at = profile ?: return@LaunchedEffect
        if (!active) return@LaunchedEffect
        sheet.show(SheetPage.of(at))
        ProfileOpen.close()
    }
    return sheet
}

/** How many frames a page asked for waits for the NavHost: a second's worth. */
private const val HOST_FRAMES = 60
