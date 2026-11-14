package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.MapTerrain
import app.wingtipmaps.android.map.TerrainMode

/** The test tags of the chart's and Heights' segments. */
object MapChartTags {
    const val CHART = "map-chart-"
    const val HEIGHTS = "map-heights-"
}

/**
 * The Map card's chart and, in 3D, its Heights, each Material's
 * segmented button, as a setting of a few is (decision 0017):
 *
 * - Chart: None or the sectional (the owner, 2026-11-14: "chart should
 *   also have none option"), None drawing no FAA chart, only a plain
 *   ground in the look's colours with every vector layer over it
 *   (ChartGround). The phone draws one FAA chart, so the sectional is the
 *   other choice. With a chart, the terminal area charts' switch under it
 *   (the web's, where it moved from the layers).
 * - Heights: ×1, ×3 or ×5 (the owner, 2026-11-14, "In 3d, can you clearly
 *   see the upside-down birthday cake for Class B airspace?"; ×3 unless
 *   picked), how many times the 3D view stands the airspace volumes up
 *   (MapTerrain.stretch, Map3dLayer). The phone has no pilot's view or
 *   replay camera in 3D to draw at true height.
 */
@Composable
fun MapChartRows() {
    val context = LocalContext.current
    val store = remember(context) { MapLayersStore.of(context) }
    val layers by store.layers.collectAsStateWithLifecycle()
    SectionTitle(stringResource(R.string.map_chart))
    val charts = listOf(false to stringResource(R.string.chart_none), true to stringResource(R.string.chart_sectional))
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        charts.forEachIndexed { i, (chart, name) ->
            SegmentedButton(
                selected = layers.chart == chart,
                onClick = { store.set(MapLayersStore.Switch.CHART, chart) },
                shape = SegmentedButtonDefaults.itemShape(i, charts.size),
                modifier = Modifier.testTag(MapChartTags.CHART + if (chart) "sectional" else "none"),
            ) { Text(name) }
        }
    }
    if (layers.chart) {
        SettingsGroup {
            SwitchSettingRow(stringResource(R.string.layer_tac), layers.tac, index = 0, count = 1) { store.set(MapLayersStore.Switch.TAC, it) }
        }
    }
    val terrain = remember(context) { MapTerrain.of(context) }
    val mode by terrain.mode.collectAsStateWithLifecycle()
    if (mode != TerrainMode.THREE_D) return
    val stretch by terrain.stretch.collectAsStateWithLifecycle()
    SectionTitle(stringResource(R.string.map_heights))
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        MapTerrain.STRETCHES.forEachIndexed { i, times ->
            SegmentedButton(
                selected = stretch == times,
                onClick = { terrain.setStretch(times) },
                shape = SegmentedButtonDefaults.itemShape(i, MapTerrain.STRETCHES.size),
                modifier = Modifier.testTag(MapChartTags.HEIGHTS + times),
            ) { Text(stringResource(R.string.map_heights_times, times)) }
        }
    }
}
