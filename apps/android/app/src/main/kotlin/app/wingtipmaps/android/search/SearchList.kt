package app.wingtipmaps.android.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalAirport
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.outlined.ChangeHistory
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.airplane.badge
import app.wingtipmaps.android.airplane.inAirStatus
import app.wingtipmaps.android.airplane.rest
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.card.Badged
import app.wingtipmaps.android.ui.card.BadgedLine
import app.wingtipmaps.android.ui.card.Status
import app.wingtipmaps.android.ui.nearestRows

/** The kinds of result a filter chip narrows the list to, as Google
 *  Maps puts its filters over the results; none chosen shows them all. */
enum class ResultKind(val title: Int) {
    AIRPORTS(R.string.group_airports),
    WAYPOINTS(R.string.group_waypoints),
    AIRPLANES(R.string.group_airplanes),
}

/**
 * One row of Material's filter chips over the typed results, a chip a
 * kind: tapped, the list shows that kind alone (more than one may be on).
 * It only hides groups the search already found, so it asks nothing new.
 */
fun LazyListScope.kindFilters(chosen: Set<ResultKind>, onToggle: (ResultKind) -> Unit) {
    item(key = "kinds") {
        LazyRow(contentPadding = PaddingValues(horizontal = WingtipSpace.Lg), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            items(ResultKind.entries, key = { it.name }) { kind ->
                FilterChip(selected = kind in chosen, onClick = { onToggle(kind) }, label = { Text(stringResource(kind.title)) })
            }
        }
    }
}

/**
 * What the one search lists, as Material's list items under a heading a
 * group, each row one tap and read by TalkBack as one thing, a glyph at
 * its start saying what it is: with a line typed, its results grouped
 * (Airports, Waypoints and Navaids, Airplanes, Do), narrowed to the kinds
 * `chosen` where any is; with nothing typed, Nearest, Favorites and
 * Recents.
 */
fun LazyListScope.searchResults(
    state: SearchModel.State,
    actions: List<DoAction>,
    routed: Boolean,
    hasFix: Boolean,
    chosen: Set<ResultKind>,
    onPick: (SearchPick) -> Unit,
) {
    fun shows(kind: ResultKind) = chosen.isEmpty() || kind in chosen
    if (state.loading && state.airports.isEmpty() && state.airplanes.isEmpty()) item(key = "loading") { Loading(Modifier.padding(WingtipSpace.Lg).size(WingtipSpace.Xl)) }
    state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg)) } }
    if (shows(ResultKind.AIRPORTS)) {
        group("airports", R.string.group_airports, state.airports) { a ->
            // A closed field's badge first (decision 0043), then its use's,
            // then where it is (rules.md 9).
            ResultRow(a.ident, a.name, where(a), Icons.Filled.LocalAirport, badges = FieldMarks.badges(a.closed, a.use)) {
                onPick(SearchPick.Airport(a.ident, a.name, FieldMarks.closed(a.closed)))
            }
        }
    }
    if (shows(ResultKind.WAYPOINTS)) {
        group("waypoints", R.string.group_waypoints, state.waypoints) { w ->
            val doing = stringResource(if (routed) R.string.waypoint_add else R.string.waypoint_direct).takeIf { routed || hasFix }
            ResultRow(w.ident, w.name, listOfNotNull(w.region, doing).joinToString(" · "), Icons.Outlined.ChangeHistory) { onPick(SearchPick.Waypoint(w.ident)) }
        }
    }
    if (shows(ResultKind.AIRPLANES)) group("airplanes", R.string.group_airplanes, state.airplanes) { hit -> AirplaneRow(hit, onPick) }
    group("do", R.string.group_do, actions) { action -> DoRow(action) { onPick(SearchPick.Do(action)) } }
}

/** With nothing typed: the fields nearest, then the pilot's Favorites and
 *  Recents, the airports' before the airplanes' (the web's one search,
 *  2026-11-14), the Favorites led by the airplane flown and ended by Add. */
