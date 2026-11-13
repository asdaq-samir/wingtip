package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Adjust
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Hexagon
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
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
import app.wingtipmaps.android.map.ModelWeatherRow
import app.wingtipmaps.android.map.WeatherLoopRows
import app.wingtipmaps.android.plates.PlateCardModel
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
 * what is on the map, and nothing else -- the layers as tiles three to a
 * row, each a glyph over its name, filled in the tint while on, then the
 * radar and satellite loop and the model weather. A gear in the card's
 * bar, Material's place for its own actions, opens Settings at its Map
 * group (SettingsAt), its ← back to this card. There is no Map Settings
 * page any more; 3D is the round map button (ThreeDButton).
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
            SectionTitle(stringResource(R.string.map_layers))
            LayerTiles()
            // The radar and satellite loop and its speed (map/WeatherLoop),
            // and the model weather's field (map/flow).
            WeatherLoopRows()
            ModelWeatherRow()
        }
    }
}

/** One layer's tile: its name, glyph, whether it is on, and its switch. */
private class Layer(val key: String, val name: String, val icon: ImageVector, val on: Boolean, val set: (Boolean) -> Unit)

/**
 * What the map draws over the chart (MapLayersStore, kept across
 * launches), in the web's words and order: Airspace, VORs and Fixes,
 * Terminal Area Charts, Private Fields, Military Fields, then Traffic
 * and Approach Plates.
 */
@Composable
private fun LayerTiles(flight: FlightModel = hiltViewModel()) {
    val context = LocalContext.current
    val store = remember(context) { MapLayersStore.of(context) }
    val layers by store.layers.collectAsStateWithLifecycle()
    val traffic = flight.traffic
    val trafficOn by traffic.on.collectAsStateWithLifecycle()
    // The approach plates on the chart (the web's Plates); turned on,
    // every plate hidden from its card comes back.
    val plates = remember(context) { PlateCardModel.of(context) }
    val look by plates.look.collectAsStateWithLifecycle()
    val tiles = listOf(
        Layer("airspace", stringResource(R.string.layer_airspace), Icons.Filled.Adjust, layers.airspace) { store.set(MapLayersStore.Switch.AIRSPACE, it) },
        Layer("navaids", stringResource(R.string.layer_navaids), Icons.Filled.Hexagon, layers.navaids) { store.set(MapLayersStore.Switch.NAVAIDS, it) },
        Layer("tac", stringResource(R.string.layer_tac), Icons.Filled.Map, layers.tac) { store.set(MapLayersStore.Switch.TAC, it) },
        Layer("private", stringResource(R.string.layer_private), Icons.Filled.Lock, layers.privateFields) { store.set(MapLayersStore.Switch.PRIVATE_FIELDS, it) },
        Layer("military", stringResource(R.string.layer_military), Icons.Filled.Shield, layers.military) { store.set(MapLayersStore.Switch.MILITARY, it) },
        Layer("traffic", stringResource(R.string.traffic), Icons.Filled.Flight, trafficOn) { traffic.setOn(it) },
        Layer("plates", stringResource(R.string.layer_plates), Icons.Filled.Description, look.shown) { plates.setShown(it) },
    )
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        tiles.chunked(TILES_A_ROW).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                row.forEach { LayerTile(it, Modifier.weight(1f)) }
                repeat(TILES_A_ROW - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** A layer as Google Maps' Layers sheet draws one: the stock filled icon
 *  toggle, filled in the tint while on, its name under it. TalkBack reads
 *  the toggle by the name and says whether it is on. */
@Composable
private fun LayerTile(layer: Layer, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        FilledIconToggleButton(
            checked = layer.on,
            onCheckedChange = layer.set,
            shapes = IconButtonDefaults.toggleableShapes(),
            modifier = Modifier.size(WingtipSize.TapTarget + WingtipSpace.Md).testTag(MapCardTags.TILE + layer.key).semantics { contentDescription = layer.name },
        ) { Icon(layer.icon, contentDescription = null) }
        Text(
            layer.name, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, maxLines = 2,
            modifier = Modifier.padding(top = WingtipSpace.Xs).clearAndSetSemantics {},
        )
    }
}

private const val TILES_A_ROW = 3
