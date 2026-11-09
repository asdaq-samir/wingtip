package app.wingtipmaps.android.flight

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.ui.InstrumentsWords
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * The alerts ahead in full, from a tap on their banner: each soonest
 * first, in the planner's words -- what it is, the rule that says what to
 * do (its `need`), when and how far, its floor and top and its times of
 * use where known -- and More Info on an airspace volume, its card with
 * the rules to enter it (AlertFixes.card), the sheet closing to show it.
 */
@Composable
fun AheadSheet(alerts: List<AheadAlert>, onClose: () -> Unit) {
    WingtipSheet(title = stringResource(R.string.ahead), onClose = onClose) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl)) {
            alerts.sortedBy { it.seconds }.forEach { alert -> AheadRow(alert, onClose) }
        }
    }
}

@Composable
private fun AheadRow(alert: AheadAlert, onClose: () -> Unit) {
    val danger = alert.level == "stop" || alert.level == "danger" || alert.level == "warning"
    val ink = if (danger) MaterialTheme.colorScheme.error else LocalInk.current.cautionInk
    val card = AlertFixes.card(alert)
    val floorTop = alert.floorFt?.let { floor ->
        (alert.ceilingFt ?: alert.topFt)?.let { top -> stringResource(R.string.ahead_floor_top, Format.altitude(floor), Format.altitude(top)) }
    }
    ListItem(
        supportingContent = {
            Column {
                Text(alert.need)
                Text(
                    listOfNotNull("${InstrumentsWords.minutes(alert.seconds / 60)}, ${Format.distance(alert.distanceNm)}", floorTop, alert.timesOfUse).joinToString(" · "),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        trailingContent = card?.let {
            {
                TextButton(onClick = {
                    onClose()
                    CardRequests.open(it)
                }) { Text(stringResource(R.string.point_more_info)) }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(alert.name, fontWeight = FontWeight.SemiBold, color = ink) },
    )
}
