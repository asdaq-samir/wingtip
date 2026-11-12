package app.wingtipmaps.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.generated.WindsPeriod
import app.wingtipmaps.android.format.Format

/**
 * When the plan was made and the winds aloft it flies, as paper says them
 * and the web's nav log and Brief do (plannedWords): "Planned 1712Z · AWC
 * winds, 12Z · for use 1400–2100Z". Whose winds is the planner's own name
 * for them (WindsPeriod.label: AWC's the map draws, or NOAA's GFS in their
 * place); with none, the GFS's run and forecast hour, said as modelled.
 * The "for use" period is the forecast's (FAA Order JO 7110.10, TBL
 * 9-3-1, for the FB stations; the grid's hours round the departure for
 * AWC's), as the planner sends it. Nothing where the totals do not say
 * when they were planned.
 */
@Composable
fun PlannedLine(totals: NavLogTotals?, modifier: Modifier = Modifier) {
    val at = totals?.plannedAt ?: return
    val planned = stringResource(R.string.planned_at, zulu(at) ?: return)
    val winds = totals.winds
    val forUse = winds?.let { forUse(it) }
    val words = when {
        winds == null || forUse == null -> planned
        winds.label != null -> "$planned · ${winds.label} · $forUse"
        else -> "$planned · ${modelled(winds)} $forUse"
    }
    Text(words, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}

/** With no name from the planner: "modelled winds (GFS 12Z +6 h)" for
 *  the GFS's, else "winds". */
@Composable
private fun modelled(winds: WindsPeriod): String {
    if (winds.modelled != true) return stringResource(R.string.planned_winds)
    val run = winds.run?.let(::zulu)?.let { " ${it.take(2)}Z" + (winds.forecastHour?.let { h -> " +$h h" } ?: "") }.orEmpty()
    return stringResource(R.string.planned_winds_modelled, run)
}

/** "for use 1400–2100Z", the start's Z left off as the web writes it. */
@Composable
private fun forUse(winds: WindsPeriod): String? {
    val from = zulu(winds.useFrom) ?: return null
    val to = zulu(winds.useTo) ?: return null
    return stringResource(R.string.planned_for_use, from.removeSuffix("Z"), to)
}

/** An ISO instant as "1712Z", or null where it is not one. */
private fun zulu(iso: String): String? = runCatching { Format.zulu(iso) }.getOrNull()
