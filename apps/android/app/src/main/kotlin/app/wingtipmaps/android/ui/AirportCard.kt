package app.wingtipmaps.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.FigureKey
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.CardAction
import app.wingtipmaps.android.design.generated.CardKind
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.search.FieldMarks
import app.wingtipmaps.android.search.Remembered
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import app.wingtipmaps.android.ui.sheet.InSightFoot
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * A field's card, laid out as Google Maps' place sheet on Android is in
 * its Material 3 Expressive design (9to5Google, 2025-09-17, of Maps
 * 25.37: the place's name with its line of facts under it, the sheet's
 * tabs -- Overview, Reviews, Photos, About -- above the picture previews,
 * the details in Material 3 Expressive containers with no rules between
 * them, and the actions as pills under the place's head, Directions
 * first): the card's bar where the search was (CardPage), ← and "KOSH ·
 * Wittman Regional" large over its town, shrinking as the card scrolls,
 * and ✕; a badge where a NOTAM in force closes the field or a TFR is near
 * it; the facts row -- Weather, Wind, Longest Runway, Distance (from own
 * ship, else "From KMSN", the route's departure) -- as containers; the
 * actions, four and no more, as the web's (the owner, 2026-11-11): Fly
 * Here filled, with its time at the airplane's cruise speed, then Add as
 * Stop, Call and Favorite; under them the field's report in one line,
 * then the page of the tab picked in the bar floating at the foot of the
 * card in sight (AirportTabBar; C1, the owner, 2026-11-14, as the web's
 * and the iPhone's), Info's first the pictures (AirportSections); each
 * thing a NOTAM in force addresses badged by its name (NotamMarks). A NOTAM, from its row
 * or a badge, opens on a page of its own in the card's stack
 * (NotamPage), ← and Back coming back to the card where it was. The
 * planner's words throughout, every figure the planner's or the
 * engine's (AirportFacts). Back closes it with the predictive gesture.
 * The same card from the search, the map, a list, the plan and a link.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirportCard(ident: String, plan: Plan, exit: CardExit, onDone: () -> Unit, asStop: Boolean = false, model: AirportModel = hiltViewModel(), flight: FlightModel = hiltViewModel()) {
    val context = LocalContext.current
    val state by model.state.collectAsStateWithLifecycle()
    val planState by plan.state.collectAsStateWithLifecycle()
    // The airplane's place to a thousandth of a degree, told only as it
    // changes: the whole card was drawn again, and its facts asked of the
    // engine again, at every fix.
    val ship = flight.ownShip
    // The first place read once, as the flow is made, not at each drawing.
    val nearFirst = remember(ship) { ship.fix.value?.let(AirportFacts.From::near) }
    val near by remember(ship) { ship.fix.map { it?.let(AirportFacts.From::near) }.distinctUntilChanged() }
        .collectAsStateWithLifecycle(nearFirst)
    val airplane = rememberAirplaneNow(plan)
    val actions = rememberRouteActions(plan)
    LaunchedEffect(ident) { if (ident.isNotEmpty()) model.open(ident) }
    val place = state.place?.takeIf { it.ident.equals(ident, ignoreCase = true) }
    LaunchedEffect(place?.ident) { if (place != null) model.loadPhotos() }
    // Where the distance and Fly Here start: the airplane, else the
    // route's departure, its place the course's or its own card's.
    val known = planState.course?.departure?.let { AirportModel.Departure(it.ident, it.lat, it.lon) }
    LaunchedEffect(planState.dep, known) { model.departFrom(planState.dep, known) }
    val from = near ?: state.departure?.let { AirportFacts.From(it.lat, it.lon, it.ident) }
    val cruise = airplane.value(FigureKey.CRUISE)
    val facts = remember(place, from, cruise) { place?.let { AirportFacts.of(it, from, cruise) } }
    var section by rememberSaveable(ident) { mutableIntStateOf(0) }
    var diagram by remember { mutableStateOf(false) }
    // The field's NOTAMs, each read by the engine once, best first; the
    // badges on what they address (AirportModel.read); the NOTAMs opened
    // over the card.
    val read by model.read.collectAsStateWithLifecycle()
    val (_, said, marks, badges, words) = read.takeIf { place != null && it.ident == place.ident } ?: AirportReads.Read()
    val ranked = state.notams.takeIf { place != null }
    var allNotams by rememberSaveable(ident) { mutableStateOf(false) }
    var opened by remember(ident) { mutableStateOf<List<RankedNotam>?>(null) }
    val list = rememberLazyListState()

    val shown = opened
    if (shown != null && place != null) {
        BackHandler { opened = null }
        val pages = shown.map { n -> said?.firstOrNull { it.notam.id == n.id } ?: FieldNotams.say(n, place.ident) }
        // What the field is to the planned flight, for each NOTAM's chip: its departure, a stop, destination or IFR alternate filed.
        val filed by PlanAlternate.filed.collectAsStateWithLifecycle()
        val roles = remember(place.ident, planState.dep, planState.stops, planState.dest, planState.rules, filed) {
            planRoles(FieldNotams.identsOf(place.ident), planState.dep, planState.stops, planState.dest, PlanAlternate.of(planState.rules, planState.dest, filed))
        }
        NotamPage(pages, place.ident, CardExit(back = { opened = null }, close = exit.close), name = place.name, zone = state.notams?.timeZone, roles = roles)
        return
    }
    val open: (List<RankedNotam>) -> Unit = { opened = it }
    val view = AirportCardView(
        marks = marks,
        runways = badges,
        notams = CardNotams(ranked, said, state.notamsProblem, allNotams, toggle = { allNotams = !allNotams }, open = open, none = words.notamsNone, fetchedAtMs = state.notamsAtMs, retry = model::retryNotams),
        onNotam = { open(it.notams) },
        onDiagram = place?.airportDiagramUrl?.let { { diagram = true } },
        words = words,
        frequencyOrder = remember(place?.frequencies) { place?.let(AirportFacts::frequencyOrder) },
    )

    // The field's name and ← where the search was, ✕ at the end (CardPage).
    CardPage(
        title = place?.let { "${it.ident} · ${it.name}" } ?: ident.uppercase(),
        exit = exit,
        subtitle = place?.let { p -> listOfNotNull(p.municipality, p.region).joinToString(", ").ifEmpty { null } },
    ) { padding ->
        // The card is fetched as it opens; no pull to refresh in a sheet,
        // whose drag down is the sheet's (the scrolling rule, 2026-11-10).
        // The tabs float at the foot of the card in sight (C1), there once
        // the field's answer is in, as their pages are.
        val tabs: @Composable (Modifier) -> Unit = { at ->
            if (place != null) {
                AirportTabBar(AirportSection.entries[section], onPick = { section = it.ordinal }, category = place.metar?.flightCategory, charts = chartCount(place), modifier = at)
            }
        }
        InSightFoot(Modifier.padding(padding).fillMaxSize(), foot = tabs) {
            // Clear of the floating tabs at the list's end.
            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = WingtipSize.TabBar + WingtipSpace.Xl)) {
                state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg), onRetry = { model.open(ident) }) } }
                if (place == null) {
                    if (state.loading) item(key = "loading") { LoadingRow(Modifier.padding(WingtipSpace.Lg)) }
                    return@LazyColumn
                }
                // A NOTAM closing the field or a TFR near it, a badge by the
                // field's name, its tap the NOTAM (the owner, 2026-11-11).
                marks.field?.let { mark -> item(key = "field-notam") { NotamBadgeButton(mark, view.onNotam, Modifier.padding(horizontal = WingtipSpace.Sm)) } }
                // Closed (NASR, decision 0043) and who may land there, under
                // the name as the iPhone's head and the web's title say them.
                if (words.closed != null || words.use != null) item(key = "use") { FieldUseLines(words, Modifier.padding(horizontal = WingtipSpace.Lg)) }
                facts?.let { f -> item(key = "facts") { FactsRow(f) } }
                // The four actions in the card under its head, in sight at half
                // as Maps' place sheet has them: docked at
                // the foot of the full-height layout they sat below the window.
                item(key = "actions") { ActionPills(place, facts, actions, asStop, onDone = onDone) }
                // The field's own report in one line under the actions.
                item(key = "weather-line") { AirportWeatherLine(place.metar, Modifier.padding(horizontal = WingtipSpace.Lg)) }
                airportSection(AirportSection.entries[section], place, state, view)
            }
        }
    }
    if (diagram) place?.airportDiagramUrl?.let { url -> DiagramOwnShipDialog(place, url, onClose = { diagram = false }) }
}

