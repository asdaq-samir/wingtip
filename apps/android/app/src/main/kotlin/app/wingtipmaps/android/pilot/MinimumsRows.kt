package app.wingtipmaps.android.pilot

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.format.Format
import kotlin.math.roundToInt

/**
 * The pilot's personal minimums in Setup (the web's MinimumsPanel, its
 * Personal minimums group): each a menu of the web's choices, Off until
 * picked, kept on this phone. The copilot, the field's RVR and the
 * weather read them.
 */
@Composable
fun MinimumsRows() {
    val context = LocalContext.current
    val store = remember(context) { MinimumsStore.of(context) }
    val minimums by store.minimums.collectAsStateWithLifecycle()
    Minimums.Kind.entries.forEach { kind ->
        MinimumMenu(kind, minimums[kind]) { store.set(kind, it) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MinimumMenu(kind: Minimums.Kind, value: Double?, onPick: (Double?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val off = stringResource(R.string.minimum_off)
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = value?.let { words(kind, it) } ?: off,
            onValueChange = {},
            readOnly = true,
            label = { Text(stringResource(title(kind))) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(off) }, onClick = { onPick(null); expanded = false })
            Minimums.CHOICES.getValue(kind).forEach { choice ->
                DropdownMenuItem(text = { Text(words(kind, choice)) }, onClick = { onPick(choice); expanded = false })
            }
        }
    }
}

private fun title(kind: Minimums.Kind): Int = when (kind) {
    Minimums.Kind.CEILING -> R.string.minimum_ceiling
    Minimums.Kind.VISIBILITY -> R.string.minimum_visibility
    Minimums.Kind.CROSSWIND -> R.string.minimum_crosswind
    Minimums.Kind.WIND -> R.string.minimum_wind
}

/** A minimum as its menu writes it, by Format: 1,500 ft, 3 sm, 15 kt. */
private fun words(kind: Minimums.Kind, value: Double): String = when (kind) {
    Minimums.Kind.CEILING -> Format.altitude(value)
    Minimums.Kind.VISIBILITY -> Format.visibility(value)
    Minimums.Kind.CROSSWIND, Minimums.Kind.WIND -> Format.speed(value.roundToInt().toDouble())
}
