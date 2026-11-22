package app.wingtipmaps.android.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format

/**
 * Terrain Hazards on the Map card, its one home (the web's HazardChoice,
 * under Layers): Off, On, or In Flight, which the engine turns on by
 * itself at flying speed (`hazard_view`'s shown), off unless picked; and
 * while it is not off, Red Within, the engine's three clearances
 * (`clearances_ft`, each a 14 CFR minimum, the engine's default until one
 * is picked). Stock segmented buttons, as a discrete setting is.
 */
@Composable
fun HazardRows() {
    val context = LocalContext.current
    val prefs = remember(context) { HazardPrefs.of(context) }
    val picks by prefs.picks.collectAsStateWithLifecycle()
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Choice(stringResource(R.string.hazard_setting), Hazard.Setting.entries.map { it.label to (it == picks.setting) }, "hazard-setting") {
            prefs.setting(Hazard.Setting.entries[it])
        }
        if (picks.setting != Hazard.Setting.OFF) {
            // The clearances are the engine's; none offered where it gave none.
            val figures = remember(picks.clearanceFt) { Hazard.clearances(picks.clearanceFt) } ?: return@Column
            Choice(
                stringResource(R.string.hazard_red_within),
                figures.clearancesFt.map { Format.altitude(it) to (it == figures.clearanceFt) },
                "hazard-clearance",
            ) { prefs.clearance(figures.clearancesFt[it]) }
        }
    }
}

/** A titled row of stock segmented buttons, one picked. */
@Composable
private fun Choice(title: String, options: List<Pair<String, Boolean>>, tag: String, onPick: (Int) -> Unit) {
    Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().testTag(tag)) {
        options.forEachIndexed { i, (label, picked) ->
            SegmentedButton(
                selected = picked,
                onClick = { onPick(i) },
                shape = SegmentedButtonDefaults.itemShape(index = i, count = options.size),
                icon = {},
            ) { Text(label, maxLines = 1) }
        }
    }
}
