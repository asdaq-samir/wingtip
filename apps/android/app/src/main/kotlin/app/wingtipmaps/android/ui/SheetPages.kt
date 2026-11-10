package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import androidx.navigationevent.compose.rememberNavigationEventDispatcherOwner
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.search.FlightCard
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.search.SearchModel
import app.wingtipmaps.android.search.SearchPick
import app.wingtipmaps.android.search.nothingTyped

/**
 * The docked sheet's pages in Navigation Compose's NavHost: Home and the
 * plan under the one search, and every card and page over it (CardRoute,
 * SheetCard), with the NavHost's own transitions and predictive back.
 * `backEnabled` false hands Back to what comes first (the expanded sheet
 * lowering under the search, MapSheet; a card in the wide layout's detail
 * pane) through a child of the system's navigation event dispatcher,
 * turned off.
 *
 * Every page sees the activity's own view models -- the one Plan, the
 * session, the assistant, the dry run the map draws -- as it did when the
 * pages were sheets over the map, not a copy of its own per back stack
 * entry.
 */
@Composable
internal fun SheetPagesHost(
    sheet: SheetNav,
    backEnabled: Boolean,
    modifier: Modifier,
    home: @Composable () -> Unit,
    plan: @Composable () -> Unit,
    card: @Composable (SheetPage) -> Unit,
) {
    val owner = rememberNavigationEventDispatcherOwner(enabled = backEnabled)
    val models = checkNotNull(LocalViewModelStoreOwner.current)
    CompositionLocalProvider(LocalNavigationEventDispatcherOwner provides owner) {
        NavHost(sheet.nav, startDestination = SheetPage.Home, modifier = modifier.fillMaxWidth()) {
            composable<SheetPage.Home> { CompositionLocalProvider(LocalViewModelStoreOwner provides models) { home() } }
            composable<SheetPage.Plan> { CompositionLocalProvider(LocalViewModelStoreOwner provides models) { plan() } }
            composable<CardRoute> { entry ->
                val page = remember(entry) { SheetPage.of(entry.toRoute<CardRoute>().key) }
                CompositionLocalProvider(LocalViewModelStoreOwner provides models) { card(page) }
            }
        }
    }
}

/** Nothing typed: the assistant's answer where there is one, the flight's
 *  card, then Favorites, Recents and Nearest, as the search shows them. */
@Composable
internal fun Home(plan: Plan, answer: @Composable () -> Unit, onPick: (SearchPick) -> Unit) {
    val context = LocalContext.current
    val state by plan.state.collectAsStateWithLifecycle()
    val search: SearchModel = viewModel()
    val found by search.state.collectAsStateWithLifecycle()
    val memory = remember(context) { SearchMemory.of(context) }
    val favorites by memory.favorites.collectAsStateWithLifecycle()
    val recents by memory.recents.collectAsStateWithLifecycle()
    val own by remember(context) { OwnAirplanes.of(context) }.records.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = WingtipSpace.Sm, bottom = WingtipSpace.Xl)) {
        item(key = "answer") { answer() }
        item(key = "flight") {
            FlightCard(state, tail, onOpen = { onPick(SearchPick.Flight) }, modifier = Modifier.padding(horizontal = WingtipSpace.Lg))
        }
        nothingTyped(favorites, own.values, recents, found.nearest, found.nearestProblem, onPick = onPick)
    }
}
