package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Adjust
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.FilledIconToggleButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.WeatherMoreButton
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/** The test tags the Map card's UI tests find its parts by. */
object MapCardTags {
    const val GEAR = "map-card-settings"
    const val TILE = "layer-tile-"
}

/**
 * The Map card, the map's Layers button opens (the owner's three homes,
 * 2026-11-13; Google Maps' own Layers sheet, its "Map details" tiles):
 * what is on the map, and nothing else, as the web's Map card since
 * 2026-11-14 -- the chart (None or the sectional, MapChartRows) with the
 * terminal charts' switch under it, in 3D its Heights, the four layers as
 * tiles in one row, each a glyph over its name filled in the tint while
 * on (Weather's ••• the menu of which weather), and the app's Look (Theme
 * and Appearance, moved here from Settings). The public fields, the
 * route and its points, own ship and the TFRs have no switch: always
 * drawn. A gear in the card's bar, Material's place for its own actions,
 * opens Settings at its Map group (SettingsAt), its ← back to this card.
 * 3D is the round map button (ThreeDButton).
 */
@Composable
fun MapCard(exit: CardExit, open: (SheetPage) -> Unit) {
    CardPage(
        title = stringResource(R.string.map_card),
        exit = exit,
        actions = {
            IconButton(
                onClick = {
                    SettingsAt.map = true
                    open(SheetPage.Settings)
                },
                modifier = Modifier.testTag(MapCardTags.GEAR),
            ) { Icon(WingtipIcons.setup, contentDescription = stringResource(R.string.settings)) }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
        ) {
            MapChartRows()
            SectionTitle(stringResource(R.string.map_layers))
            LayerTiles()
            // The app's look: one home, here (the owner, 2026-11-14); the
            // first flight's welcome keeps its own copy of the two rows.
            SectionTitle(stringResource(R.string.settings_look))
            SettingsGroup {
                ThemeRow(index = 0, count = 2)
                AppearanceRow(index = 1, count = 2)
            }
        }
    }
}

/** One layer's tile: its name, glyph, whether it is on, and its switch. */
private class Layer(val key: String, val name: String, val icon: ImageVector, val on: Boolean, val set: (Boolean) -> Unit)

/**
 * The four layers (the owner, 2026-11-14: "can we just have four layers
 * aeronautical, weather, traffic, private/military in the map
 * settings?"), the row exactly four tiles: Aeronautical (the airspace,
 * special use areas, VORs, fixes and VFR waypoints), Weather (the
 * fields' weather marks as Settings' Airport Weather says, and what its
 * ••• picks), Traffic, and Private/Military (drawn whatever it says while
 * the emergency assistant is open). Kept across launches
 * (MapLayersStore, TrafficSwitch).
 */
@Composable
private fun LayerTiles(flight: FlightModel = hiltViewModel()) {
    val context = LocalContext.current
    val store = remember(context) { MapLayersStore.of(context) }
    val layers by store.layers.collectAsStateWithLifecycle()
    val traffic = flight.traffic
    val trafficOn by traffic.on.collectAsStateWithLifecycle()
    val tiles = listOf(
        Layer("aeronautical", stringResource(R.string.layer_aeronautical), Icons.Filled.Adjust, layers.aeronautical) { store.set(MapLayersStore.Switch.AERONAUTICAL, it) },
        Layer("weather", stringResource(R.string.layer_weather), Icons.Filled.Cloud, layers.weather) { store.set(MapLayersStore.Switch.WEATHER, it) },
        Layer("traffic", stringResource(R.string.traffic), Icons.Filled.Flight, trafficOn) { traffic.setOn(it) },
        Layer("private-military", stringResource(R.string.layer_private_military), Icons.Filled.Shield, layers.privateMilitary) { store.set(MapLayersStore.Switch.PRIVATE_MILITARY, it) },
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        tiles.forEach { LayerTile(it, Modifier.weight(1f)) }
    }
}

/** A layer as Google Maps' Layers sheet draws one: the stock filled icon
 *  toggle, filled in the tint while on, its name under it. TalkBack reads
 *  the toggle by the name and says whether it is on. Weather's carries
 *  its ••• at the toggle's top end, the web's corner menu. */
@Composable
private fun LayerTile(layer: Layer, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box {
            FilledIconToggleButton(
                checked = layer.on,
                onCheckedChange = layer.set,
                shapes = IconButtonDefaults.toggleableShapes(),
                modifier = Modifier.size(WingtipSize.TapTarget + WingtipSpace.Md).testTag(MapCardTags.TILE + layer.key).semantics { contentDescription = layer.name },
            ) { Icon(layer.icon, contentDescription = null) }
            if (layer.key == "weather") {
                WeatherMoreButton(Modifier.align(Alignment.TopEnd).offset(x = WingtipSpace.Lg, y = -WingtipSpace.Md))
            }
        }
        Text(
            layer.name, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, maxLines = 2,
            modifier = Modifier.padding(top = WingtipSpace.Xs).clearAndSetSemantics {},
        )
    }
}
