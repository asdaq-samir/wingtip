package app.wingtipmaps.android.account

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.StripData

/**
 * The round account button beside the one search, where Setup was (the
 * owner, 2026-11-09): the pilot's initials in a circle, or a person's
 * glyph signed out, and Material's own menu of what Setup held -- its
 * Settings page (the layout, the look, the account, the minimums, the
 * map and the copilots), the Logbook and the Coach signed in, Downloads,
 * the passenger briefing and About, then Sign In or Sign Out. Each row
 * opens its screen by its name (ScreenRequests), as a link would. An
 * IconButton is Material's 48-dp control, so the hit area is the
 * platform's and nothing is grown for it.
 */
@Composable
fun AccountMenu(pilot: Pilot?, onSignOut: () -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    val initials = StripData.initialsOf(pilot)
    val menu = stringResource(R.string.pilot_menu)
    Box(modifier) {
        IconButton(
            onClick = { open = true },
            modifier = Modifier.semantics {
                contentDescription = pilot?.let { "${it.displayName}: $menu" } ?: menu
            },
        ) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(36.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    if (initials.isNotEmpty()) {
                        Text(initials, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                    }
                }
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            val go: (Screen) -> Unit = { screen ->
                open = false
                ScreenRequests.ask(screen)
            }
            pilot?.let { who ->
                Text(
                    who.displayName.ifEmpty { who.email }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
                )
                HorizontalDivider()
            }
            Row(R.string.settings, Icons.Filled.Settings) { go(Screen.SETUP) }
            // The logbook and its coach are the account's.
            if (pilot != null) {
                Row(R.string.logbook, Icons.AutoMirrored.Filled.MenuBook) { go(Screen.LOGBOOK) }
                Row(R.string.coach, Icons.Filled.School) { go(Screen.COACH) }
            }
            Row(R.string.offline_downloads, Icons.Filled.DownloadForOffline) { go(Screen.DOWNLOADS) }
            Row(R.string.passenger_briefing, Icons.Filled.Groups) { go(Screen.PASSENGERS) }
            Row(R.string.about, Icons.Filled.Info) { go(Screen.ABOUT) }
            HorizontalDivider()
            if (pilot != null) {
                Row(R.string.sign_out, Icons.AutoMirrored.Filled.Logout) {
                    open = false
                    onSignOut()
                }
            } else {
                // The sign-in is Settings' own (the emailed link).
                Row(R.string.sign_in, Icons.AutoMirrored.Filled.Login) { go(Screen.SETUP) }
            }
        }
    }
}

@Composable
private fun Row(@StringRes title: Int, icon: ImageVector, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(stringResource(title)) },
        leadingIcon = { Icon(icon, contentDescription = null) },
        onClick = onClick,
    )
}
