package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.GlideRingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.SpokenAlerts
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.ModelWeatherRow
import app.wingtipmaps.android.map.TerrainRow
import app.wingtipmaps.android.map.WeatherLoopRows
import app.wingtipmaps.android.plates.PlateCardModel
import app.wingtipmaps.android.receiver.ReceiverSettingRows

/**
 * The Map Settings card (the card rule, the owner, 2026-11-10: the map's
 * settings are a thing with one card, as the web's and the iPhone's map
 * settings are): what the map draws and the traffic over it, opened from
 * Settings' Map Settings row or "map" and "layers" typed in the search --
 * the radar and satellite loop and its speed, the chart's layers and the
 * traffic, Airport Weather, the glide ring, a receiver on the cockpit's Wi-Fi, and spoken
 * alerts.
 */
@Composable
fun MapSettingsRows() {
    val context = LocalContext.current
    // The plan the root holds (the activity's one Plan), for the glide
    // ring's airplane.
    val plan: Plan = viewModel()
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) {
        // The radar and satellite loop and its speed (map/WeatherLoop).
        WeatherLoopRows()
        // The model weather's field (map/flow), with the loop as weather.
        ModelWeatherRow()
        // What the map draws and the traffic over it, one group.
        MapLayerRows()
        // The ground: Off, Relief or 3D (Map3dLayer).
        TerrainRow()
        // Each reporting field's weather: halo, dot or station model.
        AirportWeatherRows()
        // Off unless kept on; on by itself in an emergency (GlideRing).
        GlideRingRow(plan)
        // A Stratux, Sentry or the like on the cockpit's Wi-Fi: its traffic
        // and FIS-B weather with no internet.
        ReceiverSettingRows()
        val spoken = remember(context) { SpokenAlerts.of(context) }
        val spokenOn by spoken.on.collectAsStateWithLifecycle()
        SwitchSettingRow(stringResource(R.string.speak_alerts), spokenOn, index = 0, count = 1, onChange = spoken::setOn)
    }
}

/**
 * What the map draws over the chart (MapLayersStore, kept across
 * launches), the web's map settings' "On the Map" rows in its words and
 * order: Airspace, VORs and Fixes, Terminal Area Charts, Private Fields,
 * Military Fields, then Traffic and Approach Plates.
 */
@Composable
private fun MapLayerRows() {
    val context = LocalContext.current
    val store = remember(context) { MapLayersStore.of(context) }
    val layers by store.layers.collectAsStateWithLifecycle()
    val traffic = remember(context) { Traffic.of(context) }
    val trafficOn by traffic.on.collectAsStateWithLifecycle()
    SettingsGroup {
        SwitchSettingRow(stringResource(R.string.layer_airspace), layers.airspace, 0, MAP_ROWS) { store.set(MapLayersStore.Switch.AIRSPACE, it) }
        SwitchSettingRow(stringResource(R.string.layer_navaids), layers.navaids, 1, MAP_ROWS) { store.set(MapLayersStore.Switch.NAVAIDS, it) }
        SwitchSettingRow(stringResource(R.string.layer_tac), layers.tac, 2, MAP_ROWS) { store.set(MapLayersStore.Switch.TAC, it) }
        SwitchSettingRow(stringResource(R.string.layer_private), layers.privateFields, 3, MAP_ROWS) { store.set(MapLayersStore.Switch.PRIVATE_FIELDS, it) }
        SwitchSettingRow(stringResource(R.string.layer_military), layers.military, 4, MAP_ROWS) { store.set(MapLayersStore.Switch.MILITARY, it) }
        SwitchSettingRow(stringResource(R.string.traffic), trafficOn, 5, MAP_ROWS) { traffic.setOn(it) }
        // The approach plates on the chart (the web's Plates); turned on,
        // every plate hidden from its card comes back.
        val plates = remember(context) { PlateCardModel.of(context) }
        val look by plates.look.collectAsStateWithLifecycle()
        SwitchSettingRow(stringResource(R.string.layer_plates), look.shown, 6, MAP_ROWS, plates::setShown)
    }
}

/** The map's group: its five layers, the traffic and the approach plates. */
private const val MAP_ROWS = 7
