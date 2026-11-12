package app.wingtipmaps.android.plates

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.map.PlatesShown

/**
 * The approach plates on the chart (MapPane's ChartMap), drawn as their
 * card sets them in the pilot's look, and their fixes' tags, each
 * approach's asked of the engine once (PlateTagsModel). Its own
 * composable, so the map's pane holds none of this state.
 */
@Composable
fun rememberPlatesShown(): PlatesShown {
    val context = LocalContext.current
    val plateState by PlatesOnMap.shared.state.collectAsStateWithLifecycle()
    val plateLook by remember { PlateLookStore.of(context) }.look.collectAsStateWithLifecycle()
    val plateTags by PlateTagsModel.shared.tags.collectAsStateWithLifecycle()
    val drawnPlates = remember(plateState, plateLook) { plateState.drawn(plateLook) }
    LaunchedEffect(drawnPlates) { PlateTagsModel.shared.want(drawnPlates.map { it.pick }) }
    return remember(drawnPlates, plateLook, plateTags) { PlatesShown(drawnPlates, plateLook, PlateTagsModel.shared.drawing(drawnPlates, plateLook)) }
}
