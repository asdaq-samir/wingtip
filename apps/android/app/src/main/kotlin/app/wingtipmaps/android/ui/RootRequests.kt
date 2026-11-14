package app.wingtipmaps.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.NavaidFind
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.route.RouteLegModel
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.share.SharedFlightModel
import app.wingtipmaps.android.ui.OpenScreen.Where
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map

/**
 * What the map screen is asked to show from outside its own taps, each
 * brought to the sheet's stack (RootScreen's pages): a route changed from
 * anywhere brings the plan's page, the one search asked for brings the
 * Search page, a link opened in the app (`pending`, `onHandled` once it is
 * taken), a screen asked for by its name, a thing's card asked for, and
 * the leg whose card is on top, cased on the map (RouteLegModel).
 */
@Composable
internal fun RootRequests(
    pending: StateFlow<Links.Link?>,
    onHandled: () -> Unit,
    plan: Plan,
    pages: SheetNav,
    search: SearchControl,
    stripLayout: Boolean,
    layout: String?,
    showPlan: () -> Unit,
    shared: SharedFlightModel,
    legs: RouteLegModel = hiltViewModel(),
) {
    // The carousel (SheetCarousel): a route made, opened or changed from
    // anywhere (Fly Here, Depart From, Direct To, Add a Stop, a link, the
    // copilot's) brings the FPL page, the route's points its key as the
    // web's usePanelView has it; clearing it leaves the page as it is, and
    // the one search asked for from the plan (Add a Stop) or an airport
    // field brings the Search page, where its field is. Fly Here to the
    // airport the route already goes to changes no point: its card shows
    // the plan itself (showPlan).
    LaunchedEffect(plan, stripLayout) {
        if (!stripLayout) {
            plan.state.map { s -> if (s.routed) listOf(s.dep, s.dest) + s.stops else null }
                .distinctUntilChanged().drop(1).filterNotNull().collect { pages.toPlanPage() }
        }
    }
    LaunchedEffect(search) { snapshotFlow { search.asked }.drop(1).collect { pages.closePlan() } }

    val link by pending.collectAsStateWithLifecycle()
    LaunchedEffect(link) {
        when (val opened = link) {
            null -> return@LaunchedEffect
            is Links.Place -> pages.show(SheetPage.Airport(opened.ident))
            // A TFR's or a VOR's card, the same a tap opens; the VOR found
            // on the chart once the map is there (NavaidFind).
            is Links.Tfr -> pages.show(SheetPage.Thing(MapPick.Tfr(opened.notamId)))
            is Links.Navaid -> MapPick.NavaidAt(opened.ident, opened.lat, opened.lon).let { at ->
                NavaidFind.find(at)
                pages.show(SheetPage.Thing(at))
            }
            is Links.Route -> {
                plan.plan(opened.dep, opened.dest, opened.stops)
                showPlan()
                opened.then?.let(ScreenRequests::ask)
            }
            is Links.Open -> ScreenRequests.ask(opened.screen)
            // Previewed first: the receiver's plan stays until Use This Plan.
            is Links.Shared -> shared.open(opened)
            is Links.SignIn -> {}
        }
        onHandled()
    }

    // A screen asked for by its name -- a link, a shortcut, an App
    // Function, a row or a menu -- where it lives now (OpenScreen).
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, layout) {
        val screen = wanted ?: return@LaunchedEffect
        when (val where = OpenScreen.whereOf(screen)) {
            Where.Plan -> showPlan()
            // The search is under the cards: they close for it.
            Where.Search -> {
                pages.closeAll()
                search.open()
            }
            is Where.Page -> pages.open(where.page)
            Where.None -> {}
        }
        if (screen !in OpenScreen.takenInside) ScreenRequests.take(setOf(screen))
    }

    val card by CardRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(card) { CardRequests.take()?.let(pages::open) }
    // The leg whose card is on top, cased in green on the map.
    LaunchedEffect(pages.top) {
        val leg = pages.top as? SheetPage.Leg
        if (leg != null) legs.open(leg.index) else legs.close()
    }
}
