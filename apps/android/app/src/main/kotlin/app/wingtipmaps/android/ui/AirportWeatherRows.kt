package app.wingtipmaps.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.map.AirportWeatherMode
import app.wingtipmaps.android.map.AirportWeatherStore

/**
 * Settings' Airport Weather, in its Map group (the owner, 2026-11-13):
 * one menu of four, Off first, as the web's AirportWeatherRow -- a row of
 * the group with its pick at the end and the stock menu under it
 * (MenuSettingRow), where it was a choice of four and three switches.
 */
@Composable
fun AirportWeatherRow(index: Int, count: Int) {
    val context = LocalContext.current
    val store = remember(context) { AirportWeatherStore.of(context) }
    val settings by store.settings.collectAsStateWithLifecycle()
    val labels = linkedMapOf(
        AirportWeatherMode.OFF to stringResource(R.string.airport_weather_off),
        AirportWeatherMode.CATEGORY to stringResource(R.string.airport_weather_category),
        AirportWeatherMode.WIND to stringResource(R.string.airport_weather_wind),
        AirportWeatherMode.STATION to stringResource(R.string.airport_weather_station),
    )
    MenuSettingRow(
        stringResource(R.string.airport_weather),
        labels.getValue(settings.mode),
        labels.map { (mode, label) -> label to { store.pick(mode).let { } } },
        index = index,
        count = count,
    )
}
