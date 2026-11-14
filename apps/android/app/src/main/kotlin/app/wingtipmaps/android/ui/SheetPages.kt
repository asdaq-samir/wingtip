package app.wingtipmaps.android.ui

import androidx.activity.compose.ReportDrawn
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.navigation3.ListDetailSceneStrategy
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.scene.SceneStrategy
import androidx.navigation3.scene.SinglePaneSceneStrategy
import androidx.navigation3.ui.NavDisplay
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import androidx.navigationevent.compose.rememberNavigationEventDispatcherOwner
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.search.FlightCard
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.search.SearchModel
import app.wingtipmaps.android.search.SearchPick
import app.wingtipmaps.android.search.nothingTyped

/**
 * The docked sheet's pages in Navigation 3's NavDisplay over the map
 * screen's back stack (SheetNav, MapViewModel): the carousel
 * (SheetCarousel) of the one search's page and the plan's, and every card
 * and page over it (SheetCard), with Navigation 3's own transitions
 * between them and its own predictive back. The search's row (`head`) is
 * part of the Search page, not over the NavDisplay, so Back from a card
 * shows it coming in with its search. With no `carousel` (the strip
 * layout, whose field and timeline are its search and its plan) Home is
 * the Search page alone.
 *
 * `scenes` lays the stack out: one page at a time (none given), or on a tablet or an
 * unfolded phone Material's list-detail scene (WidePanes), Home in the
 * list pane and the cards in the detail pane beside it.
 * `backEnabled` false hands Back to what comes first (the expanded sheet
 * lowering under the search, MapSheet) through a child of the system's
 * navigation event dispatcher, turned off.
 *
 * Every page sees the activity's own view models -- the one Plan, the
 * session, the assistant, the dry run the map draws -- as it did when the
 * pages were sheets over the map, not a copy of its own per entry: the
 * NavDisplay is given no view model store of its own per entry.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
internal fun SheetPagesHost(
    sheet: SheetNav,
    backEnabled: Boolean,
    modifier: Modifier,
    head: @Composable () -> Unit = {},
    carousel: Boolean = true,
    scenes: SceneStrategy<SheetPage>? = null,
    home: @Composable () -> Unit,
    plan: @Composable () -> Unit,
    card: @Composable (SheetPage) -> Unit,
) {
    val owner = rememberNavigationEventDispatcherOwner(enabled = backEnabled)
    val single = remember { SinglePaneSceneStrategy<SheetPage>() }
    CompositionLocalProvider(LocalNavigationEventDispatcherOwner provides owner) {
        NavDisplay(
            backStack = sheet.stack,
            modifier = modifier.fillMaxWidth(),
            onBack = sheet::back,
            sceneStrategies = listOf(scenes ?: single),
        ) { page ->
            if (page.covers) {
                NavEntry(page, contentKey = page.key, metadata = ListDetailSceneStrategy.detailPane()) { card(page) }
            } else {
                NavEntry(page, contentKey = page.key, metadata = ListDetailSceneStrategy.listPane()) {
                    if (carousel) SheetCarousel(sheet.pager, search = { UnderSearch(head, home) }, plan = plan) else UnderSearch(head, home)
                }
            }
        }
    }
}

/** A page under the one search: the search's row, then the page. */
@Composable
private fun UnderSearch(head: @Composable () -> Unit, page: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        head()
        Box(Modifier.weight(1f)) { page() }
    }
}

/** Nothing typed: the assistant's answer where there is one, the flight's
 *  card, then Nearest, Favorites and Recents, as the search shows them. */
@Composable
internal fun Home(plan: Plan, ownShip: OwnShip, answer: @Composable () -> Unit, onPick: (SearchPick) -> Unit, onKeep: (SearchControl.Keep) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    // The fix read here, for the nearest fields' rows, rather than by the root.
    val fix by ownShip.fix.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    val search: SearchModel = hiltViewModel()
    val found by search.state.collectAsStateWithLifecycle()
    val memory = remember(context) { SearchMemory.of(context) }
    val favorites by memory.favorites.collectAsStateWithLifecycle()
    val recents by memory.recents.collectAsStateWithLifecycle()
    val own by remember(context) { OwnAirplanes.of(context) }.records.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    // The sheet's part of the launch's "fully drawn": its first content,
    // the flight's card, is on screen (the map's part is MapPane's).
    ReportDrawn()
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(top = WingtipSpace.Sm, bottom = WingtipSpace.Xl)) {
        item(key = "answer") { answer() }
        item(key = "flight") {
            FlightCard(state, tail, onOpen = { onPick(SearchPick.Flight) }, modifier = Modifier.padding(horizontal = WingtipSpace.Lg))
        }
        nothingTyped(favorites, own.values, recents, found.nearest, found.nearestProblem, fix, tail, onPick = onPick, onKeep = onKeep)
    }
}
