package app.wingtipmaps.android.dryrun

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.RunSample
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.AnnounceOnce
import app.wingtipmaps.android.ui.FlightCategory
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.api.generated.ForecastRun as RunAnswer

/**
 * Forecast mode's strip at the foot of the dry run's controls: while the
 * forecast is fetched, that said; where it failed, why, in its place; and
 * then one segment per leg, as wide as its time, in its worst forecast
 * category's colour (FlightCategory's tokens) with the hour in Zulu and
 * the category written on it, so it is never told by colour alone; a mark
 * at the run's time; what the airplane meets there; and the alert it last
 * reached, in place, with its source, said once by TalkBack as it comes.
 */
@Composable
fun ForecastStrip(state: ForecastRun.State, t: Double, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        val answer = state.answer
        when {
            state.loading -> Text(stringResource(R.string.forecast_fetching), style = MaterialTheme.typography.bodySmall)
            state.problem != null -> ProblemLine(state.problem)
            answer != null -> Played(answer, t)
        }
    }
}

@Composable
private fun Played(answer: RunAnswer, t: Double) {
    if (answer.legs.isNotEmpty()) Legs(answer, t)
    Text(
        nowWords(ForecastPlay.sampleAt(answer, t)),
        style = MaterialTheme.typography.bodySmall,
    )
    val alert = ForecastPlay.alertAt(answer, t)
    if (alert != null) {
        val source = stringResource(R.string.forecast_source, alert.source)
        Column(Modifier.semantics(mergeDescendants = true) {}) {
            Text(alert.words, color = LocalWingtipPalette.current.cautionInk, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(source, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        }
        // Said once, as the airplane reaches it.
        AnnounceOnce(alert, "${alert.words} $source")
    }
    ForecastPlay.unavailableWords(answer.unavailable)?.let {
        Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
    }
}

/** The legs as segments, with the run's time marked across them. */
@Composable
private fun Legs(answer: RunAnswer, t: Double) {
    val mark = MaterialTheme.colorScheme.onSurface
    val at = ForecastPlay.fraction(answer, t)
    val said = stringResource(R.string.forecast_strip)
    Row(
        Modifier.fillMaxWidth().height(28.dp).clip(MaterialTheme.shapes.extraSmall)
            .semantics { contentDescription = said }
            .drawWithContent {
                drawContent()
                val x = size.width * at
                drawLine(mark, Offset(x, 0f), Offset(x, size.height), strokeWidth = 3.dp.toPx())
            },
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Hairline),
    ) {
        for (leg in answer.legs) {
            val category = leg.category
            val words = stringResource(R.string.forecast_leg, ForecastPlay.hourZ(leg.fromT), category ?: "—")
            Box(
                Modifier.weight(maxOf(1.0, leg.toT - leg.fromT).toFloat()).height(28.dp).clip(MaterialTheme.shapes.extraSmall)
                    .background(FlightCategory.chip(category))
                    .semantics { contentDescription = words },
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(words, color = Color.White, maxLines = 1, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = WingtipSpace.Xs))
            }
        }
    }
}

/** What the airplane meets now, in words: the category, the ceiling and
 *  visibility, the wind aloft, and whose forecast it is. */
@Composable
private fun nowWords(sample: RunSample?): String {
    val noForecast = stringResource(R.string.forecast_no_category)
    if (sample == null) return noForecast
    val ceiling = when {
        sample.ceilingUnknown -> stringResource(R.string.forecast_ceiling_unknown)
        sample.ceilingFt == null -> stringResource(R.string.forecast_no_ceiling)
        else -> stringResource(R.string.forecast_ceiling, Format.altitude(sample.ceilingFt))
    }
    val visibility = sample.visibilitySm?.let { stringResource(R.string.forecast_visibility, Format.visibility(it)) }
    // No wind speed is not calm: it is not known.
    val wind = sample.windSpeedKt?.let { kt ->
        val from = sample.windDirTrueDeg?.let { Format.heading(it) + " true" } ?: "variable"
        stringResource(R.string.forecast_wind, from, Format.speed(kt))
    } ?: stringResource(R.string.forecast_wind_unknown)
    val source = sample.source?.let { stringResource(R.string.forecast_source, it) }
    return listOfNotNull(sample.category ?: noForecast, ceiling, visibility, wind, source).joinToString(" · ")
}
