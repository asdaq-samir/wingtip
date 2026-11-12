package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Badge
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.AirportServices
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.fuelNames
import app.wingtipmaps.android.engine.generated.gonogoRunwayInUse
import java.util.Locale

/**
 * Which of a field's runways carry the Runways tab's badges: Longest, the
 * longest open runway, what a pilot sizes a field by, where the field has
 * more than one (the owner, 2026-11-11: "just put a longest badge on the
 * runway in runway tab"); and Best Wind, the runway most nearly into the
 * reported wind (AC 90-66C 11.5, the engine's gonogo_runway_in_use over
 * each runway's wind on the end it favours), only where the wind chose
 * it, not a calm field's most used ("best wind runways should get the
 * best wind badge"). A runway closed by a NOTAM in force counts as closed,
 * as by the FAA's data, so neither badge sits beside a red Closed (KORD's
 * 04L/22R, "CLSD EXC TAX", 2026-11-11). -1 for none.
 */
data class RunwayBadges(val longest: Int, val bestWind: Int) {
    companion object {
        fun of(place: AirportPlace, marks: NotamMarks): RunwayBadges {
            val closed = place.runways.mapIndexed { i, r -> r.closed || marks.runway[i]?.unusable == true }
            val open = place.runways.indices.filter { !closed[it] && place.runways[it].lengthFt != null }
            val longest = if (open.size > 1) open.maxBy { place.runways[it].lengthFt ?: 0 } else -1
            val asked = place.runways.mapIndexed { i, r ->
                EngineContract.Runway(
                    closed = closed[i], surface = r.surface, lengthFt = r.lengthFt?.toDouble(),
                    runwayEnds = r.runwayEnds?.map { EngineContract.RunwayRunwayEndsItem(it.ident, it.headingTrueDeg) },
                    wind = r.wind?.let { EngineContract.GonogoRunwayWind(it.end, it.headwindKt, it.crosswindKt, it.gustCrosswindKt, it.inUse) },
                )
            }
            val inUse = if (asked.isEmpty()) null else Engine.gonogoRunwayInUse(asked).getOrNull()
            return RunwayBadges(longest, inUse?.takeIf { it.byWind }?.runway ?: -1)
        }
    }
}

/**
 * The Runways tab's rows: each runway, "Runway 18/36" with its Best Wind,
 * Longest and NOTAM badges by its name, its size, surface and lights
 * under it; a runway a NOTAM addresses opens that NOTAM on a tap (the
 * owner, 2026-11-11: "tapping the affected thing should show the notam").
 */
fun LazyListScope.runwayRows(place: AirportPlace, marks: NotamMarks, badges: RunwayBadges, onNotam: (NotamMark) -> Unit, pad: Modifier) {
    itemsIndexed(place.runways, key = { i, r -> "runway-$i-${r.ends}" }) { i, r ->
        val closed = stringResource(R.string.runway_closed)
        val lighted = stringResource(R.string.runway_lighted)
        val size = listOfNotNull(r.lengthFt, r.widthFt).joinToString(" × ") { String.format(Locale.US, "%,d", it) }.ifEmpty { null }?.let { "$it ft" }
        val line = listOfNotNull(size, r.surface?.lowercase(), lighted.takeIf { r.lighted }, closed.takeIf { r.closed }).joinToString(" · ")
        val mark = marks.runway[i]
        PlaceRow(
            headline = {
                Titled(stringResource(R.string.runway_name, r.ends ?: "—")) {
                    if (i == badges.bestWind) Plain(stringResource(R.string.runway_best_wind))
                    if (i == badges.longest) Plain(stringResource(R.string.runway_longest))
                    mark?.let { NotamBadge(it) }
                }
            },
            supporting = line,
            modifier = pad,
            onClick = mark?.let { { onNotam(it) } },
        )
    }
}

/**
 * The field's lights, after its runways: each system its Chart Supplement
 * remarks name, read by the engine (the planner's lighting_read) -- its
 * name with its legend code ("Approach lights (MALSR)"), the runways it
 * serves, and how it is turned on in a pilot's words -- then what the
 * engine could not read, in its words; the standard keying where it
 * applies (AIM 2-1-8), and the remarks as written, folded. A light a
 * NOTAM addresses has its badge by its name, and a tap opens that NOTAM.
 */
