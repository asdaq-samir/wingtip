package app.wingtipmaps.android.map

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.map.flow.FlowKind
import app.wingtipmaps.android.map.flow.ModelWeather
import app.wingtipmaps.android.ui.MenuSettingRow
import app.wingtipmaps.android.ui.SettingsGroup

/**
 * Map Settings' Weather: Model Weather, a menu of its fields with Off
 * first (the web's FlowSettingsRow), in the order the web's menu lists
 * them; ModelWeatherLayer and ModelWeatherBar draw what is picked.
 */
@Composable
fun ModelWeatherRow() {
    val context = LocalContext.current
    val model = remember(context) { ModelWeather.of(context) }
    val state by model.state.collectAsStateWithLifecycle()
    val off = stringResource(R.string.model_weather_off)
    val choices = listOf<Pair<String, () -> Unit>>(off to { model.pick(null) }) +
        FlowKind.entries.map { kind -> stringResource(kind.label) to { model.pick(kind) } }
    SettingsGroup {
        MenuSettingRow(stringResource(R.string.model_weather), state.field?.let { stringResource(it.label) } ?: off, choices, index = 0, count = 1)
    }
}
