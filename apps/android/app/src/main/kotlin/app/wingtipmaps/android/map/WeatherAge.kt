package app.wingtipmaps.android.map

import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.ui.LocalWingtipPalette

/**
 * How old the airport weather marks on the map are (the offline audit's
 * gap 7: they were kept with no signal and never said how old). A field's
 * mark is stale once its METAR was heard longer ago than the engine's
 * freshness for a METAR (kept_age's "weather": the routine report's
 * hour, AIM 7-1-28); a stale mark is greyed (AirportWeatherMarks.STALE)
 * and the map says the age of the newest of them.
 */
object WeatherAge {
    /** The engine's freshness for a METAR, minutes; null where it could not say. */
    fun freshMin(nowMs: Long): Double? = KeptForAir.age(KeptForAir.WEATHER, nowMs, nowMs)?.freshMin

    /** The fields whose weather was heard longer ago than `freshMin`;
     *  none where the freshness is not known. */
    fun stale(heardAtMs: Map<String, Long>, nowMs: Long, freshMin: Double?): Set<String> {
        val fresh = freshMin ?: return emptySet()
        return heardAtMs.filterValues { nowMs - it > fresh * MINUTE_MS }.keys
    }

    private const val MINUTE_MS = 60_000L
}

/** The age of the stale marks, at the top of the map beside the receiver's
 *  chip, in the caution's colour: "Airport weather: Fetched 1 h 12 min
 *  ago", the engine's words for the newest stale one. Nothing while none is. */
@Composable
fun WeatherAgeChip(stale: Set<String>, heardAtMs: Map<String, Long>, nowMs: Long, modifier: Modifier = Modifier) {
    val newest = stale.mapNotNull { heardAtMs[it] }.maxOrNull() ?: return
    val line = KeptForAir.age(KeptForAir.WEATHER, newest, nowMs)?.line ?: return
    Badge(
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = LocalWingtipPalette.current.caution,
        modifier = modifier.testTag("weather-age"),
    ) {
        Text(stringResource(R.string.weather_marks_age, line))
    }
}
