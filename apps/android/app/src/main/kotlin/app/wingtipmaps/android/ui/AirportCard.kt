package app.wingtipmaps.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.FigureKey
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.search.FieldMarks
import app.wingtipmaps.android.search.Remembered
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.ui.card.CardTabBar
import app.wingtipmaps.android.ui.card.CardTabBarRoom
import app.wingtipmaps.android.ui.card.Status
import app.wingtipmaps.android.ui.card.StatusBadge
import app.wingtipmaps.android.ui.card.rememberCardFoot
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * A field's card, laid out after Apple Maps' place card, the web's C1 (the
 * owner, 2026-11-14: "How can we make our airport card more similar to
 * this? Can tabs be similar to that floating buttons group at the
 * bottom?"), in Android's own parts: the card's bar where the search was
 * (CardPage), ← and "KOSH · Wittman Regional" large over its town and
 * whether it has a tower ("Oshkosh, WI · Towered"), and ✕; a badge where a
 * NOTAM in force closes the field or a TFR is near it; Closed, Private,
 * Military or Joint use as status badges before the engine's use line
 * (rules.md 9); the four actions, as the web's (the owner, 2026-11-11): Fly
 * Here filled, with its time at the airplane's cruise speed, then Add as
 * Stop, Call and Favorite; under them the facts in a sideways strip
 * (Weather, Wind, Longest, Elevation, Distance, Fuel; CardFacts); then the
 * pictures as large tiles over every page (PhotoCarousel, a tap to the
 * pinch-zoom viewer); then the page picked -- Info, Weather, Runways or
 * Charts (AirportSections) -- with the pages' tabs in Material's floating
 * toolbar at the foot of the part of the card in sight (CardTabBar), the
 * page scrolling under it. Each thing a NOTAM in force addresses badged by
 * its name (NotamMarks). A NOTAM, from its row or a badge, opens on a page
 * of its own in the card's stack (NotamPage), ← and Back coming back to the
 * card where it was. The planner's words throughout, every figure the
 * planner's or the engine's (AirportFacts). Back closes it with the
 * predictive gesture. The same card from the search, the map, a list, the
 * plan and a link.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirportCard(ident: String, plan: Plan, exit: CardExit, onDone: () -> Unit, model: AirportModel = hiltViewModel(), flight: FlightModel = hiltViewModel()) {
    val context = LocalContext.current
    val state by model.state.collectAsStateWithLifecycle()
    val planState by plan.state.collectAsStateWithLifecycle()
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val airplane = rememberAirplaneNow(plan)
    val actions = rememberRouteActions(plan)
    LaunchedEffect(ident) { if (ident.isNotEmpty()) model.open(ident) }
    val place = state.place?.takeIf { it.ident.equals(ident, ignoreCase = true) }
    LaunchedEffect(place?.ident) { if (place != null) model.loadPhotos() }
    // Where the distance and Fly Here start: the airplane, else the
    // route's departure, its place the course's or its own card's.
    val known = planState.course?.departure?.let { AirportModel.Departure(it.ident, it.lat, it.lon) }
    LaunchedEffect(planState.dep, known) { model.departFrom(planState.dep, known) }
    val from = fix?.let { AirportFacts.From(it.lat, it.lon) } ?: state.departure?.let { AirportFacts.From(it.lat, it.lon, it.ident) }
    val cruise = airplane.value(FigureKey.CRUISE)
    val read by model.read.collectAsStateWithLifecycle()
    val (_, said, marks, badges, words) = read.takeIf { place != null && it.ident == place.ident } ?: AirportReads.Read()
    val unusable = remember(marks) { marks.runway.filterValues { it.unusable }.keys }
    val facts = remember(place, from, cruise, unusable) { place?.let { AirportFacts.of(it, from, cruise, unusable) } }
    var section by rememberSaveable(ident) { mutableIntStateOf(0) }
    var diagram by remember { mutableStateOf(false) }
    // The field's NOTAMs, each read by the engine once, best first (the
    // badges on what they address, AirportModel.read, above); the NOTAMs
    // opened over the card.
    val ranked = state.notams.takeIf { place != null }
    var allNotams by rememberSaveable(ident) { mutableStateOf(false) }
    var opened by remember(ident) { mutableStateOf<List<RankedNotam>?>(null) }
    val list = rememberLazyListState()
    val foot = rememberCardFoot()

    val shown = opened
    if (shown != null && place != null) {
        BackHandler { opened = null }
        val pages = shown.map { n -> said?.firstOrNull { it.notam.id == n.id } ?: FieldNotams.say(n, place.ident) }
        NotamPage(pages, place.ident, CardExit(back = { opened = null }, close = exit.close))
        return
    }
    val open: (List<RankedNotam>) -> Unit = { opened = it }
    val view = AirportCardView(
        marks = marks,
        runways = badges,
        notams = CardNotams(ranked, said, state.notamsProblem, allNotams, toggle = { allNotams = !allNotams }, open = open, none = words.notamsNone),
        onNotam = { open(it.notams) },
        onDiagram = place?.airportDiagramUrl?.let { { diagram = true } },
        words = words,
        frequencyOrder = remember(place?.frequencies) { place?.let(AirportFacts::frequencyOrder) },
    )

    // The field's name and ← where the search was, ✕ at the end (CardPage).
    CardPage(
        title = place?.let { "${it.ident} · ${it.name}" } ?: ident.uppercase(),
        exit = exit,
        subtitle = place?.let { p -> placeLine(p) },
    ) { padding ->
        // The card is fetched as it opens; no pull to refresh in a sheet,
        // whose drag down is the sheet's (the scrolling rule, 2026-11-10).
        Box(foot.frame(Modifier.padding(padding))) {
            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = CardTabBarRoom)) {
                state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg), onRetry = { model.open(ident) }) } }
                if (place == null) {
                    if (state.loading) item(key = "loading") { LoadingRow(Modifier.padding(WingtipSpace.Lg)) }
                    return@LazyColumn
                }
                // A NOTAM closing the field or a TFR near it, a badge by the
                // field's name, its tap the NOTAM (the owner, 2026-11-11).
                marks.field?.let { mark -> item(key = "field-notam") { NotamBadgeButton(mark, view.onNotam, Modifier.padding(horizontal = WingtipSpace.Sm)) } }
                // Closed (NASR, decision 0043) and who may land there, as
                // badges before the engine's use line (rules.md 9).
                if (words.closed != null || words.use != null) item(key = "use") { FieldUseLines(place, words, Modifier.padding(horizontal = WingtipSpace.Lg)) }
                // The four actions in the card under its head, in sight at half
                // as Maps' place sheet has them (the audit's AND-1).
                item(key = "actions") { ActionPills(place, facts, actions, onDone = onDone) }
                facts?.let { f -> item(key = "facts") { AirportFactStrip(f, state.fuelNames) } }
                item(key = "pictures") { PhotoCarousel(cardPictures(place, state), Modifier.padding(vertical = WingtipSpace.Sm)) }
                airportSection(AirportSection.entries[section], place, state, view)
            }
            // The pages' tabs floating at the foot of the card in sight (C1).
            CardTabBar(
                airportTabs(category = place?.metar?.flightCategory, charts = place?.let(::chartCount) ?: 0),
                picked = section,
                onPick = { section = it },
                foot = foot,
                enabled = place != null,
                modifier = Modifier.align(Alignment.BottomCenter),
                tag = "place-tab-bar",
            )
        }
    }
    if (diagram) place?.airportDiagramUrl?.let { url -> DiagramOwnShipDialog(place.ident, url, onClose = { diagram = false }) }
}

