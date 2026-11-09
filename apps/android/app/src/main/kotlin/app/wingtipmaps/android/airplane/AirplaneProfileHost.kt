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
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import kotlinx.coroutines.launch

/**
 * Where the airplane's profile opens over whatever the pilot was on
 * (ProfileOpen), so closing it goes back there; and, once signed in, the
 * offer to keep with the account the airplanes kept on this phone while
 * signed out. The pilot's airplanes are asked again at every sign-in or out.
 */
@Composable
fun AirplaneProfileHost(plan: Plan, session: Session) {
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
            confirmButton = { TextButton(onClick = { scope.launch { runCatching { own.keepOnAccount() } } }) { Text(stringResource(R.string.offer_keep)) } },
            dismissButton = { TextButton(onClick = own::notNow) { Text(stringResource(R.string.not_now)) } },
        )
    }
    val at by ProfileOpen.at.collectAsStateWithLifecycle()
    val open = at ?: return
    val airplane = rememberAirplaneOf(open.tail, plan)
    WingtipSheet(title = airplane.name ?: stringResource(R.string.profile_airplane), onClose = ProfileOpen::close, full = true) {
        AirplaneProfileScreen(airplane, open.focus)
    }
}
