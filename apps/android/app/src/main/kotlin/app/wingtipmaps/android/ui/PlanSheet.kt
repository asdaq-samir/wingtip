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
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import androidx.navigationevent.compose.rememberNavigationEventDispatcherOwner
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.AirplaneCard
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.search.FlightCard
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.search.SearchModel
import app.wingtipmaps.android.search.SearchPick
import app.wingtipmaps.android.search.nothingTyped
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** What the docked sheet shows under the one search: with nothing typed
 *  the flight's card, Favorites, Recents and Nearest (Home); the plan; a
 *  field's card; or an airplane's. Each is a route of the sheet's NavHost,
 *  so Navigation Compose keeps the stack across a rotation. */
@Serializable
sealed interface SheetPage {
    @Serializable
    data object Home : SheetPage

    @Serializable
    data object Plan : SheetPage

    @Serializable
    data class Airport(val ident: String) : SheetPage

    /** An airplane's card, by its N-number or a type with none (ProfileOpen's). */
    @Serializable
    data class Airplane(val tail: String?, val focus: String? = null, val type: String? = null) : SheetPage {
        val at: ProfileOpen.At get() = ProfileOpen.At(tail, focus, type)
    }

    /** A card, which the wide layout shows in the detail pane. */
    val isCard: Boolean get() = this is Airport || this is Airplane

    /** The page as the list-detail navigator keeps it (a saveable string). */
    val key: String get() = KeyJson.encodeToString(serializer(), this)

    companion object {
        // "page" names the kind, as the airplane's own `type` is taken.
        private val KeyJson = Json { classDiscriminator = "page" }

        fun of(key: String): SheetPage = runCatching { KeyJson.decodeFromString(serializer(), key) }.getOrDefault(Home)

        fun of(at: ProfileOpen.At): SheetPage = Airplane(at.tail, at.focus, at.type)
    }
}

/** The page a back stack entry of the sheet's NavHost shows. */
internal fun NavBackStackEntry.page(): SheetPage = when {
    destination.hasRoute<SheetPage.Plan>() -> SheetPage.Plan
    destination.hasRoute<SheetPage.Airport>() -> toRoute<SheetPage.Airport>()
    destination.hasRoute<SheetPage.Airplane>() -> toRoute<SheetPage.Airplane>()
    else -> SheetPage.Home
}

/**
 * The docked sheet's pages under the one search, in Navigation Compose's
 * NavHost: Home, the plan (PlanPage), a field's card (AirportCard, the map
 * ringing it) or an airplane's (AirplaneCard), with the NavHost's own
 * transitions and predictive back. `backEnabled` false hands Back to what
 * comes first (the expanded sheet lowering, MapSheet; a card in the
 * wide layout's detail pane) through a child of the system's navigation
 * event dispatcher, turned off.
 */
@Composable
internal fun SheetPagesHost(
    sheet: SheetNav,
    plan: Plan,
    airports: AirportModel,
    navigationBar: Dp,
    answer: @Composable () -> Unit,
    pick: (SearchPick) -> Unit,
    search: SearchControl,
    backEnabled: Boolean,
    modifier: Modifier,
) {
    val owner = rememberNavigationEventDispatcherOwner(enabled = backEnabled)
    CompositionLocalProvider(LocalNavigationEventDispatcherOwner provides owner) {
        NavHost(sheet.nav, startDestination = SheetPage.Home, modifier = modifier.fillMaxWidth().padding(bottom = navigationBar)) {
            composable<SheetPage.Home> { SheetPageContent(SheetPage.Home, sheet, plan, airports, answer, pick, search) }
            composable<SheetPage.Plan> { SheetPageContent(SheetPage.Plan, sheet, plan, airports, answer, pick, search) }
            composable<SheetPage.Airport> { SheetPageContent(it.toRoute<SheetPage.Airport>(), sheet, plan, airports, answer, pick, search) }
            composable<SheetPage.Airplane> { SheetPageContent(it.toRoute<SheetPage.Airplane>(), sheet, plan, airports, answer, pick, search) }
        }
    }
}

/** One page of the sheet (or of the wide layout's panes), its Close
 *  going back one level and its links showing the next page. */
@Composable
internal fun SheetPageContent(
    page: SheetPage,
    sheet: SheetNav,
    plan: Plan,
    airports: AirportModel,
    answer: @Composable () -> Unit,
    pick: (SearchPick) -> Unit,
    search: SearchControl,
) {
    when (page) {
        SheetPage.Home -> Home(plan, answer, pick)
        SheetPage.Plan -> PlanPage(
            plan, onClose = { sheet.close(page) }, onField = { sheet.show(SheetPage.Airport(it)) },
            onFind = search::open, onAddStop = search::addStop,
        )
        is SheetPage.Airport -> AirportCard(page.ident, plan, onClose = { sheet.close(page) }, onDone = { sheet.show(SheetPage.Plan) }, model = airports)
        is SheetPage.Airplane -> AirplaneCard(page.at, plan, onClose = { sheet.close(page) }, onFlown = { sheet.show(SheetPage.Plan) })
    }
}

/** Nothing typed: the assistant's answer where there is one, the flight's
 *  card, then Favorites, Recents and Nearest, as the search shows them. */
@Composable
private fun Home(plan: Plan, answer: @Composable () -> Unit, onPick: (SearchPick) -> Unit) {
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
