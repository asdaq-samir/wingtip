package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.account.DeleteAccountButton
import app.wingtipmaps.android.account.ExportRow
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.pilot.MinimumsRows
import app.wingtipmaps.android.strip.StripData

/**
 * Pilot Details, You's first row (the owner, 2026-11-13: the account's
 * actions moved from beside the name into it): signed in, who is signed
 * in, Sign Out and Delete Account, what falls due, everything the account
 * holds as a file, and the home airport; signed out, an address and the
 * emailed link, which opens the app and signs it in (Session.open), with
 * the home airport this phone keeps.
 */
@Composable
fun PilotDetailsScreen(session: Session, pickAirport: (onPicked: (String) -> Unit) -> Unit) {
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val loaded by session.loaded.collectAsStateWithLifecycle()
    val problem by session.problem.collectAsStateWithLifecycle()
    val checkFailed by session.checkFailed.collectAsStateWithLifecycle()
    val linkSent by session.linkSent.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) {
        val signedIn = pilot
        when {
            !loaded -> Loading(Modifier.size(WingtipSpace.Xl))
            signedIn != null -> {
                AccountRow(signedIn)
                Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    OutlinedButton(onClick = { session.signOut(context) }) { Text(stringResource(R.string.sign_out)) }
                    DeleteAccountButton(session)
                }
            }
            else -> {
                OutlinedTextField(
                    value = email, onValueChange = { email = it }, modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.email)) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
                )
                Button(onClick = { session.requestMagicLink(email) }, enabled = email.contains('@')) {
                    Text(stringResource(R.string.email_sign_in_link))
                }
                if (linkSent) Text(stringResource(R.string.check_email), style = MaterialTheme.typography.bodyMedium)
            }
        }
        ProblemLine(problem, onRetry = if (checkFailed) session::refresh else null)
        // What falls due, the pilot's and their airplanes', under the
        // account it belongs to; everything the account holds, as a file.
        signedIn?.let { ComingUpSection(signedInAs = it.email) }
        if (signedIn != null) ExportRow()
        // The pilot's home airport, the account's where signed in: where a
        // route starts when the phone does not know where it is.
        HomeAirportRows(session, pickAirport)
    }
}

/**
 * Who is signed in, as Android's settings head their account: the
 * pilot's initials in a circle in the tint, the name, and the address
 * under it.
 */
@Composable
private fun AccountRow(pilot: Pilot) {
    SegmentedListItem(
        shapes = ListItemDefaults.segmentedShapes(index = 0, count = 1),
        modifier = Modifier.fillMaxWidth(),
        leadingContent = {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(WingtipSize.TapTarget)) {
                Box(contentAlignment = Alignment.Center) {
                    Text(StripData.initialsOf(pilot), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        },
        supportingContent = if (YouName.of(pilot) != null) {
            { Text(pilot.email, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            null
        },
        content = { Text(YouName.of(pilot) ?: pilot.email, style = MaterialTheme.typography.titleMediumEmphasized) },
    )
}

/** You's Minimums: the pilot's own, kept on this phone (no sign-in). */
@Composable
fun MinimumsScreen() {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) { MinimumsRows() }
}
