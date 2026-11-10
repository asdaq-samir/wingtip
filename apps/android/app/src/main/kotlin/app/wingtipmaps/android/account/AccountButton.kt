package app.wingtipmaps.android.account

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.StripData

/**
 * The round account button beside the one search, where Setup was (the
 * owner, 2026-11-09): the pilot's initials in a circle, or a person's
 * glyph signed out. A tap opens Settings by its name (ScreenRequests), with
 * nothing in between (the owner, 2026-11-10: "When tapping the avatar
 * just open the settings"); Settings holds what the menu did -- the
 * account and signing in or out, the Logbook and the Coach, Downloads,
 * the passenger briefing and About (SetupScreen). An IconButton is
 * Material's 48-dp control, so the hit area is the platform's and nothing
 * is grown for it.
 */
@Composable
fun AccountButton(pilot: Pilot?, modifier: Modifier = Modifier) {
    val initials = StripData.initialsOf(pilot)
    val name = stringResource(R.string.account_and_settings)
    IconButton(
        onClick = { ScreenRequests.ask(Screen.SETUP) },
        modifier = modifier.semantics {
            contentDescription = pilot?.let { "${it.displayName}: $name" } ?: name
        },
    ) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(AccountAvatar)) {
            Box(contentAlignment = Alignment.Center) {
                if (initials.isNotEmpty()) {
                    Text(initials, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
    }
}

/** The circle's size inside Material's 48-dp IconButton. */
private val AccountAvatar = 36.dp

/** The row's end padding that puts the circle 16 dp from the screen's
 *  edge, as the search bar is from the other (the sheet audit's P-1):
 *  the target's 6 dp beyond the circle taken off the 16. */
val AccountEndMargin: Dp = WingtipSpace.Lg - (WingtipSize.TapTarget - AccountAvatar) / 2
