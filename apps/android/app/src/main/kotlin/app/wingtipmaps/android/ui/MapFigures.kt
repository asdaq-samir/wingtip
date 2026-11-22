package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.strip.StripCard

/** Set where the map carries the flight's figures at its foot (an
 *  expanded window's supporting-pane layout, WidePanes), so the plan's
 *  foot in the panel shows none of its own (PlanFoot). */
val LocalFiguresOnMap = compositionLocalOf { false }

/** Set where the figures are read at arm's length, a size up (Figure). */
val LocalGlanceFigures = compositionLocalOf { false }

/**
 * The flight's figures floating along the map's foot on an expanded
 * window, as the iPad's split layout floats its strip: on the strip's
 * solid card (StripCard), never glass, and a size up (title large over
 * label medium), since a tablet on a kneeboard or a yoke mount is read at
 * arm's length (Android's large-screen guidance: "the map uses the space";
 * Apple's HIG for the iPad: "Use viewing distance and input mode to help
 * you determine the size and density"). At most the wide panel's width,
 * so the five figures stay one glance apart.
 */
@Composable
fun MapFigures(state: Plan.State) {
    StripCard(Modifier.widthIn(max = WingtipSize.PanelWide).fillMaxWidth().padding(horizontal = WingtipSpace.Lg).navigationBarsPadding().padding(bottom = WingtipSpace.Lg)) {
        CompositionLocalProvider(LocalGlanceFigures provides true) {
            Column(Modifier.padding(vertical = WingtipSpace.Sm)) { FiguresStrip(state) }
        }
    }
}
