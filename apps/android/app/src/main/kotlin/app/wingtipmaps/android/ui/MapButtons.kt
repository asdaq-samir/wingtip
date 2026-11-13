package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconToggleButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.RichTooltip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.VerticalFloatingToolbar
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.firstflight.FplTip
import app.wingtipmaps.android.map.MapTerrain
import app.wingtipmaps.android.map.TerrainMode

/**
 * How the position button reads: off, reading but the map let go of it,
 * or following the airplane. Denied is drawn as off; the tap asks the
 * system again where it can.
 */
enum class OwnShipMode { OFF, READING, FOLLOWING }

/**
 * The buttons over the map, at the right: on a phone's sheet they ride
 * its top edge (MapSheet's `onTop`, the owner, 2026-11-11), the radio's
 * Comms Assist where it is turned on (`onRadio`, the owner, 2026-11-13),
 * Layers, which opens the Map card as Google Maps' Layers button opens
 * its sheet, then the sparkle that opens Ask over the position button,
 * which is nearest the thumb as Google Maps' locate button is
 * (`positionLast`); beside a pane or in the strip, under the status bar
 * with the position button first and 3D last (`threeD`), as there is no
 * sheet's left column to hold it. Each state of
 * the position button has its own shape as well as its colour, never the
 * colour alone (the UI audit's #12): off is the outlined arrow on the
 * tonal button; reading is the filled arrow there; following is the
 * filled arrow on the filled, checked toggle in the tint -- the
 * concept table's `near_me` (docs/design/icons.md), and TalkBack says
 * which state it is in. Material's own 40-dp buttons with their 48-dp
 * touch targets, nothing grown.
 */
