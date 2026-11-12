package app.wingtipmaps.android.ui

import androidx.activity.compose.ReportDrawn
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.platform.LocalDensity
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
import app.wingtipmaps.android.design.SharedAxisX
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.search.FlightCard
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.search.SearchModel
import app.wingtipmaps.android.search.SearchPick
import app.wingtipmaps.android.search.nothingTyped

/**
 * The docked sheet's pages in Navigation Compose's NavHost: the carousel
 * (SheetCarousel) of the one search's page and the plan's, and every card
 * and page over it (CardRoute, SheetCard), with Material's shared axis
 * between them, which the NavHost seeks with the predictive back gesture
 * (SharedAxisX). The search's row (`head`) is part of the Search page,
 * not over the NavHost, so Back from a card shows it coming in with its
 * search, as it will be once it is released. With no `carousel` (the
 * strip layout, whose field and timeline are its search and its plan)
 * Home is the Search page alone.
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
    head: @Composable () -> Unit = {},
    carousel: Boolean = true,
    home: @Composable () -> Unit,
    plan: @Composable () -> Unit,
    card: @Composable (SheetPage) -> Unit,
) {
    val owner = rememberNavigationEventDispatcherOwner(enabled = backEnabled)
    val models = checkNotNull(LocalViewModelStoreOwner.current)
    CompositionLocalProvider(LocalNavigationEventDispatcherOwner provides owner) {
        val shift = with(LocalDensity.current) { SharedAxisX.Shift.roundToPx() }
        NavHost(
            sheet.nav, startDestination = SheetPage.Home, modifier = modifier.fillMaxWidth(),
            enterTransition = { SharedAxisX.enter(shift, forward = true) },
            exitTransition = { SharedAxisX.exit(shift, forward = true) },
            popEnterTransition = { SharedAxisX.enter(shift, forward = false) },
            popExitTransition = { SharedAxisX.exit(shift, forward = false) },
        ) {
            composable<SheetPage.Home> {
                CompositionLocalProvider(LocalViewModelStoreOwner provides models) {
                    if (carousel) SheetCarousel(sheet.pager, search = { UnderSearch(head, home) }, plan = plan) else UnderSearch(head, home)
                }
            }
            composable<CardRoute> { entry ->
                val page = remember(entry) { SheetPage.of(entry.toRoute<CardRoute>().key) }
                CompositionLocalProvider(LocalViewModelStoreOwner provides models) { card(page) }
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
internal fun Home(plan: Plan, fix: OwnShip.Fix?, answer: @Composable () -> Unit, onPick: (SearchPick) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val state by plan.state.collectAsStateWithLifecycle()
    val search: SearchModel = viewModel()
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
        nothingTyped(favorites, own.values, recents, found.nearest, found.nearestProblem, fix, onPick = onPick)
    }
}
