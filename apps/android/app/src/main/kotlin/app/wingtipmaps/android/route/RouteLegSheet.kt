package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * The Route Leg sheet, as ForeFlight opens one from a tap on its course
 * (the owner's screenshot, 2026-11-08) and the web's RouteLegCard: the
 * leg's ends, Active Leg on the one being flown, its actions in a row --
 * Direct to its end, Remove a stop in the error colour -- then its
 * Distance and its Course, magnetic. Close goes back to the map.
 */
@Composable
fun RouteLegSheet(leg: RouteLegModel.View, onDirect: () -> Unit, onRemove: () -> Unit, onClose: () -> Unit) {
    WingtipSheet(title = stringResource(R.string.route_leg), onClose = onClose) {
        Column(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                Text(leg.from, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = stringResource(R.string.route_leg_to), modifier = Modifier.size(WingtipSpace.Lg + WingtipSpace.Xs))
                Text(leg.to, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (leg.active) SuggestionChip(onClick = {}, enabled = false, label = { Text(stringResource(R.string.route_leg_active)) })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                FilledTonalButton(onClick = onDirect, modifier = Modifier.weight(1f)) {
                    Icon(WingtipIcons.directTo, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                    Text(
                        if (leg.directOn) stringResource(R.string.route_leg_cancel_direct) else stringResource(R.string.route_leg_direct, leg.to),
                        modifier = Modifier.padding(start = ButtonDefaults.IconSpacing), maxLines = 1,
                    )
                }
                if (leg.removable) {
                    OutlinedButton(
                        onClick = onRemove, modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                        Text(stringResource(R.string.route_leg_remove, leg.to), modifier = Modifier.padding(start = ButtonDefaults.IconSpacing), maxLines = 1)
                    }
                }
            }
            Fact(stringResource(R.string.route_leg_distance), leg.distanceNm?.let(Format::distance) ?: Format.NONE)
            Fact(stringResource(R.string.route_leg_course), leg.courseMagDeg?.let { Format.heading(it) + "M" } ?: Format.NONE)
        }
    }
}

@Composable
private fun Fact(name: String, value: String) {
    ListItem(
        headlineContent = { Text(name) },
        trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}
