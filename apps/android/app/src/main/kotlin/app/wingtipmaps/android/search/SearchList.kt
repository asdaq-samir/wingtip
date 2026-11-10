package app.wingtipmaps.android.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ui.ProblemLine

/**
 * What the one search lists, as Material's list items under a heading a
 * group, each row one tap and read by TalkBack as one thing: with a line
 * typed, its results grouped (Airports, Waypoints and Navaids, Airplanes,
 * Do); with nothing typed, Favorites, Recents and Nearest.
 */
fun LazyListScope.searchResults(state: SearchModel.State, actions: List<DoAction>, routed: Boolean, hasFix: Boolean, onPick: (SearchPick) -> Unit) {
    if (state.loading && state.airports.isEmpty() && state.airplanes.isEmpty()) item(key = "loading") { Loading(Modifier.padding(WingtipSpace.Lg).size(WingtipSpace.Xl)) }
    state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg)) } }
    group("airports", R.string.group_airports, state.airports) { a ->
        ResultRow(a.ident + "  " + a.name, where(a)) { onPick(SearchPick.Airport(a.ident, a.name)) }
    }
    group("waypoints", R.string.group_waypoints, state.waypoints) { w ->
        val doing = stringResource(if (routed) R.string.waypoint_add else R.string.waypoint_direct).takeIf { routed || hasFix }
        ResultRow(w.ident + "  " + w.name, listOfNotNull(w.region, doing).joinToString(" · ")) { onPick(SearchPick.Waypoint(w.ident)) }
    }
    group("airplanes", R.string.group_airplanes, state.airplanes) { hit -> AirplaneRow(hit, onPick) }
    group("do", R.string.group_do, actions) { action -> DoRow(action) { onPick(SearchPick.Do(action)) } }
}

/** With nothing typed: the pilot's favorite fields and own airplanes,
 *  the fields and airplanes last picked, and the fields nearest. */
fun LazyListScope.nothingTyped(
    favorites: List<Remembered>,
    own: Collection<OwnRecord>,
    recents: List<Remembered>,
    nearest: List<NearestAirport>?,
    nearestProblem: String?,
    onPick: (SearchPick) -> Unit,
) {
    val starred = (favorites + own.mapNotNull { r -> r.tail?.let { Remembered(Remembered.Kind.AIRPLANE, it, r.type, r.type) } }).distinctBy { it.kind.name + it.ident.uppercase() }
    if (starred.isNotEmpty()) {
        item(key = "favorites-title") { Heading(R.string.favorites) }
        item(key = "favorites") {
            LazyRow(contentPadding = PaddingValues(horizontal = WingtipSpace.Lg), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                items(starred, key = { it.kind.name + it.ident }) { f ->
                    AssistChip(onClick = { onPick(pickOf(f)) }, label = { Text(listOf(f.ident, f.name).filter { it.isNotEmpty() }.joinToString(" ")) })
                }
            }
        }
    }
    group("recents", R.string.recents, recents) { r -> ResultRow(r.ident + "  " + r.name, null) { onPick(pickOf(r)) } }
    item(key = "nearest-title") { Heading(R.string.nearest) }
    nearestProblem?.let { item(key = "nearest-problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg)) } }
    if (nearest.isNullOrEmpty()) {
        // No position yet: Nearest itself, which asks for it.
        item(key = "nearest-open") { ResultRow(stringResource(R.string.nearest), null) { onPick(SearchPick.Do(DoAction.Open(Screen.NEAREST))) } }
    } else {
        items(nearest, key = { "near-" + it.ident }) { n ->
            ResultRow(n.ident + "  " + n.name, listOfNotNull(Format.distance(n.distanceNm), n.flightCategory).joinToString(" · ")) {
                onPick(SearchPick.Airport(n.ident, n.name))
            }
        }
    }
}

private fun pickOf(r: Remembered): SearchPick = when (r.kind) {
    Remembered.Kind.AIRPORT -> SearchPick.Airport(r.ident, r.name)
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
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Lg, top = WingtipSpace.Md, bottom = WingtipSpace.Xs).semantics { heading() },
    )
}

/** A result: Material's list item, the whole row the tap. */
@Composable
private fun ResultRow(headline: String, supporting: String?, tint: Boolean = false, onClick: () -> Unit) {
    ListItem(
        supportingContent = supporting?.takeIf { it.isNotEmpty() }?.let { { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick),
        content = { Text(headline, color = if (tint) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) },
    )
}

@Composable
private fun AirplaneRow(hit: AirplaneHit, onPick: (SearchPick) -> Unit) {
    when (hit) {
        is AirplaneHit.Own -> {
            val name = hit.record.tail ?: hit.record.type.uppercase()
            ResultRow(name, listOf(hit.record.type.uppercase(), stringResource(R.string.airplane_yours)).filter { it.isNotEmpty() }.joinToString(" · ")) {
                onPick(SearchPick.Airplane(hit.record.tail, hit.record.type.ifEmpty { null }, name))
            }
        }
        is AirplaneHit.Registered -> {
            val r = hit.registration
            val tail = "N" + r.nNumber.uppercase().removePrefix("N")
            val what = listOfNotNull(r.manufacturer, r.model).joinToString(" ")
            ResultRow(tail, listOf(what, stringResource(R.string.airplane_registry)).filter { it.isNotEmpty() }.joinToString(" · ")) {
                onPick(SearchPick.Airplane(tail, null, tail))
            }
        }
        is AirplaneHit.Type -> {
            val p = hit.profile
            ResultRow(p.name.uppercase(), "${p.type} · " + stringResource(R.string.airplane_stock_type)) {
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
    }
    ResultRow(words, null, tint = true, onClick = onClick)
}

private fun where(a: AirportSuggestion): String = listOfNotNull(a.municipality, a.region).joinToString(", ")
