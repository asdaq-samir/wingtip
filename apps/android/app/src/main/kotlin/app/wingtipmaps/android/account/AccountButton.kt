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
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.strip.StripData
import app.wingtipmaps.android.ui.SheetPage

/**
 * The round account button beside the one search, where Setup was (the
 * owner, 2026-11-09): the pilot's initials in a circle, or a person's
 * glyph signed out. A tap opens You, the pilot's own card (the owner's
 * three homes, 2026-11-13: You, Settings and the Map card), as a card is
 * asked for (CardRequests); Settings is the gear on it. An IconButton is
 * Material's 48-dp control, so the hit area is the platform's and nothing
 * is grown for it.
 */
@Composable
fun AccountButton(pilot: Pilot?, modifier: Modifier = Modifier, avatar: Dp = AccountAvatar) {
    val initials = StripData.initialsOf(pilot)
    val name = stringResource(R.string.account_and_settings)
    IconButton(
        onClick = { CardRequests.open(SheetPage.You) },
        modifier = modifier.semantics {
            contentDescription = pilot?.let { "${it.displayName}: $name" } ?: name
        },
    ) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(avatar)) {
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

/** The circle in the search bar's trailing slot: Material's search bar
 *  avatar, 30 dp (SearchBarTokens.AvatarSize), its target still 48. */
val SearchBarAvatar = 30.dp
