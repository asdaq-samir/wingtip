package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.AirplaneCard
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.design.PredictiveBackState
import app.wingtipmaps.android.design.SharedAxisContent
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.predictiveBack
import app.wingtipmaps.android.design.rememberPredictiveBack
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.search.FlightCard
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.search.SearchModel
import app.wingtipmaps.android.search.SearchPick
import app.wingtipmaps.android.search.nothingTyped

/** What the docked sheet shows under the one search: with nothing typed
 *  the flight's card, Favorites, Recents and Nearest (Home); the plan; a
 *  field's card; or an airplane's. Kept by its key across a rotation. */
sealed interface SheetPage {
    val key: String

    data object Home : SheetPage {
        override val key = "home"
    }

    data object Plan : SheetPage {
        override val key = "plan"
    }

    data class Airport(val ident: String) : SheetPage {
        override val key get() = "airport:$ident"
    }

    /** An airplane's card, over whatever page was up while it is open
     *  (ProfileOpen, which keeps it). */
    data class Airplane(val at: ProfileOpen.At) : SheetPage {
        override val key get() = "home"
    }

    companion object {
        fun of(key: String): SheetPage = when {
            key == Plan.key -> Plan
            key.startsWith("airport:") -> Airport(key.removePrefix("airport:"))
            else -> Home
        }

        /** Each page's place along the sheet's axis, for its shared-axis move. */
        fun depth(page: SheetPage): Int = when (page) {
            Home -> 0
            Plan -> 1
            is Airport -> 2
            is Airplane -> 3
        }
    }
}

/**
 * The docked sheet's page, under the one search: Home, the plan
 * (PlanPage), a field's card (AirportCard, the map ringing it), or an
 * airplane's (AirplaneCard), one
 * giving way to the next along the sheet's axis (Material's shared axis).
 * `answer` is the assistant's last answer, shown over Home and the plan.
 *
 * @param onPage a page to show; `onBack` one level back from this one.
 */
@Composable
fun SheetPages(
    page: SheetPage,
    plan: Plan,
    airports: AirportModel,
    back: PredictiveBackState,
    navigationBar: Dp,
    answer: @Composable () -> Unit,
    onPage: (SheetPage) -> Unit,
    onBack: () -> Unit,
    onPick: (SearchPick) -> Unit,
    onFind: () -> Unit,
    onAddStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // The page last shown at each depth, so the one leaving is drawn as it
    // was while the next comes in.
    val shownAt = remember { mutableMapOf<Int, SheetPage>() }
    shownAt[SheetPage.depth(page)] = page
    SharedAxisContent(SheetPage.depth(page), modifier.fillMaxWidth()) { depth ->
        val shown = shownAt[depth] ?: page
        Box(Modifier.fillMaxSize().padding(bottom = navigationBar).then(if (shown != SheetPage.Home) Modifier.predictiveBack(back) else Modifier)) {
            when (shown) {
                SheetPage.Home -> Home(plan, answer, onPick)
                SheetPage.Plan -> Box(Modifier.fillMaxSize()) {
                    PlanPage(plan, onClose = onBack, onField = { onPage(SheetPage.Airport(it)) }, onFind = onFind, onAddStop = onAddStop)
                }
                is SheetPage.Airport -> AirportCard(shown.ident, plan, onClose = onBack, onDone = { onPage(SheetPage.Plan) }, model = airports)
                is SheetPage.Airplane -> AirplaneCard(shown.at, plan, onClose = ProfileOpen::close, onFlown = { ProfileOpen.close(); onPage(SheetPage.Plan) })
            }
        }
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

/** SheetPages with the root's handlers, and the page's Back where the
 *  sheet's own Back (which lowers it) does not come first. */
@Composable
internal fun SheetPagesFor(
    page: SheetPage,
    plan: Plan,
    airports: AirportModel,
    navigationBar: Dp,
    answer: @Composable () -> Unit,
    show: (SheetPage) -> Unit,
    back: () -> Unit,
    pick: (SearchPick) -> Unit,
    search: SearchControl,
    modifier: Modifier,
    atPill: Boolean,
) {
    val close = { if (page is SheetPage.Airplane) ProfileOpen.close() else back() }
    val pageBack = rememberPredictiveBack(enabled = atPill && page != SheetPage.Home, onBack = close)
    SheetPages(
        page, plan, airports, pageBack, navigationBar, answer, onPage = show, onBack = close, onPick = pick,
        onFind = search::open, onAddStop = search::addStop, modifier = modifier,
    )
}
