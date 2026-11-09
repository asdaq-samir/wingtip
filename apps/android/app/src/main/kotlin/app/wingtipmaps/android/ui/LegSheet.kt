package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * A leg of the route, from a checkpoint's row: where it goes from and to,
 * and the nav log's figures for it -- the cruise altitude, the courses,
 * the heading, the distance, the time, the groundspeed and the fuel --
 * each the planner's. A figure the planner sent none of (no airplane
 * chosen: no heading, airspeed, time or fuel) is left out rather than
 * guessed (decision 0011).
 */
@Composable
fun LegSheet(number: Int?, leg: Leg, onClose: () -> Unit) {
    val title = if (number != null) "$number. ${leg.to}" else leg.to
    WingtipSheet(title = title, onClose = onClose) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = WingtipSpace.Xl)) {
            Row(stringResource(R.string.leg_from), leg.from)
            Row(stringResource(R.string.leg_altitude), Format.cruiseAltitude(leg.altitudeFt), Spoken.altitude(leg.altitudeFt))
            Row(stringResource(R.string.leg_true_course), Format.heading(leg.trueCourseDeg), Spoken.headingTrue(leg.trueCourseDeg))
            Row(stringResource(R.string.leg_magnetic_course), Format.heading(leg.magneticCourseDeg), Spoken.headingMagnetic(leg.magneticCourseDeg))
            leg.magneticHeadingDeg?.let { Row(stringResource(R.string.leg_magnetic_heading), Format.heading(it), Spoken.headingMagnetic(it)) }
            Row(stringResource(R.string.leg_variation), Format.variation(leg.magneticVariationDeg))
            Row(stringResource(R.string.leg_distance), Format.distance(leg.distanceNm), Spoken.distance(leg.distanceNm))
            leg.eteMin?.let { Row(stringResource(R.string.leg_time), Format.navLogTime(it), Spoken.duration(it)) }
            leg.groundspeedKt?.let { Row(stringResource(R.string.leg_groundspeed), Format.speed(it), Spoken.speed(it)) }
            leg.tasKt?.let { Row(stringResource(R.string.leg_airspeed), Format.speed(it), Spoken.speed(it)) }
            leg.fuelGal?.let { Row(stringResource(R.string.leg_fuel), Format.fuel(it), Spoken.fuel(it)) }
        }
    }
}

/** A figure's row, read as one: its name, then the figure in words
 *  (`said`) or as written where there is no spoken form. */
@Composable
private fun Row(name: String, value: String, said: String = value) {
    ListItem(
        headlineContent = { Text(name) },
        trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clearAndSetSemantics { contentDescription = "$name, $said" },
    )
}
