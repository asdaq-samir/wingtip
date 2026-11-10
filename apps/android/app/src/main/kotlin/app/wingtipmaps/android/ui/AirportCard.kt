package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.FigureKey
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.RefreshBox
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.search.Remembered
import app.wingtipmaps.android.search.SearchMemory

/**
 * A field's card, laid out as Google Maps' place sheet on Android is in
 * its Material 3 Expressive design (9to5Google, 2025-09-17, of Maps
 * 25.37: the place's name with its line of facts under it, the sheet's
 * tabs -- Overview, Reviews, Photos, About -- above the picture previews,
 * the details in Material 3 Expressive containers with no rules between
 * them, and the actions as pills docked at the sheet's foot, Directions
 * first): Material's large flexible top app bar, "KOSH · Wittman
 * Regional" large over its town, shrinking as the card scrolls, with the
 * star and the close; the facts row -- Weather, Wind, Longest Runway,
 * Distance (from own ship, else "From KMSN", the route's departure) --
 * as containers, under a card of the field's closures and TFRs where it
 * has any (FieldAlertCard); the sections in a tab row, Overview's the
 * pictures (AirportSections); and the actions docked at the foot: Fly Here
 * filled, with its time at the airplane's cruise speed, then Depart From,
 * Add as Stop, Diagram, Call and Address. The planner's words throughout,
 * every figure the planner's or the engine's (AirportFacts). A pull
 * fetches the card again; Back closes it with the predictive gesture.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirportCard(ident: String, plan: Plan, onClose: () -> Unit, onDone: () -> Unit, model: AirportModel = viewModel()) {
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
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    var section by rememberSaveable(ident) { mutableIntStateOf(0) }
    var diagram by remember { mutableStateOf(false) }

    Scaffold(
        modifier = Modifier.fillMaxSize().nestedScroll(scroll.nestedScrollConnection),
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text(place?.let { "${it.ident} · ${it.name}" } ?: ident.uppercase(), maxLines = 2, overflow = TextOverflow.Ellipsis) },
                subtitle = place?.let { p -> listOfNotNull(p.municipality, p.region).joinToString(", ").ifEmpty { null }?.let { where -> { Text(where) } } },
                // Close at the end, as every level's title row has it
                // (decision 0015), never a back arrow at the start.
                actions = {
                    if (place != null) Star(place)
                    IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
                },
                windowInsets = WindowInsets(0),
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                scrollBehavior = scroll,
            )
        },
        bottomBar = {
            if (place != null) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
                    ActionPills(place, facts, actions, onDiagram = { diagram = true }, onDone = onDone)
                }
            }
        },
    ) { padding ->
        RefreshBox(refreshing = state.loading && place != null, onRefresh = model::refresh, enabled = place != null, modifier = Modifier.padding(padding)) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = WingtipSpace.Xl)) {
                state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg)) } }
                if (place == null) {
                    if (state.loading) item(key = "loading") { LoadingRow(Modifier.padding(WingtipSpace.Lg)) }
                    return@LazyColumn
                }
                // Closures and TFRs first, as Maps puts its live cards.
                val alerts = FieldAlerts.of(state.notams)
                if (alerts.isNotEmpty()) {
                    item(key = "alerts") {
                        FieldAlertCard(place.ident, alerts, onOpen = { section = AirportSection.NOTAMS.ordinal }, Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm))
                    }
                }
                facts?.let { f -> item(key = "facts") { FactsRow(f) } }
                item(key = "tabs") {
                    SecondaryScrollableTabRow(selectedTabIndex = section, containerColor = Color.Transparent, edgePadding = WingtipSpace.Lg) {
                        AirportSection.entries.forEach { s ->
                            Tab(selected = section == s.ordinal, onClick = { section = s.ordinal }, text = { Text(stringResource(s.title)) })
                        }
                    }
                }
                airportSection(AirportSection.entries[section], place, state)
            }
        }
    }
    if (diagram) place?.airportDiagramUrl?.let { url -> DiagramOwnShipDialog(place.ident, url) { diagram = false } }
}

/** The star: the field kept in the search's Favorites (SearchMemory). */
@Composable
private fun Star(place: AirportPlace) {
    val context = LocalContext.current
    val memory = remember(context) { SearchMemory.of(context) }
    val favorites by memory.favorites.collectAsStateWithLifecycle()
    val starred = favorites.any { it.kind == Remembered.Kind.AIRPORT && it.ident.equals(place.ident, ignoreCase = true) }
    IconToggleButton(checked = starred, onCheckedChange = { memory.toggleFavorite(Remembered(Remembered.Kind.AIRPORT, place.ident, place.name)) }) {
        Icon(
            if (starred) Icons.Filled.Star else Icons.Outlined.StarOutline,
            contentDescription = stringResource(if (starred) R.string.remove_favorite else R.string.add_favorite),
            tint = MaterialTheme.colorScheme.primary,
        )
    }
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
 * Material 3 Expressive's button group: Fly Here filled with its time
 * (none without an airplane, decision 0011), then Depart From, Add as
 * Stop, Diagram, Call and Address tonal, each one this field can do now.
 * Every action keeps its word (Google's research found actions harder to
 * use without labels); what does not fit the width goes into the group's
 * own overflow menu, never a smaller button. A pressed button widens and
 * its neighbours make room, the group's stock motion.
 */
@Composable
private fun ActionPills(place: AirportPlace, facts: AirportFacts?, actions: RouteActions, onDiagram: () -> Unit, onDone: () -> Unit) {
    val route = listOf(CardAction.DEPART_FROM, CardAction.ADD_STOP).filter { actions.canAirport(it, place) }
    val leave = listOf(CardAction.CALL, CardAction.ADDRESS).filter { actions.canAirport(it, place) }
    val flyHere = facts?.minutes?.let { stringResource(R.string.fly_here_in, Format.duration(it)) } ?: stringResource(R.string.action_fly_here)
    val diagram = stringResource(R.string.diagram)
    val words = (route + leave).associateWith { stringResource(it.label) }
    val items = buildList {
        add(GroupAction(flyHere, CardAction.FLY_HERE.icon, filled = true) { actions.airport(CardAction.FLY_HERE, place); onDone() })
        route.forEach { a -> add(GroupAction(words.getValue(a), a.icon) { actions.airport(a, place); onDone() }) }
        if (place.airportDiagramUrl != null) add(GroupAction(diagram, null, onClick = onDiagram))
        leave.forEach { a -> add(GroupAction(words.getValue(a), a.icon) { actions.airport(a, place) }) }
    }
    CardButtonGroup(items, Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm))
}
