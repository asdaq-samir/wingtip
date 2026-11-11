package app.wingtipmaps.android.ui

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AssistantSource

/** A report the assistant read, as sent, in the stock dialog (the card
 *  rule, 2026-11-10: a source report is a question's dialog, not a card),
 *  in a fixed-width face so a METAR's groups line up as pilots read them;
 *  Close and Back dismiss it. */
@Composable
fun SourceDialog(source: AssistantSource, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(source.label) },
        text = { Text(source.text, style = MaterialTheme.typography.bodyMedium, fontFamily = FontFamily.Monospace, modifier = Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.close)) } },
    )
}