/** A closed field's label in the error ink, and the field's use line
 *  ("Private: permission required"), each the engine's or the planner's
 *  words (AirportReads.PlaceWords). */
@Composable
private fun FieldUseLines(words: AirportReads.PlaceWords, modifier: Modifier) {
    Column(modifier.padding(vertical = WingtipSpace.Xs)) {
        words.closed?.let { Text(it, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error) }
        words.use?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
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

/** The facts under the title, each in its own container, read as one
 *  ("Wind, 270° 9 kt"): Weather, Wind, Longest Runway, Distance. */
@Composable
private fun FactsRow(f: AirportFacts) {
    val calm = stringResource(R.string.wind_calm)
    val wind = when {
        f.calm -> calm
        f.windKt == null -> null
        else -> listOfNotNull(f.windFromDeg?.let(Format::heading) ?: "VRB", Format.speed(f.windKt), f.gustKt?.let { "G" + Format.speed(it) }).joinToString(" ")
    }
    val facts = listOfNotNull(
        stringResource(R.string.fact_weather) to (f.category ?: stringResource(R.string.fact_no_report)),
        wind?.let { stringResource(R.string.fact_wind) to it },
        f.longestRunwayFt?.let { stringResource(R.string.fact_longest_runway) to Format.altitude(it.toDouble()) },
        // Whole miles, as the web's card says a field's distance.
        f.distanceNm?.let { (f.fromIdent?.let { from -> stringResource(R.string.fact_from, from) } ?: stringResource(R.string.fact_distance)) to Format.wholeMiles(it) },
    )
    LazyRow(contentPadding = PaddingValues(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        facts.forEach { (name, value) ->
            item(key = name) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh), modifier = Modifier.clearAndSetSemantics { contentDescription = "$name, $value" }) {
                    Column(Modifier.padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm)) {
                        Text(name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(value, style = MaterialTheme.typography.titleMediumEmphasized)
                    }
                }
            }
        }
    }
}