fun LazyListScope.lightRows(place: AirportPlace, marks: NotamMarks, onNotam: (NotamMark) -> Unit, pad: Modifier) {
    if (place.lighting.isNullOrEmpty()) return
    item(key = "lights-title") { SectionTitle(stringResource(R.string.section_lights), pad) }
    itemsIndexed(place.lights.orEmpty(), key = { i, l -> "light-$i-${l.name}" }) { i, light ->
        val name = light.code?.let { stringResource(R.string.light_with_code, light.name, it) } ?: light.name
        val runways = when (light.runways.size) {
            0 -> null
            1 -> stringResource(R.string.light_runway, light.runways.first())
            else -> stringResource(R.string.light_runways, light.runways.joinToString(", "))
        }
        val serves = listOfNotNull(runways, stringResource(R.string.light_nonstandard).takeIf { light.nonstandard }).joinToString(" · ").ifEmpty { null }
        val mark = marks.light[i]
        PlaceRow(
            headline = { Titled(name) { mark?.let { NotamBadge(it) } } },
            supportingContent = if (serves == null && light.how == null) null else ({
                Column {
                    serves?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    light.how?.let { Text(it) }
                }
            }),
            modifier = pad,
            onClick = mark?.let { { onNotam(it) } },
        )
    }
    place.lightNotes.orEmpty().forEachIndexed { i, note -> item(key = "light-note-$i") { PlaceRow(headline = { Text(note.words) }, modifier = pad) } }
    if (place.standardKeying == true) {
        item(key = "light-keying") {
            PlaceRow(headline = { Text(stringResource(R.string.light_keying)) }, trailing = { Text(stringResource(R.string.light_keying_clicks)) }, modifier = pad)
        }
    }
    item(key = "lights-sent") { Fold(stringResource(R.string.as_written)) { AsSent(place.lighting.orEmpty().joinToString("\n"), pad) } }
}

/**
 * The field's fuel, from its Chart Supplement entry (the planner's
 * services): the grades by their names (the engine's fuel_names), its
 * badge where a NOTAM in force addresses it; the remarks in words (the
 * engine's remarks_read: self-serve, its hours, the FBO's) on a row of
 * their own; and as written, folded (the owner, 2026-11-11: "fuel remarks
 * and as written can be separate from fuel").
 */
fun LazyListScope.fuelRows(services: AirportServices?, mark: NotamMark?, onNotam: (NotamMark) -> Unit, pad: Modifier) {
    if (services == null) return
    item(key = "fuel") {
        val types = services.fuelTypes.orEmpty()
        val none = stringResource(R.string.fuel_none_listed)
        val names = remember(types) { if (types.isEmpty()) null else Engine.fuelNames(types).getOrNull() }
        PlaceRow(
            headline = { Titled(stringResource(R.string.fuel)) { mark?.let { NotamBadge(it) } } },
            trailing = { Text(names ?: types.joinToString(", ").ifEmpty { none }, fontWeight = FontWeight.SemiBold) },
            modifier = pad,
            onClick = mark?.let { { onNotam(it) } },
        )
    }
    val notes = services.fuelNotes.orEmpty()
    if (notes.isNotEmpty()) {
        item(key = "fuel-notes") {
            PlaceRow(
                headline = { Text(stringResource(R.string.fuel_remarks)) },
                supportingContent = { Column { notes.forEach { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } } },
                modifier = pad,
            )
        }
    }
    val remarks = services.fuelRemarks.orEmpty()
    if (remarks.isNotEmpty()) item(key = "fuel-sent") { Fold(stringResource(R.string.as_written)) { AsSent(remarks.joinToString("\n"), pad) } }
}

/** A row's name with its badges after it, wrapping under it where the
 *  line is full. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Titled(name: String, badges: @Composable () -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), itemVerticalAlignment = Alignment.CenterVertically) {
        Text(name, style = MaterialTheme.typography.bodyLarge)
        badges()
    }
}

/** A badge that only says something (Best Wind, Longest): Material's
 *  Badge in the secondary container. */
@Composable
private fun Plain(word: String) {
    Badge(containerColor = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer) { Text(word) }
}

/** A row of the card: Material's list item, clickable where it opens
 *  something, its supporting text under it. */
@Composable
internal fun PlaceRow(
    headline: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    supportingContent: (@Composable () -> Unit)? = supporting?.takeIf { it.isNotEmpty() }?.let { s -> { Text(s, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    if (onClick != null) {
        ListItem(onClick = onClick, supportingContent = supportingContent, trailingContent = trailing, colors = colors, modifier = modifier.fillMaxWidth(), content = headline)
    } else {
        ListItem(supportingContent = supportingContent, trailingContent = trailing, colors = colors, modifier = modifier.fillMaxWidth(), content = headline)
    }
}
