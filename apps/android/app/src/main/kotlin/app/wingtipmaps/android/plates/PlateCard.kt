package app.wingtipmaps.android.plates

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.ui.CardButtonGroup
import app.wingtipmaps.android.ui.GroupAction
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SettingsGroup
import app.wingtipmaps.android.ui.SwitchSettingRow
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.launch

/**
 * An approach plate's card, opened by a tap on the plate on the map, as
 * ForeFlight's (the owner's screenshot, 2026-11-11): the sheet's stock
 * card (CardPage, the card rule) titled with the plate's name as the FAA
 * writes it, in sentence case with its codes kept ("KOSH ILS or LOC rwy
 * 36"); Hide Plate and View Full Screen side by side in Material's button
 * group, the page full screen in the app with own ship on it
 * (PlateViewer); Show Annotations and Invert Plate Colors as the stock
 * switch rows; and the plate's transparency on Material's stock Slider, clear to
 * solid with an icon at each end -- continuous, so a slider rather than a
 * menu. Each setting is kept on this phone (PlateLookStore) and changes
 * the plate on the map as it is made.
 */
@Composable
fun PlateCard(pick: PlatePick, exit: CardExit) {
    val context = LocalContext.current
    val model = remember(context) { PlateCardModel.of(context) }
    val look by model.look.collectAsStateWithLifecycle()
    val plates by model.state.collectAsStateWithLifecycle()
    val name = plates.placed[pick]?.name
    val title = remember(name, pick) { if (name == null) "${pick.ident} ${pick.procedure}" else "${pick.ident} ${MapRules.faaWords(name)}" }
    val scope = rememberCoroutineScope()
    var noPage by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<String?>(null) }
    val hide = stringResource(R.string.plate_hide)
    val full = stringResource(R.string.plate_full_screen)
    CardPage(title = title, exit = exit) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
        ) {
            CardButtonGroup(
                listOf(
                    GroupAction(hide, null) {
                        model.hide(pick)
                        exit.close()
                    },
                    // The FAA's own page full screen in the app, own ship on
                    // it where the plate is placed (PlateViewer).
                    GroupAction(full, null, enabled = name != null) {
                        scope.launch {
                            val url = model.fullScreen(pick)
                            noPage = url == null
                            viewing = url
                        }
                    },
                ),
                Modifier.fillMaxWidth(),
            )
            if (noPage) ProblemLine(stringResource(R.string.plate_no_page))
            SettingsGroup {
                SwitchSettingRow(stringResource(R.string.plate_annotations), look.annotations, 0, 2, model::setAnnotations)
                SwitchSettingRow(stringResource(R.string.plate_invert), look.invert, 1, 2, model::setInvert)
            }
            OpacityRow(look.opacity, onChange = model::dragOpacity, onDone = { model.keepOpacity() })
        }
    }
    viewing?.let { url -> PlateViewer(title, url, plates.placed[pick]?.georeference, onClose = { viewing = null }) }
}

/** The transparency slider, clear at the start and solid at the end. */
@Composable
private fun OpacityRow(opacity: Float, onChange: (Float) -> Unit, onDone: () -> Unit) {
    val said = stringResource(R.string.plate_opacity)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Icon(WingtipIcons.plateClear, contentDescription = stringResource(R.string.plate_clear))
        // Material's state-holding slider: dragged, the map follows; let
        // go, the place is kept.
        val state = remember { SliderState(value = opacity, trackRange = PlateLook.LEAST_OPACITY..1f) }
        if (!state.isDragging) state.value = opacity
        Slider(
            state = state,
            onValueChange = { v ->
                state.value = v
                onChange(v)
            },
            onValueChangeFinished = onDone,
            modifier = Modifier.weight(1f).semantics { contentDescription = said },
        )
        Icon(WingtipIcons.plateSolid, contentDescription = stringResource(R.string.plate_solid))
    }
}
