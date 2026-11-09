package app.wingtipmaps.android.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R

/**
 * Why a permission is wanted, in one plain sentence, before the system
 * asks for it: the system's dialog follows Allow only, and Not Now goes
 * on without it (Android's guidance: explain first, ask in context).
 * Material's alert dialog, the stock one.
 */
@Composable
fun AskFirstDialog(title: String, line: String, onAllow: () -> Unit, onNotNow: () -> Unit) {
    AlertDialog(
        onDismissRequest = onNotNow,
        title = { Text(title) },
        text = { Text(line) },
        confirmButton = { TextButton(onClick = onAllow) { Text(stringResource(R.string.allow)) } },
        dismissButton = { TextButton(onClick = onNotNow) { Text(stringResource(R.string.not_now)) } },
    )
}