/** Where the field is and whether it has a control tower (NASR's tower
 *  type, the planner's `towered`), as Maps says a place's kind beside its
 *  name: "Oshkosh, WI · Towered". */
@Composable
private fun placeLine(place: AirportPlace): String {
    val town = listOfNotNull(place.municipality, place.region?.removePrefix("US-")).joinToString(", ").ifEmpty { null }
    val tower = stringResource(if (place.towered) R.string.place_towered else R.string.place_non_towered)
    return listOfNotNull(town, tower).joinToString(" · ")
}

/** Closed, the engine's label (NASR, decision 0043), and who may use the
 *  field (Private, Military, Joint use: NASR's use and ownership) as status
 *  badges, then the engine's use line ("Private: permission required"). */
@Composable
private fun FieldUseLines(place: AirportPlace, words: AirportReads.PlaceWords, modifier: Modifier) {
    Row(modifier.padding(vertical = WingtipSpace.Xs), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically) {
        words.closed?.let { StatusBadge(Status.Closed, words = it) }
        fieldUse(place)?.let { StatusBadge(it) }
        words.use?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

/** Who may use a field where it is not public: the planner's `military`
 *  ("military" or "joint") before its private use. */
private fun fieldUse(place: AirportPlace): Status? = when {
    place.military == "joint" -> Status.Joint
    place.military != null -> Status.Military
    place.isPrivate == true -> Status.Private
    else -> null
}

/** Whether the field is in the search's Favorites (SearchMemory), and the
 *  way to put it in or take it out: the Favorite tile's. */
@Composable
private fun rememberFavorite(place: AirportPlace): Pair<Boolean, () -> Unit> {
    val context = LocalContext.current
    val memory = remember(context) { SearchMemory.of(context) }
    val favorites by memory.favorites.collectAsStateWithLifecycle()
    val starred = favorites.any { it.kind == Remembered.Kind.AIRPORT && it.ident.equals(place.ident, ignoreCase = true) }
    // The card says what the field is now: a remembered label put right.
    LaunchedEffect(place.ident, place.closed) { memory.status(place.ident, place.closed) }
    return starred to { memory.toggleFavorite(Remembered(Remembered.Kind.AIRPORT, place.ident, place.name, closed = FieldMarks.closed(place.closed))) }
}

/**
 * The actions under the card's head, in sight at half, in
 * Material 3 Expressive's button group, four and no more as the web's
 * (the owner, 2026-11-11: "fly here, add stop, call and address ... no
 * need for other buttons", then "replace address button with favorite"):
 * Fly Here filled with its time (none without an airplane, decision
 * 0011); Add as Stop where the route can take it; Call, greyed where the
 * FAA lists no telephone; and Favorite, the star a toggle, where the head
 * had it. Every action keeps its word (Google's research found actions
 * harder to use without labels); what does not fit the width goes into
 * the group's own overflow menu, never a smaller button.
 */
@Composable
private fun ActionPills(place: AirportPlace, facts: AirportFacts?, actions: RouteActions, onDone: () -> Unit) {
    val flyHere = facts?.minutes?.let { stringResource(R.string.fly_here_in, Format.duration(it)) } ?: stringResource(R.string.action_fly_here)
    val addStop = stringResource(CardAction.ADD_STOP.label)
    val call = stringResource(CardAction.CALL.label)
    val favorite = stringResource(R.string.action_favorite)
    val (starred, toggle) = rememberFavorite(place)
    val items = buildList {
        // Greyed for a field NASR lists as closed: never offered to land (decision 0043).
        add(GroupAction(flyHere, CardAction.FLY_HERE.icon, filled = true, enabled = actions.canAirport(CardAction.FLY_HERE, place)) { actions.airport(CardAction.FLY_HERE, place); onDone() })
        if (actions.canAirport(CardAction.ADD_STOP, place)) add(GroupAction(addStop, CardAction.ADD_STOP.icon) { actions.airport(CardAction.ADD_STOP, place); onDone() })
        add(GroupAction(call, CardAction.CALL.icon, enabled = actions.canAirport(CardAction.CALL, place)) { actions.airport(CardAction.CALL, place) })
        add(GroupAction(favorite, if (starred) Icons.Filled.Star else Icons.Outlined.StarOutline, checked = starred, onClick = toggle))
    }
    CardButtonGroup(items, Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm))
}
