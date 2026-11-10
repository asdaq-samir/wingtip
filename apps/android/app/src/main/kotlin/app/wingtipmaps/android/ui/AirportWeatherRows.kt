package app.wingtipmaps.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.map.AirportWeatherMode
import app.wingtipmaps.android.map.AirportWeatherStore

/**
 * How the map shows each reporting field's weather (AirportWeatherStore),
 * with the map's other settings as the web's Map card has it: Off, Halo,
 * Dot or Station as a segmented control (decision 0017, ChoiceGroup), and
 * under it the three switches, each on until turned off; the switches
 * only while the weather is drawn at all.
 */
@Composable
fun AirportWeatherRows() {
    val context = LocalContext.current
    val store = remember(context) { AirportWeatherStore.of(context) }
    val settings by store.settings.collectAsStateWithLifecycle()
    Text(stringResource(R.string.airport_weather), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
    ChoiceGroup(
        listOf(
            AirportWeatherMode.OFF to stringResource(R.string.airport_weather_off),
            AirportWeatherMode.HALO to stringResource(R.string.airport_weather_halo),
            AirportWeatherMode.DOT to stringResource(R.string.airport_weather_dot),
            AirportWeatherMode.STATION to stringResource(R.string.airport_weather_station),
        ),
        selected = settings.mode,
        onPick = { store.pick(it) },
    )
    if (settings.mode == AirportWeatherMode.OFF) return
    SettingsGroup {
        SwitchSettingRow(stringResource(R.string.airport_weather_station_close), settings.stationClose, 0, 3) {
            store.set(AirportWeatherStore.Switch.STATION_CLOSE, it)
        }
        SwitchSettingRow(stringResource(R.string.airport_weather_wind_arrows), settings.windArrows, 1, 3) {
            store.set(AirportWeatherStore.Switch.WIND_ARROWS, it)
        }
        SwitchSettingRow(stringResource(R.string.airport_weather_worse), settings.worse, 2, 3) {
            store.set(AirportWeatherStore.Switch.WORSE, it)
        }
    }
}
