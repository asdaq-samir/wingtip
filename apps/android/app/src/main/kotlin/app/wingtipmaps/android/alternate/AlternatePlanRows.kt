package app.wingtipmaps.android.alternate

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.AlternateLeg
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ui.LegFigure

/**
 * The plan's alternate row under IFR, last in the route's rows (the card
 * rule: a field opens its card): the one filed, a tap to its card; with
 * none, Add Alternate, which opens the Brief, where the web files one
 * (its Alternate, AlternateRows) from the fields that will do.
 */
@Composable
fun AlternateStopRow(filed: String?, index: Int, count: Int, onField: (String) -> Unit) {
    SegmentedListItem(
        onClick = { if (filed != null) onField(filed) else ScreenRequests.ask(Screen.BRIEF) },
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        leadingContent = if (filed == null) {
            { Icon(Icons.Filled.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
        } else null,
        supportingContent = if (filed != null) {
            { Text(stringResource(R.string.alternate), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else null,
        modifier = Modifier.fillMaxWidth(),
        content = {
            if (filed != null) Text(filed) else Text(stringResource(R.string.add_alternate), color = MaterialTheme.colorScheme.primary)
        },
    )
}

/**
 * The nav log's leg on to the alternate, after the route's legs: the
 * planner's, from the engine's navlog_alternate_leg (flown at the
 * route's last altitude in its winds, its fuel in the totals, 14 CFR
 * 91.167(a)(2)), said "in still air" where the winds there were not had.
 * Its distance, and its time and fuel with an airplane (decision 0011).
 */
@Composable
fun AlternateLegRow(leg: AlternateLeg) {
    val title = stringResource(if (leg.stillAir == true) R.string.alternate_leg_still_air else R.string.alternate_leg, leg.ident)
    val said = listOfNotNull(title, Spoken.distance(leg.distanceNm), leg.eteMin?.let { Spoken.duration(it) }, leg.fuelGal?.let { Spoken.fuel(it) }).joinToString(", ")
    Row(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = said }.padding(vertical = WingtipSpace.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1.4f))
        LegFigure(stringResource(R.string.figure_dist), Format.distance(leg.distanceNm))
        leg.eteMin?.let { LegFigure(stringResource(R.string.figure_ete), Format.navLogTime(it)) }
        leg.fuelGal?.let { LegFigure(stringResource(R.string.figure_fuel), Format.fuel(it)) }
    }
}
