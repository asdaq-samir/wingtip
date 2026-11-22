package app.wingtipmaps.android.brief

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.FindingIcon
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.SectionTitle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The Brief's Adverse Conditions, under the findings (the web's
 * AdverseGroup, the owner's pick of option 2, 2026-11-21): a row for each
 * TFR the route goes through, SIGMET, urgent pilot report and G-AIRMET
 * met on the route, at most three in the engine's order, each with when
 * the flight meets it; "2 more on the route" where there are more.
 * Nothing drawn where there are none (the owner's "nothing empty").
 */
@Composable
fun AdverseGroup(adverse: EngineContract.GonogoAdverseRowsAnswer) {
    if (adverse.rows.isEmpty()) return
    SectionTitle(stringResource(R.string.wording_adverse_conditions))
    adverse.rows.forEach { row ->
        val finding = if (row.finding == "stop") Finding.STOP else Finding.CAUTION
        ListItem(
            leadingContent = { FindingIcon(finding) },
            supportingContent = { Text(whenWords(row)) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(row.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        )
    }
    if (adverse.more > 0) {
        Text(
            pluralStringResource(R.plurals.brief_adverse_more, adverse.more, adverse.more),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Where and when the flight meets it: the legs it is on (1-based, as
 *  the nav log numbers them), then when a TFR is in force, until when an
 *  advisory holds, when a pilot report was made, on the phone's clock with
 *  its zone ("14:40 CST"), as every time a pilot reads says whose it is. */
fun whenWords(row: EngineContract.GonogoAdverseRowsAnswerRowsItem, zone: ZoneId = ZoneId.systemDefault()): String {
    val first = row.legs.firstOrNull()?.roundToInt()
    val last = row.legs.lastOrNull()?.roundToInt()
    val legs = when {
        first == null || last == null -> null
        first == last -> "Leg ${first + 1}"
        else -> "Legs ${first + 1}–${last + 1}"
    }
    val at = row.time?.let { iso -> runCatching { Instant.parse(iso) }.getOrNull() }?.let { t ->
        val clock = "${Format.clock(t.toEpochMilli(), zone)} ${ZONE.withZone(zone).format(t)}"
        when (row.timeKind) {
            "at" -> "in force at $clock"
            "until" -> "until $clock"
            else -> "reported $clock"
        }
    }
    val said = listOfNotNull(legs, at).joinToString(" · ")
    return if (said.isEmpty()) "During the flight" else said.replaceFirstChar { it.uppercaseChar() }
}

private val ZONE = DateTimeFormatter.ofPattern("zzz", Locale.US)

/**
 * The flight's figures under the findings, as the web's Before You Go and
 * En Route rows give them: the fuel beyond the reserve (with an airplane
 * only, never a dash for one not picked), then the lowest ceiling forecast
 * along the route over the flight, the lowest visibility and the strongest
 * headwind on any leg, with the time en route at the row's end. "None" for
 * the ceiling only where the forecast was read and gave none; with no
 * forecast, a dash, as the visibility.
 */
@Composable
fun FlightFigures(glance: BriefGlance) {
    glance.beyondReserveGal?.let { gal ->
        FigureRow(stringResource(R.string.wording_before_you_go), null) {
            Figure(stringResource(R.string.wording_beyond_reserve), Format.fuel(gal), stop = gal < 0)
        }
    }
    val ceiling = when {
        glance.ceilingFt != null -> Format.altitude(glance.ceilingFt)
        glance.visibilitySm != null -> stringResource(R.string.brief_none)
        else -> Format.NONE
    }
    val headwind = glance.headwindKt?.roundToInt()?.let { if (it > 0) "$it kt" else stringResource(R.string.brief_none) } ?: Format.NONE
    FigureRow(stringResource(R.string.wording_en_route), glance.eteMin?.let(Format::duration)) {
        Figure(stringResource(R.string.wording_lowest_ceiling), ceiling)
        Figure(stringResource(R.string.wording_visibility), glance.visibilitySm?.let(Format::visibility) ?: Format.NONE)
        Figure(stringResource(R.string.wording_most_headwind), headwind)
    }
}

/** A part of the flight: its name, a time at its end, its figures across. */
@Composable
private fun FigureRow(title: String, end: String?, figures: @Composable () -> Unit) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        trailingContent = end?.let { { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
        supportingContent = { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Lg)) { figures() } },
        content = { Text(title, style = MaterialTheme.typography.titleMedium) },
    )
}

/** One figure: its name over it, in the error ink where it says stop. */
@Composable
private fun Figure(label: String, value: String, stop: Boolean = false) {
    Column(Modifier.clearAndSetSemantics { contentDescription = "$label, $value" }) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, style = MaterialTheme.typography.titleMedium, color = if (stop) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}

/**
 * What a pilot should know before going, at the findings' end as one
 * caution each (the web's CautionRow and the glance's border lines): what
 * the briefing could not check (aviationweather.gov not answering), and
 * the route through an ADIZ (14 CFR part 99) or out of the United States
 * (decision 0053), in the engine's words. The plan is still made: warn,
 * never limit.
 */
@Composable
fun CautionRows(glance: BriefGlance) {
    val lines = listOfNotNull(
        glance.unchecked.takeIf { it.isNotEmpty() }?.let { stringResource(R.string.brief_unchecked, it.joinToString(", ")) },
        glance.adiz,
        glance.outside,
    )
    val ink = LocalInk.current.words(Finding.CAUTION, MaterialTheme.colorScheme.onSurfaceVariant)
    lines.forEach { line ->
        ListItem(
            leadingContent = { FindingIcon(Finding.CAUTION) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(line, color = ink) },
        )
    }
}
