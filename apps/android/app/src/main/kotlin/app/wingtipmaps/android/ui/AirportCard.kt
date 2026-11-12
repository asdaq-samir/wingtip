package app.wingtipmaps.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
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
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.search.Remembered
import app.wingtipmaps.android.search.SearchMemory
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A field's card, laid out as Google Maps' place sheet on Android is in
 * its Material 3 Expressive design (9to5Google, 2025-09-17, of Maps
 * 25.37: the place's name with its line of facts under it, the sheet's
 * tabs -- Overview, Reviews, Photos, About -- above the picture previews,
 * the details in Material 3 Expressive containers with no rules between
 * them, and the actions as pills docked at the sheet's foot, Directions
 * first): the card's bar where the search was (CardPage), ← and "KOSH ·
 * Wittman Regional" large over its town, shrinking as the card scrolls,
 * and ✕; a badge where a NOTAM in force closes the field or a TFR is near
 * it; the facts row -- Weather, Wind, Longest Runway, Distance (from own
 * ship, else "From KMSN", the route's departure) -- as containers; the
 * sections in a tab row, Overview's the pictures (AirportSections), each
 * thing a NOTAM in force addresses badged by its name (NotamMarks); and
 * the actions docked at the foot, four and no more, as the web's (the
 * owner, 2026-11-11): Fly Here filled, with its time at the airplane's
 * cruise speed, then Add as Stop, Call and Favorite. A NOTAM, from its row
 * or a badge, opens on a page of its own in the card's stack
 * (NotamPage), ← and Back coming back to the card where it was. The
 * planner's words throughout, every figure the planner's or the
 * engine's (AirportFacts). Back closes it with the predictive gesture.
 * The same card from the search, the map, a list, the plan and a link.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirportCard(ident: String, plan: Plan, exit: CardExit, onDone: () -> Unit, model: AirportModel = hiltViewModel()) {
    val context = LocalContext.current
    val state by model.state.collectAsStateWithLifecycle()
    val planState by plan.state.collectAsStateWithLifecycle()
    val fix by remember(context) { OwnShip.of(context) }.fix.collectAsStateWithLifecycle()
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
    val facts = remember(place, from, cruise) { place?.let { AirportFacts.of(it, from, cruise) } }
    var section by rememberSaveable(ident) { mutableIntStateOf(0) }
    var diagram by remember { mutableStateOf(false) }
    // The field's NOTAMs, each read by the engine once, best first; the
    // badges on what they address; the NOTAMs opened over the card. Read
    // off the main thread as the card opens: the engine reads every one.
    val ranked = state.notams.takeIf { place != null }
    val read by produceState<Pair<List<FieldNotams.Said>?, NotamMarks>>(null to NotamMarks.NONE, ranked, place) {
        value = place?.let { p ->
            withContext(Dispatchers.Default) {
                ranked?.notams?.sortedBy { it.rank }?.map { FieldNotams.say(it, p.ident) } to NotamMarks.of(ranked?.notams.orEmpty(), p)
            }
        } ?: (null to NotamMarks.NONE)
    }
    val (said, marks) = read
    val badges = remember(place, marks) { place?.let { RunwayBadges.of(it, marks) } ?: RunwayBadges(-1, -1) }
    var allNotams by rememberSaveable(ident) { mutableStateOf(false) }
    var opened by remember(ident) { mutableStateOf<List<RankedNotam>?>(null) }
    val list = rememberLazyListState()

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
        notams = CardNotams(ranked, said, state.notamsProblem, allNotams, toggle = { allNotams = !allNotams }, open = open),
        onNotam = { open(it.notams) },
        onDiagram = place?.airportDiagramUrl?.let { { diagram = true } },
    )

    // The field's name and ← where the search was, ✕ at the end (CardPage).
    CardPage(
        title = place?.let { "${it.ident} · ${it.name}" } ?: ident.uppercase(),
        exit = exit,
        subtitle = place?.let { p -> listOfNotNull(p.municipality, p.region).joinToString(", ").ifEmpty { null } },
        bottomBar = {
            if (place != null) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
                    ActionPills(place, facts, actions, onDone = onDone)
                }
            }
        },
    ) { padding ->
        // The card is fetched as it opens; no pull to refresh in a sheet,
        // whose drag down is the sheet's (the scrolling rule, 2026-11-10).
        Box(Modifier.padding(padding)) {
            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = WingtipSpace.Xl)) {
                state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg), onRetry = { model.open(ident) }) } }
                if (place == null) {
                    if (state.loading) item(key = "loading") { LoadingRow(Modifier.padding(WingtipSpace.Lg)) }
                    return@LazyColumn
                }
                // A NOTAM closing the field or a TFR near it, a badge by the
                // field's name, its tap the NOTAM (the owner, 2026-11-11).
                marks.field?.let { mark -> item(key = "field-notam") { NotamBadgeButton(mark, view.onNotam, Modifier.padding(horizontal = WingtipSpace.Sm)) } }
                facts?.let { f -> item(key = "facts") { FactsRow(f) } }
                // The sections' tabs pin under the bar as the card scrolls (the
                // scrolling rule, 2026-11-10), in the sheet's own colour.
                stickyHeader(key = "tabs") {
                    SecondaryScrollableTabRow(selectedTabIndex = section, containerColor = BottomSheetDefaults.ContainerColor, edgePadding = WingtipSpace.Lg) {
                        AirportSection.entries.forEach { s ->
                            Tab(selected = section == s.ordinal, onClick = { section = s.ordinal }, text = { Text(stringResource(s.title)) })
                        }
                    }
                }
                airportSection(AirportSection.entries[section], place, state, view)
            }
        }
    }
    if (diagram) place?.airportDiagramUrl?.let { url -> DiagramOwnShipDialog(place.ident, url) { diagram = false } }
}

/** Whether the field is in the search's Favorites (SearchMemory), and the
 *  way to put it in or take it out: the Favorite tile's. */
@Composable
private fun rememberFavorite(place: AirportPlace): Pair<Boolean, () -> Unit> {
    val context = LocalContext.current
    val memory = remember(context) { SearchMemory.of(context) }
    val favorites by memory.favorites.collectAsStateWithLifecycle()
    val starred = favorites.any { it.kind == Remembered.Kind.AIRPORT && it.ident.equals(place.ident, ignoreCase = true) }
    return starred to { memory.toggleFavorite(Remembered(Remembered.Kind.AIRPORT, place.ident, place.name)) }
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
        f.distanceNm?.let { (f.fromIdent?.let { from -> stringResource(R.string.fact_from, from) } ?: stringResource(R.string.fact_distance)) to Format.distance(it) },
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

/**
 * The actions docked at the card's foot, as Maps docks its pills, in
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
        add(GroupAction(flyHere, CardAction.FLY_HERE.icon, filled = true) { actions.airport(CardAction.FLY_HERE, place); onDone() })
        if (actions.canAirport(CardAction.ADD_STOP, place)) add(GroupAction(addStop, CardAction.ADD_STOP.icon) { actions.airport(CardAction.ADD_STOP, place); onDone() })
        add(GroupAction(call, CardAction.CALL.icon, enabled = actions.canAirport(CardAction.CALL, place)) { actions.airport(CardAction.CALL, place) })
        add(GroupAction(favorite, if (starred) Icons.Filled.Star else Icons.Outlined.StarOutline, checked = starred, onClick = toggle))
    }
    CardButtonGroup(items, Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm))
}
