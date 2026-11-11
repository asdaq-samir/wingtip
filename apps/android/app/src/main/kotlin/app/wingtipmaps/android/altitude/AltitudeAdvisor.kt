package app.wingtipmaps.android.altitude

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.ui.LocalWingtipPalette
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The Altitude Advisor, how the cruise is chosen in the plan (the owner's
 * spec of 2026-11-10, after ForeFlight's): one stock ListItem per
 * altitude, highest first, with the route's time, fuel and head or tail
 * wind at it, **Fastest** and **Most economical** marked, the one flown
 * marked. The rows are the engine's (`altitude_advisor`, over the
 * planner's figures for each legal altitude by 14 CFR 91.159 or 91.179);
 * one outside the legal altitudes stays selectable with the engine's
 * warning (warn, never limit). The legal rows show first; All Altitudes
 * shows every row of the wheel. With no airplane the rows carry no time
 * or fuel (no airplane is assumed).
 */
@Composable
fun AltitudeAdvisor(rows: List<AltitudeEngine.Row>, onPick: (AltitudeEngine.Row) -> Unit, modifier: Modifier = Modifier) {
    var all by rememberSaveable { mutableStateOf(false) }
    val shown = if (all) rows else rows.filter { it.legal || it.flown }
    Column(modifier.testTag("altitude-advisor")) {
        Text(stringResource(R.string.altitude_advisor), style = MaterialTheme.typography.titleMedium)
        shown.forEach { row -> key(row.altitudeFt) { AdvisorRow(row, onPick) } }
        if (rows.size > shown.size || all) {
            TextButton(onClick = { all = !all }, modifier = Modifier.testTag("advisor-all")) {
                Text(stringResource(if (all) R.string.altitude_legal_only else R.string.altitude_all))
            }
        }
    }
}

@Composable
private fun AdvisorRow(row: AltitudeEngine.Row, onPick: (AltitudeEngine.Row) -> Unit) {
    val marks = listOfNotNull(
        stringResource(R.string.altitude_fastest).takeIf { row.fastest },
        stringResource(R.string.altitude_economical).takeIf { row.economical },
    ).joinToString(" · ")
    val figures = figures(row)
    val caution = LocalWingtipPalette.current.cautionInk
    val said = listOfNotNull(Spoken.altitude(row.altitudeFt), marks.ifEmpty { null }, spoken(row), row.warning).joinToString(", ")
    ListItem(
        selected = row.flown,
        onClick = { onPick(row) },
        overlineContent = if (marks.isEmpty()) null else ({ Text(marks, color = MaterialTheme.colorScheme.primary) }),
        supportingContent = if (figures.isEmpty() && row.warning == null) null else ({
            Column {
                if (figures.isNotEmpty()) Text(figures)
                row.warning?.let { Text(it, color = caution, style = MaterialTheme.typography.bodySmall) }
            }
        }),
        leadingContent = { RadioButton(selected = row.flown, onClick = null) },
        modifier = Modifier
            .testTag("advisor-row-${row.altitudeFt.roundToInt()}")
            .semantics { contentDescription = said },
    ) { Text(Format.cruiseAltitude(row.altitudeFt)) }
}

/** A row's figures as written: "1h 5m · 9.4 gal · 12 kt tail". */
internal fun figures(row: AltitudeEngine.Row): String = listOfNotNull(
    row.eteMin?.let(Format::duration),
    row.fuelGal?.let(Format::fuel),
    row.tailwindKt?.let { kt -> "${abs(kt).roundToInt()} kt ${if (kt >= 0) "tail" else "head"}" },
).joinToString(" · ")

private fun spoken(row: AltitudeEngine.Row): String? = listOfNotNull(
    row.eteMin?.let { Spoken.duration(it) },
    row.fuelGal?.let { Spoken.fuel(it) },
    row.tailwindKt?.let { kt -> "${Spoken.speed(abs(kt))} ${if (kt >= 0) "tailwind" else "headwind"}" },
).joinToString(", ").ifEmpty { null }