fun LazyListScope.nothingTyped(
    favorites: List<Remembered>,
    own: Collection<OwnRecord>,
    recents: List<Remembered>,
    nearest: List<NearestAirport>?,
    nearestProblem: String?,
    fix: OwnShip.Fix?,
    tail: String?,
    onPick: (SearchPick) -> Unit,
    onKeep: (SearchControl.Keep) -> Unit,
) {
    // Nearest first, as the web's Search page has it (the owner,
    // 2026-11-11), then the pilot's own.
    item(key = "nearest-title") { Heading(R.string.nearest) }
    nearestProblem?.let { item(key = "nearest-problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg)) } }
    if (nearest.isNullOrEmpty()) {
        // No position yet: the Nearest page, which asks for it, named for
        // what it does rather than the heading's word again.
        item(key = "nearest-open") { ResultRow(stringResource(R.string.find_nearest), null, null, Icons.Filled.NearMe) { onPick(SearchPick.Do(DoAction.Open(Screen.NEAREST))) } }
    } else {
        // The Nearest page's own rows (nearestRows), the three nearest.
        nearestRows(nearest, fix) { n -> onPick(SearchPick.Airport(n.ident, n.name)) }
    }
    item(key = "favorites-title") { Heading(R.string.favorites) }
    item(key = "favorites") { FavoritesRow(SearchGroups.starred(favorites, own), tail, { onPick(pickOf(it)) }, onKeep) }
    group("recents", R.string.recents, SearchGroups.airportsFirst(recents)) { r ->
        ResultRow(r.ident, r.name, null, Icons.Filled.History, badges = FieldMarks.badges(r.closed, null)) { onPick(pickOf(r)) }
    }
}

internal fun pickOf(r: Remembered): SearchPick = when (r.kind) {
    Remembered.Kind.AIRPORT -> SearchPick.Airport(r.ident, r.name, r.closed)
    Remembered.Kind.AIRPLANE -> SearchPick.Airplane(tail = r.ident.takeIf { SearchGroups.looksLikeTail(it) }, type = r.type, name = r.ident)
}

private fun <T> LazyListScope.group(key: String, title: Int, rows: List<T>, row: @Composable (T) -> Unit) {
    if (rows.isEmpty()) return
    item(key = "$key-title") { Heading(title) }
    rows.forEachIndexed { i, r -> item(key = "$key-$i") { row(r) } }
}

@Composable
private fun Heading(title: Int) {
    Text(
        stringResource(title),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Lg, top = WingtipSpace.Md, bottom = WingtipSpace.Xs).semantics { heading() },
    )
}

/** A result: Material's list item, the whole row the tap -- its ident at
 *  titleMedium and its name after it at bodyMedium, a glyph at the start
 *  saying what it is, and what it is beside, under them. */
@Composable
private fun ResultRow(
    ident: String,
    name: String?,
    supporting: String?,
    glyph: ImageVector?,
    tint: Boolean = false,
    badges: List<Badged> = emptyList(),
    onClick: () -> Unit,
) {
    ListItem(
        onClick = onClick,
        leadingContent = glyph?.let { { Icon(it, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } },
        supportingContent = if (badges.isEmpty() && supporting.isNullOrEmpty()) null else ({ BadgedLine(badges, supporting) }),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = {
            Text(
                buildAnnotatedString {
                    withStyle(MaterialTheme.typography.titleMedium.toSpanStyle()) { append(ident) }
                    if (!name.isNullOrEmpty()) withStyle(MaterialTheme.typography.bodyMedium.toSpanStyle()) { append("  " + name) }
                },
                color = if (tint) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        },
    )
}

@Composable
private fun AirplaneRow(hit: AirplaneHit, onPick: (SearchPick) -> Unit) {
    when (hit) {
        is AirplaneHit.Own -> {
            val name = hit.record.tail ?: hit.record.type.uppercase()
            ResultRow(name, null, listOf(hit.record.type.uppercase(), stringResource(R.string.airplane_yours)).filter { it.isNotEmpty() }.joinToString(" · "), WingtipIcons.airplane) {
                onPick(SearchPick.Airplane(hit.record.tail, hit.record.type.ifEmpty { null }, name))
            }
        }
        is AirplaneHit.Registered -> {
            val r = hit.registration
            val tail = "N" + r.nNumber.uppercase().removePrefix("N")
            val what = listOfNotNull(r.manufacturer, r.model).joinToString(" ")
            // The record's type at once, then whether it is in the air, led
            // by its badge where it is (rules.md 9).
            val status = inAirStatus(hit.inAir)
            val line = listOf(what, stringResource(R.string.airplane_registry), status.rest().orEmpty()).filter { it.isNotEmpty() }.joinToString(" · ")
            ResultRow(tail, null, line, WingtipIcons.airplane, badges = listOfNotNull(status.badge?.let(::Badged))) {
                onPick(SearchPick.Airplane(tail, null, tail))
            }
        }
        is AirplaneHit.Heard -> {
            val p = hit.plane
            val callsign = p.callsign?.trim()?.ifEmpty { null }
            val name = callsign ?: p.registration ?: p.hex.uppercase()
            val line = listOfNotNull(p.type, p.registration?.takeIf { callsign != null }).joinToString(" · ").ifEmpty { stringResource(R.string.heard_now) }
            ResultRow(name, null, line, WingtipIcons.airplane, badges = listOf(Badged(Status.InAir))) {
                onPick(SearchPick.Traffic(p.hex, p.registration))
            }
        }
        is AirplaneHit.Type -> {
            val p = hit.profile
            ResultRow(p.name.uppercase(), null, "${p.type} · " + stringResource(R.string.airplane_stock_type), WingtipIcons.airplane) {
                onPick(SearchPick.Airplane(null, p.name, p.name.uppercase()))
            }
        }
    }
}

@Composable
private fun DoRow(action: DoAction, onClick: () -> Unit) {
    val words = when (action) {
        is DoAction.DirectTo -> stringResource(R.string.do_direct_to, action.ident)
        is DoAction.Open -> action.screen.title
        is DoAction.Ask -> stringResource(R.string.do_ask, action.question)
        DoAction.ShowTraffic -> stringResource(R.string.do_show_traffic)
    }
    ResultRow(words, null, null, WingtipIcons.ai.takeIf { action is DoAction.Ask }, tint = true, onClick = onClick)
}

private fun where(a: AirportSuggestion): String = listOfNotNull(a.municipality, a.region).joinToString(", ")
