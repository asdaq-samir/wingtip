package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.MapRules

/**
 * The live card first on a field's card, as Maps puts its cards first and
 * the iPhone's AirportAlertCard does: each NOTAM closing the field or a
 * runway and each TFR within 5 nm (FieldAlerts), its words in sentence
 * case with its codes kept (the engine's faa_words) and when it is in
 * force, in Material's card in the error container. Each line opens the
 * card's NOTAMs. Nothing shows where none is in force or coming.
 */
@Composable
fun FieldAlertCard(ident: String, alerts: List<RankedNotam>, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    if (alerts.isEmpty()) return
    val open = stringResource(R.string.field_alerts_open, ident)
    val ink = MaterialTheme.colorScheme.onErrorContainer
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = ink)) {
        Column {
            alerts.forEach { notam ->
                val words = remember(notam.raw) { MapRules.faaWords(FieldAlerts.body(notam.raw)) }
                val whenLine = notamWhen(FieldAlerts.whenOf(notam))
                ListItem(
                    leadingContent = {
                        val tfr = FieldAlerts.isTfr(notam)
                        Icon(if (tfr) Icons.Filled.Block else Icons.Filled.Warning, contentDescription = stringResource(if (tfr) R.string.field_alert_tfr else R.string.field_alert_closed))
                    },
                    supportingContent = whenLine?.let { { Text(it) } },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent, contentColor = ink, leadingContentColor = ink, supportingContentColor = ink),
                    modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = open, onClick = onOpen),
                    content = { Text(words, maxLines = 3, overflow = TextOverflow.Ellipsis) },
                )
            }
        }
    }
}
