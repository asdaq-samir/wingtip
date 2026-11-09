package app.wingtipmaps.android.atc

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.AnnounceOnce
import app.wingtipmaps.android.ui.LocalInk

/**
 * A call to us as the ATC copilot read it (the web's AtcCard): what was
 * said, each item on a row of its own with what a tap does with it
 * (Direct To, Set Next, Set Code), the readback's result once heard, and
 * Read Back. Nothing is set until a chip is tapped; ✕ puts it away.
 */
@Composable
fun AtcCardView(card: AtcCard, kept: AtcCopilotModel.Kept, problem: String?, words: (AtcItem) -> String, onAct: (Int) -> Unit, onReadBack: () -> Unit, onClose: () -> Unit) {
    // A new call to us said once as it comes in: the live region below
    // says what changes on a card already shown (the readback's result).
    val heard = card.items.map(words).ifEmpty { listOf(card.text) }.joinToString(", ")
    AnnounceOnce(card.id, stringResource(R.string.said_atc_heard, heard))
    Surface(shape = MaterialTheme.shapes.large, tonalElevation = 3.dp, shadowElevation = 2.dp) {
        Column(
            Modifier.fillMaxWidth().padding(start = WingtipSpace.Md, end = WingtipSpace.Xs, top = WingtipSpace.Xs, bottom = WingtipSpace.Sm)
                .semantics { liveRegion = LiveRegionMode.Polite },
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                Icon(Icons.Filled.Radio, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(
                    card.text, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.atc_put_away)) }
            }
            card.items.forEachIndexed { i, item ->
                ItemRow(words(item), AtcWords.actionOf(item), done = i in card.set) { onAct(i) }
            }
            card.readback?.let { rb ->
                val short = AtcWords.readbackShort(rb.check)
                AtcWords.readbackLines(rb.check).forEach { line ->
                    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                        val ink = if (short) LocalInk.current.cautionInk else MaterialTheme.colorScheme.onSurfaceVariant
                        Icon(if (short) Icons.Filled.Error else Icons.Filled.Check, contentDescription = null, tint = ink)
                        Text(line, style = MaterialTheme.typography.bodyMedium, color = ink)
                    }
                }
            }
            if (card.awaiting) Text(stringResource(R.string.atc_read_it_back), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            problem?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
            KeptLine(kept)
            if (!card.awaiting) {
                TextButton(onClick = onReadBack) {
                    Icon(Icons.Filled.Mic, contentDescription = null)
                    Text(stringResource(if (card.readback != null) R.string.atc_read_back_again else R.string.atc_read_back), Modifier.padding(start = WingtipSpace.Xs))
                }
            }
        }
    }
}

/** One item, and its chip: Material's tonal button keeps its 48 dp touch
 *  target without growing the row. */
@Composable
private fun ItemRow(words: String, action: ItemAction?, done: Boolean, onAct: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(end = WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Text(words, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        when {
            action == null -> {}
            done -> Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.atc_set), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> FilledTonalButton(onClick = onAct) { Text(stringResource(label(action))) }
        }
    }
}

private fun label(action: ItemAction): Int = when (action) {
    ItemAction.DIRECT -> R.string.atc_direct_to
    ItemAction.FREQUENCY -> R.string.atc_set_next
    ItemAction.SQUAWK -> R.string.atc_set_code
}

/** "Next: Approach 125.35 · Code 4512", what the pilot set from a card. */
@Composable
private fun KeptLine(kept: AtcCopilotModel.Kept) {
    val next = kept.frequency?.let { f ->
        stringResource(R.string.atc_kept_next, listOfNotNull(kept.facility?.replaceFirstChar { it.uppercase() }, f).joinToString(" "))
    }
    val code = kept.squawk?.let { stringResource(R.string.atc_kept_code, it) }
    val line = listOfNotNull(next, code).joinToString(" · ")
    if (line.isNotEmpty()) Text(line, style = MaterialTheme.typography.labelLarge)
}
