package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.gateway.PaperworkDto
import app.wingtipmaps.android.records.Paperwork

/**
 * Setup's Coming Up, for a pilot signed in: what falls due for them and
 * their airplanes, soonest first -- the flight review (14 CFR 61.56(c)),
 * the medical (61.23), passengers by day and at night (61.57(a), (b)),
 * instrument currency (61.57(c)), each airplane's inspections (91.409,
 * 91.207, 91.411, 91.413, 91.171) and the owner's ADs -- each with its
 * rule and the days or hours left, red past, orange within 30 days. The
 * gateway's list (Paperwork), the one its reminder emails are made from;
 * the dates themselves are given on the web or the iPhone for now.
 */
@Composable
fun ComingUpSection(signedInAs: String) {
    var list by remember { mutableStateOf<PaperworkDto?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(signedInAs) {
        runCatching { Paperwork.fetch() }
            .onSuccess { list = it; problem = null }
            .onFailure { problem = "What falls due could not be fetched: ${it.message}" }
    }
    Column(Modifier.fillMaxWidth()) {
        SectionTitle(stringResource(R.string.coming_up))
        val items = list?.items
        when {
            items == null -> Unit
            items.isEmpty() -> Text(
                "Nothing dated yet: your flight review, medical and airplanes' inspections show here once given.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> items.forEach { due ->
                ListItem(
                    headlineContent = { Text(Paperwork.named(due)) },
                    supportingContent = { Text(Paperwork.detail(due)) },
                    trailingContent = { Text(Paperwork.whenWords(due), color = toneColor(Paperwork.tone(due))) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
            }
        }
        ProblemLine(problem)
    }
}

/** Red past, amber within the window, green further off: the palette's
 *  error, caution and go, as the web's finding tones are. */
@Composable
private fun toneColor(tone: Paperwork.Tone): Color = when (tone) {
    Paperwork.Tone.PAST -> MaterialTheme.colorScheme.error
    Paperwork.Tone.SOON -> LocalWingtipPalette.current.cautionInk
    Paperwork.Tone.FINE -> LocalWingtipPalette.current.goInk
    Paperwork.Tone.UNKNOWN -> MaterialTheme.colorScheme.onSurfaceVariant
}