@Composable
fun MapButtons(
    ownShip: OwnShipMode,
    onOwnShip: () -> Unit,
    onAsk: (() -> Unit)?,
    onLayers: () -> Unit,
    modifier: Modifier = Modifier,
    onRadio: (() -> Unit)? = null,
    positionLast: Boolean = false,
    threeD: Boolean = false,
) {
    // Material 3 Expressive's vertical floating toolbar round the buttons,
    // in the theme's high container and raised over the chart as a menu is.
    // Its own 8-dp padding in a 64-dp column puts each 40-dp button 12 dp
    // in from its edges; the Spacer keeps 8 dp between their touch
    // targets. Each button's corners draw in under the finger: the stock
    // press shapes. The caller sets it clear of the system bars.
    VerticalFloatingToolbar(
        expanded = true,
        modifier = modifier,
        colors = FloatingToolbarDefaults.standardFloatingToolbarColors(
            toolbarContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
        expandedShadowElevation = MenuDefaults.ShadowElevation,
    ) {
        val state = stringResource(
            when (ownShip) {
                OwnShipMode.OFF -> R.string.own_ship_off
                OwnShipMode.READING -> R.string.own_ship_shown
                OwnShipMode.FOLLOWING -> R.string.own_ship_following
            },
        )
        val position: @Composable () -> Unit = {
            FilledIconToggleButton(
                checked = ownShip == OwnShipMode.FOLLOWING,
                onCheckedChange = { onOwnShip() },
                shapes = IconButtonDefaults.toggleableShapes(),
                colors = IconButtonDefaults.filledIconToggleButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
                modifier = Modifier.semantics { stateDescription = state },
            ) {
                Icon(
                    if (ownShip == OwnShipMode.OFF) WingtipIcons.myLocationOff else WingtipIcons.myLocation,
                    contentDescription = stringResource(R.string.own_ship_button),
                )
            }
        }
        // In the strip the field is the way to the assistant, so no sparkle.
        val ask: (@Composable () -> Unit)? = onAsk?.let { open ->
            {
                FilledTonalIconButton(onClick = open, shapes = IconButtonDefaults.shapes()) {
                    Icon(WingtipIcons.brief, contentDescription = stringResource(R.string.ask_about_flight), tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
        val layers: @Composable () -> Unit = {
            FilledTonalIconButton(onClick = onLayers, shapes = IconButtonDefaults.shapes()) {
                Icon(WingtipIcons.mapLayers, contentDescription = stringResource(R.string.map_layers_button))
            }
        }
        val radio: (@Composable () -> Unit)? = onRadio?.let { open ->
            {
                FilledTonalIconButton(onClick = open, shapes = IconButtonDefaults.shapes()) {
                    Icon(WingtipIcons.radio, contentDescription = stringResource(R.string.comms_assist))
                }
            }
        }
        val three: (@Composable () -> Unit)? = if (threeD) ({ ThreeDButton() }) else null
        val order = if (positionLast) listOfNotNull(radio, layers, ask, position) else listOfNotNull(position, ask, layers, radio, three)
        order.forEachIndexed { i, button ->
            if (i > 0) Spacer(Modifier.height(WingtipSpace.Sm))
            button()
        }
    }
}

/**
 * The left column riding the phone's sheet (the owner, 2026-11-13): 3D,
 * and under it, nearest the sheet, the round button that turns the
 * sheet's two pages -- no tab bar and no page dots -- showing where a tap
 * goes, as the 3D button does: the route's glyph on Search ("Show flight
 * plan"), the magnifier on FPL ("Show search"); not drawn while a card
 * covers the pages (`onToggle` null). The same Material 3 Expressive
 * vertical floating toolbar as the right column's.
 */
@Composable
fun SheetSideButtons(planShown: Boolean, onToggle: (() -> Unit)?, modifier: Modifier = Modifier) {
    VerticalFloatingToolbar(
        expanded = true,
        modifier = modifier,
        colors = FloatingToolbarDefaults.standardFloatingToolbarColors(
            toolbarContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
        expandedShadowElevation = MenuDefaults.ShadowElevation,
    ) {
        ThreeDButton()
        if (onToggle != null) {
            Spacer(Modifier.height(WingtipSpace.Sm))
            FplTipAnchor(showing = !planShown) {
                FilledTonalIconButton(onClick = onToggle, shapes = IconButtonDefaults.shapes(), modifier = Modifier.testTag(PAGE_TOGGLE_TAG)) {
                    Icon(
                        if (planShown) Icons.Filled.Search else WingtipIcons.flightPlan,
                        contentDescription = stringResource(if (planShown) R.string.show_search else R.string.show_flight_plan),
                    )
                }
            }
        }
    }
}

/**
 * The FPL's tip after the first route (FplTip), at the toggle while it
 * reads FPL (`showing`): Material's rich tooltip, persistent, its caret at
 * the button, closed by its own Close, a tap outside or Back, once.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FplTipAnchor(showing: Boolean, anchor: @Composable () -> Unit) {
    val context = LocalContext.current
    val tip = remember(context) { FplTip.of(context) }
    val due by tip.shown.collectAsStateWithLifecycle()
    val state = rememberTooltipState(isPersistent = true)
    LaunchedEffect(due, showing) { if (due && showing) state.show() else state.dismiss() }
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
        tooltip = {
            RichTooltip(
                title = { Text(stringResource(R.string.fpl_tip_title)) },
                action = { TextButton(onClick = tip::close) { Text(stringResource(R.string.close)) } },
            ) { Text(stringResource(R.string.fpl_tip)) }
        },
        state = state,
        onDismissRequest = tip::close,
        enableUserInput = false,
    ) { anchor() }
}

/** The page toggle, for the UI tests. */
const val PAGE_TOGGLE_TAG = "sheet-page-toggle"

/**
 * The map's 3D (the owner, 2026-11-13: 3D left the Terrain choice for a
 * round button of its own, as Apple Maps' is): "3D" while the map is
 * flat, "2D" and checked while it stands, the stock checked toggle;
 * MapTerrain keeps it and Map3dLayer draws it.
 */
@Composable
fun ThreeDButton() {
    val context = LocalContext.current
    val terrain = remember(context) { MapTerrain.of(context) }
    val mode by terrain.mode.collectAsStateWithLifecycle()
    val on = mode == TerrainMode.THREE_D
    val name = stringResource(R.string.map_3d_button)
    FilledIconToggleButton(
        checked = on,
        onCheckedChange = terrain::set3d,
        shapes = IconButtonDefaults.toggleableShapes(),
        colors = IconButtonDefaults.filledIconToggleButtonColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.primary,
        ),
        modifier = Modifier.semantics { contentDescription = name },
    ) {
        Text(stringResource(if (on) R.string.map_2d else R.string.map_3d), style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Why own ship shows nothing, under the status bar at the left, clear of
 * the buttons: location allowed only approximately (Android 12 and later
 * let the pilot pick it), which Android gives only to within about
 * three square kilometres and so is no position to fly by, or not allowed at all.
 * Ask again shows the system's dialog where it still will (it offers
 * precise over approximate); after a second refusal the system answers
 * at once, and the words say where the switch is.
 */
@Composable
fun OwnShipNote(approximate: Boolean, onAskAgain: () -> Unit, onClose: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
            .padding(top = WingtipSpace.Sm, start = WingtipSpace.Sm, end = WingtipSize.TapTarget + WingtipSpace.Lg),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
    ) {
        Column(Modifier.padding(start = WingtipSpace.Md, top = WingtipSpace.Md, end = WingtipSpace.Xs)) {
            Text(
                stringResource(if (approximate) R.string.own_ship_approximate else R.string.own_ship_denied),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(end = WingtipSpace.Sm),
            )
            Row(Modifier.align(Alignment.End)) {
                TextButton(onClick = onClose) { Text(stringResource(R.string.not_now)) }
                TextButton(onClick = onAskAgain) { Text(stringResource(if (approximate) R.string.allow_precise else R.string.allow)) }
            }
        }
    }
}
