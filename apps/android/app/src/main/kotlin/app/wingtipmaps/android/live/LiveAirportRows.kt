package app.wingtipmaps.android.live

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.pilot.MinimumsStore
import app.wingtipmaps.android.ui.SectionTitle

/**
 * The field's live reports on its card, under its METAR (the web's
 * DigitalAtisRows and RvrRows, and the Command Center's programs): each
 * D-ATIS broadcast read into its figures with its words as sent folded
 * under them, each runway end's RVR, and a ground stop or delay program
 * in force. Nothing at all for a field with none of them.
 */
@Composable
fun LiveAirportRows(ident: String, model: LiveAirportModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    // The pilot's own visibility minimum (Setup), which each runway's RVR
    // is judged against (rvr_check, 14 CFR 91.175(h)(2)).
    val context = LocalContext.current
    val minimums by remember(context) { MinimumsStore.of(context) }.minimums.collectAsStateWithLifecycle()
    LaunchedEffect(minimums.visibilitySm) { model.judgeAgainst(minimums.visibilitySm) }
    DisposableEffect(ident) {
        model.watch(ident)
        onDispose { model.stop() }
    }
    if (state.ident != ident.trim().uppercase()) return
    Column(Modifier.fillMaxWidth()) {
        if (state.programs.isNotEmpty()) {
            SectionTitle(stringResource(R.string.live_programs))
            state.programs.forEach { line ->
                Row(line, lead = { Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error) })
            }
            Credit(stringResource(R.string.live_programs_credit))
        }
        state.atis.forEach { b -> BroadcastGroup(b) }
        if (state.rvr.isNotEmpty()) {
            SectionTitle(stringResource(R.string.live_rvr))
            state.rvr.forEach { r ->
                ListItem(
                    leadingContent = { Icon(Icons.Filled.Visibility, contentDescription = null) },
                    supportingContent = {
                        if (r.under != null) Text(r.under, color = MaterialTheme.colorScheme.error)
                        else Text(stringResource(R.string.live_rvr_parts))
                    },
                    trailingContent = { Text(r.readings, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    content = { Text(stringResource(R.string.live_rvr_runway, r.runway)) },
                )
            }
            Credit(stringResource(R.string.live_rvr_credit))
        }
    }
}

@Composable
private fun BroadcastGroup(b: LiveAirportModel.Broadcast) {
    var sent by rememberSaveable(b.title) { mutableStateOf(false) }
    SectionTitle(b.title)
    b.glance?.let { glance ->
        Row(glance, bold = true, lead = { Icon(Icons.Filled.Radio, contentDescription = null) })
    }
    b.rows.forEach { row ->
        ListItem(
            trailingContent = { Text(row.value, style = MaterialTheme.typography.bodyLarge) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(row.label) },
        )
    }
    TextButton(onClick = { sent = !sent }) {
        Text(stringResource(if (sent) R.string.live_hide_sent else R.string.live_as_sent))
    }
    if (sent) {
        Text(b.text, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Credit(stringResource(R.string.live_atis_credit))
}

@Composable
private fun Row(text: String, bold: Boolean = false, lead: @Composable () -> Unit) {
    ListItem(
        leadingContent = lead,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(text, fontWeight = if (bold) FontWeight.SemiBold else null) },
    )
}

@Composable
private fun Credit(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
