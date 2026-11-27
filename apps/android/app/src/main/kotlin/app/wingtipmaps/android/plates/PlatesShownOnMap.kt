package app.wingtipmaps.android.plates

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.map.PlatesShown
import app.wingtipmaps.android.ui.LocalShade

/**
 * The approach plates on the chart (MapPane's ChartMap), drawn as their
 * card sets them in the pilot's look, and their fixes' tags, each
 * approach's asked of the engine once (PlateTagsModel). Its own
 * composable, so the map's pane holds none of this state.
 */
@Composable
fun rememberPlatesShown(): PlatesShown {
    val plateState by PlatesOnMap.shared.state.collectAsStateWithLifecycle()
    val plateLook = rememberPlateLook()
    val plateTags by PlateTagsModel.shared.tags.collectAsStateWithLifecycle()
    val drawnPlates = remember(plateState, plateLook) { plateState.drawn(plateLook) }
    LaunchedEffect(drawnPlates) { PlateTagsModel.shared.want(drawnPlates.map { it.pick }) }
    return remember(drawnPlates, plateLook, plateTags) { PlatesShown(drawnPlates, plateLook, PlateTagsModel.shared.drawing(drawnPlates, plateLook)) }
}

/** The plate's look as drawn here: the card's settings, inverted with
 *  the dark screen unless picked, and no brighter than the chart (the
 *  Dimmer; PlateLook). The one read for the map's plates, the plate
 *  full screen or beside the map and the airport diagram, so none of
 *  them is a white page in a dark cockpit (AIM 8-1-6). */
@Composable
fun rememberPlateLook(): PlateLook {
    val context = LocalContext.current
    val kept by remember { PlateLookStore.of(context) }.look.collectAsStateWithLifecycle()
    val shade = LocalShade.current
    return remember(kept, shade) { kept.copy(dark = shade.dark, brightness = 1f - shade.look.dim(shade.dark)) }
}
