package app.wingtipmaps.android.airplane

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import kotlinx.coroutines.launch

/**
 * Once signed in, the offer to keep with the account the airplanes kept
 * on this phone while signed out, the stock confirmation dialog. The
 * pilot's airplanes are asked again at every sign-in or out. The
 * airplane's card itself opens on the sheet's stack (ProfileOpen, read by
 * rememberSheetNav), in every layout.
 */
@Composable
fun AirplaneProfileHost(session: Session) {
    val context = LocalContext.current
    val own = remember(context) { OwnAirplanes.of(context) }
    val pilot by session.pilot.collectAsStateWithLifecycle()
    LaunchedEffect(pilot?.id) { own.refresh() }
    val offer by own.offer.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    if (offer.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = own::notNow,
            title = { Text(stringResource(R.string.offer_title)) },
            text = { Text(stringResource(R.string.offer_line, offer.mapNotNull { it.tail }.joinToString(", "))) },
            confirmButton = { TextButton(onClick = { scope.launch { val _ = runCatching { own.keepOnAccount() } } }) { Text(stringResource(R.string.offer_keep)) } },
            dismissButton = { TextButton(onClick = own::notNow) { Text(stringResource(R.string.not_now)) } },
        )
    }
}
