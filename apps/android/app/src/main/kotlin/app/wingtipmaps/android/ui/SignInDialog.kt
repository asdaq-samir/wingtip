package app.wingtipmaps.android.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session

/**
 * A sign-in link asked before it is followed (the security audit's M1,
 * 2026-11-10), in the platform's stock alert (the card rule's questions):
 * the account it signs in to, and the one it would sign out of. Nothing
 * changes until Sign In; Cancel leaves the session as it was.
 */
@Composable
fun SignInDialog(session: Session) {
    val ask by session.signInAsk.collectAsStateWithLifecycle()
    val shown = ask ?: return
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = session::declineSignIn,
        title = { Text(stringResource(R.string.sign_in_link_title)) },
        text = { Text(shown.question()) },
        confirmButton = {
            when {
                shown.canSignIn -> TextButton(onClick = { session.signIn(context) }) { Text(stringResource(R.string.sign_in_link_yes)) }
                // Used or expired: a new link to the address asked for, where there is one.
                shown.expired && shown.address != null -> TextButton(onClick = session::askAgain) { Text(stringResource(R.string.email_sign_in_link)) }
                else -> TextButton(onClick = {}, enabled = false) { Text(stringResource(R.string.sign_in_link_yes)) }
            }
        },
        dismissButton = { TextButton(onClick = session::declineSignIn) { Text(stringResource(R.string.cancel)) } },
    )
}
