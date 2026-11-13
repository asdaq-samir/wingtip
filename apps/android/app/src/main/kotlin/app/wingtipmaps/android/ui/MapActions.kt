package app.wingtipmaps.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.ai.rememberAiOffered
import app.wingtipmaps.android.atc.CommsAssist

/**
 * What the map's buttons open, each a card shown on the sheet's stack:
 * the sparkle's Ask, only where a model can answer (AiOffered: Nano
 * here), none in the strip, whose field is the way to it; the Layers
 * button's Map card (the owner, 2026-11-13); the instruments' Nearest;
 * and Comms Assist's radio, the clearance card, only while Settings has
 * it on (CommsAssist).
 */
data class MapActions(val onAsk: (() -> Unit)?, val onLayers: () -> Unit, val onNearest: () -> Unit, val onRadio: (() -> Unit)?)

/** The map's buttons' taps, on `pages`. */
@Composable
fun rememberMapActions(pages: SheetNav): MapActions {
    val askOffered = rememberAiOffered()
    val context = LocalContext.current
    val radio by remember(context) { CommsAssist.of(context) }.on.collectAsStateWithLifecycle()
    return MapActions(
        onAsk = if (askOffered) ({ pages.show(SheetPage.Ask) }) else null,
        onLayers = { pages.show(SheetPage.MapSettings) },
        onNearest = { pages.show(SheetPage.Nearest) },
        onRadio = if (radio) ({ pages.show(SheetPage.Clearance) }) else null,
    )
}
