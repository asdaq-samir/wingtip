package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenu
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
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.altitudeWheel
import app.wingtipmaps.android.format.Format

/**
 * The cruise altitude the route is planned at, as the other apps' altitude
 * wheel offers it, in Android's own idiom for a discrete setting: a menu
 * (decision 0017), Material's exposed dropdown. Its rows are the engine's
 * (`altitude_wheel`: every 500 ft from 1,000 ft to 17,500 ft under Class
 * A, 14 CFR 71.33 and 91.135, and the one flown), written FL-045 as the
 * cruise controls write an altitude (decision 0009), with the planner's
 * own pick by 14 CFR 91.159 or 91.179 first. Any row may be chosen: one
 * the rules would not pick is planned and warned of by the planner, never
 * refused (decision 0008). Each change is felt as a wheel's step
 * (WingtipHaptic.ALTITUDE) and the route is planned again at it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AltitudeRow(plan: Plan, state: Plan.State, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    val haptics = rememberHaptics()
    val rows = remember(state.altitudeFt) { Engine.altitudeWheel(flownFt = state.altitudeFt).getOrNull().orEmpty() }
    val pick = stringResource(R.string.altitude_planner_pick)
    fun choose(ft: Double?) {
        expanded = false
        if (ft == state.altitudeFt) return
        haptics.tap(WingtipHaptic.ALTITUDE)
        // Plan.setAltitude plans the route again at it.
        plan.setAltitude(ft)
    }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        OutlinedTextField(
            value = state.altitudeFt?.let(Format::cruiseAltitude) ?: pick,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(stringResource(R.string.leg_altitude)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(pick) }, onClick = { choose(null) })
            rows.forEach { ft -> DropdownMenuItem(text = { Text(Format.cruiseAltitude(ft)) }, onClick = { choose(ft) }) }
        }
    }
}
