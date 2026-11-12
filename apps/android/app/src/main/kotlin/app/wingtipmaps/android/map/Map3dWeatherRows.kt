package app.wingtipmaps.android.map

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.map.flow.FlowKind
import app.wingtipmaps.android.map.flow.ModelWeather
import app.wingtipmaps.android.ui.MenuSettingRow
import app.wingtipmaps.android.ui.SettingsGroup

/**
 * Map Settings' Terrain (the web's Map menu's Terrain): Off, Relief or 3D,
 * a choice group -- Material's single-choice segmented button, as a
 * discrete setting is here, not a slider -- in a row of its own group
 * (Map3dLayer draws what is picked).
 */
@Composable
fun TerrainRow() {
    val context = LocalContext.current
    val terrain = remember(context) { MapTerrain.of(context) }
    val mode by terrain.mode.collectAsStateWithLifecycle()
    val labels = mapOf(TerrainMode.OFF to R.string.terrain_off, TerrainMode.RELIEF to R.string.terrain_relief, TerrainMode.THREE_D to R.string.terrain_3d)
    SettingsGroup {
        SegmentedListItem(
            shapes = ListItemDefaults.segmentedShapes(index = 0, count = 1),
            modifier = Modifier.fillMaxWidth(),
            supportingContent = {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = WingtipSpace.Sm)) {
                    TerrainMode.entries.forEachIndexed { i, m ->
                        SegmentedButton(
                            selected = mode == m,
                            onClick = { terrain.pick(m) },
                            shape = SegmentedButtonDefaults.itemShape(index = i, count = TerrainMode.entries.size),
                        ) { Text(stringResource(labels.getValue(m))) }
                    }
                }
            },
            content = { Text(stringResource(R.string.terrain)) },
        )
    }
}

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
