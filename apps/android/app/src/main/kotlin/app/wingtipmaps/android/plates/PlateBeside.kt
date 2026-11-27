package app.wingtipmaps.android.plates

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDragHandle
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.PaneAdaptedValue
import androidx.compose.material3.adaptive.layout.SupportingPaneScaffold
import androidx.compose.material3.adaptive.layout.ThreePaneScaffoldValue
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.window.core.layout.WindowSizeClass
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.ui.LocalShade
import app.wingtipmaps.android.ui.PageMark
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.ZoomablePage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The plate kept beside the map on a tablet (the market-gap report's item
 * 4, the layout iPad IFR pilots fly; the iPad's inspector and its own
 * plate window): one approach plate at a time, put there from its card
 * (PlateCard's Beside the Map) and taken away with its ✕. Kept for the
 * app's life, not the launch, as the plate shown on the map is.
 */
object PlateBeside {
    data class Shown(val title: String, val url: String, val georeference: PlateGeoreference?)

    private val _shown = MutableStateFlow<Shown?>(null)
    val shown: StateFlow<Shown?> = _shown.asStateFlow()

    fun show(plate: Shown) {
        _shown.value = plate
    }

    fun close() {
        _shown.value = null
    }

    /** Whether a window has the room: Material's expanded width (840 dp
     *  and up), where a supporting pane sits beside the main one. */
    fun fits(windowSizeClass: WindowSizeClass): Boolean = windowSizeClass.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_EXPANDED_LOWER_BOUND)
}

/**
 * The map, and at expanded width the plate beside it in Material's
 * supporting-pane scaffold: the map the main pane, the plate the
 * supporting one at the end, the two split by Material's drag handle so
 * the pilot sets how much of each, as Garmin Pilot's and the iPad's split
 * do. Narrower, or with no plate put there, the map alone.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun MapWithPlate(map: @Composable () -> Unit) {
    val info = currentWindowAdaptiveInfoV2()
    if (!PlateBeside.fits(info.windowSizeClass)) {
        map()
        return
    }
    val shown by PlateBeside.shown.collectAsStateWithLifecycle()
    val plate = shown
    val value = ThreePaneScaffoldValue(
        primary = PaneAdaptedValue.Expanded,
        secondary = if (plate != null) PaneAdaptedValue.Expanded else PaneAdaptedValue.Hidden,
        tertiary = PaneAdaptedValue.Hidden,
    )
    // The map edge to edge, a hairline between the panes; the plate as
    // wide as the wide panel to start (a plate is taller than wide), then
    // as the pilot drags it.
    val directive = calculatePaneScaffoldDirective(info).copy(horizontalPartitionSpacerSize = WingtipSpace.Hairline, defaultPanePreferredWidth = WingtipSize.PanelWide)
    SupportingPaneScaffold(
        directive = directive,
        value = value,
        mainPane = { AnimatedPane { map() } },
        supportingPane = { AnimatedPane { plate?.let { PlateBesidePane(it) } } },
        paneExpansionDragHandle = { state ->
            val interaction = remember { MutableInteractionSource() }
            VerticalDragHandle(
                modifier = Modifier.paneExpansionDraggable(state, LocalMinimumInteractiveComponentSize.current, interaction),
                interactionSource = interaction,
            )
        },
    )
}

/** A plate beside the map: its name and ✕ at the top, the FAA's page
 *  under them, pinched and panned, own ship on it where the engine places
 *  it (PlatePosition: the plan view only). White on black as the map's
 *  plate is (PlateLook.inverted: the pick, else the dark screen), on black
 *  then, never a solid white pane in a dark cockpit (AIM 8-1-6). */
@Composable
private fun PlateBesidePane(plate: PlateBeside.Shown, flight: FlightModel = hiltViewModel()) {
    val context = LocalContext.current
    val cache = context.cacheDir
    val page by produceState<Result<android.graphics.Bitmap?>?>(null, plate.url) { value = runCatching { PlatePage.read(plate.url, cache) } }
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val at = PlatePosition.of(fix, plate.georeference).getOrNull()
    val kept by remember { PlateLookStore.of(context) }.look.collectAsStateWithLifecycle()
    val inverted = kept.invert ?: LocalShade.current.dark
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.End + WindowInsetsSides.Vertical))) {
            Row(Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                Text(plate.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                IconButton(onClick = PlateBeside::close) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.plate_beside_close)) }
            }
            Box(Modifier.weight(1f).fillMaxWidth().background(if (inverted) Color.Black else Color.White), contentAlignment = Alignment.Center) {
                val read = page
                val shown = read?.getOrNull()
                when {
                    shown != null -> ZoomablePage(shown, null, at?.let { PageMark(it.x, it.y, it.rotationDeg) }, inverted = inverted)
                    read != null -> ProblemLine(stringResource(R.string.plate_no_page))
                    else -> Loading()
                }
            }
        }
    }
}