/** The airport row's kind (design/card-actions.json): opened while a stop
 *  is asked for, Add Stop's; where Add Stop cannot be used, Address in its
 *  place. */
internal fun airportKind(asStop: Boolean, stopOff: Boolean): CardKind = when {
    asStop -> CardKind.AIRPORT_AS_STOP
    stopOff -> CardKind.AIRPORT_STOP_OFF
    else -> CardKind.AIRPORT
}

/**
 * The actions under the card's head, in sight at half, in Material 3
 * Expressive's button group, its kind's four as the web's CARD_ACTIONS:
 * Fly Here filled with its time (none without an airplane, decision
 * 0011), Add Stop, Call, greyed where the FAA lists no telephone, and
 * Favorite, the star a toggle. Opened while a stop is asked for
 * (`asStop`), Add Stop is first and filled, no Fly Here, and Address last.
 * Where Add Stop cannot be used, Address is last in its place, not a
 * greyed tile (the owner, 2026-11-20; the web's PlaceActions). Every
 * action keeps its word; what does not fit the width goes into the
 * group's own overflow menu, never a smaller button.
 */
@Composable
private fun ActionPills(place: AirportPlace, facts: AirportFacts?, actions: RouteActions, asStop: Boolean, onDone: () -> Unit) {
    val kind = airportKind(asStop, stopOff = !actions.canAirport(CardAction.ADD_STOP, place))
    val (starred, toggle) = rememberFavorite(place)
    val items = kind.actions.map { action ->
        val first = action == kind.actions.first()
        when (action) {
            CardAction.FAVORITE -> GroupAction(stringResource(action.label), if (starred) Icons.Filled.Star else action.icon, checked = starred, onClick = toggle)
            // Greyed for a field NASR lists as closed: never offered to land (decision 0043).
            CardAction.FLY_HERE -> GroupAction(
                facts?.minutes?.let { stringResource(R.string.fly_here_in, Format.duration(it)) } ?: stringResource(action.label),
                action.icon, filled = first, enabled = actions.canAirport(action, place),
            ) { actions.airport(action, place); onDone() }
            else -> GroupAction(stringResource(action.label), action.icon, filled = first, enabled = actions.canAirport(action, place)) {
                actions.airport(action, place)
                if (action == CardAction.ADD_STOP) onDone()
            }
        }
    }
    CardButtonGroup(items, Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm))
}
