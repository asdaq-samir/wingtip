package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.strip.StripData

/** The name You heads itself with: never an address, as an email sign-in's
 *  display name is the address itself (the web's YouHead); none given, null. */
object YouName {
    fun of(pilot: Pilot?): String? {
        val given = pilot?.fullName?.takeIf { it.isNotBlank() } ?: pilot?.displayName
        return given?.trim()?.takeIf { it.isNotEmpty() && '@' !in it && it != pilot?.email }
    }
}

/** You's head: the avatar, the name (or Add Your Name), the address. */
@Composable
fun YouHead(pilot: Pilot?, loaded: Boolean, onDetails: () -> Unit) {
    val name = YouName.of(pilot)
    Column(Modifier.fillMaxWidth().padding(top = WingtipSpace.Md), horizontalAlignment = Alignment.CenterHorizontally) {
        PilotAvatar(pilot, Avatar, MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold))
        val large = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
        when {
            name != null -> Text(
                name, style = large, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = WingtipSpace.Sm).semantics { heading() }.testTag(YouTags.NAME),
            )
            // A pilot with no name given: the large line asks for one; signed
            // out, Sign In -- both in Pilot Details, its ← back to You.
            pilot != null || loaded -> TextButton(onClick = onDetails, modifier = Modifier.testTag(YouTags.NAME)) {
                Text(stringResource(if (pilot != null) R.string.add_your_name else R.string.you_sign_in), style = large)
            }
            else -> Text(stringResource(R.string.checking_sign_in), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = WingtipSpace.Sm))
        }
        pilot?.email?.let {
            Text(
                it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.testTag(YouTags.ADDRESS),
            )
        }
    }
}

/**
 * The pilot's round avatar, You's head and Pilot Details' account row
 * alike: the initials in the tint where the pilot has a name, else in
 * the tint on a grey disc, and a person's glyph with no initials at all.
 */
@Composable
fun PilotAvatar(pilot: Pilot?, size: Dp, style: TextStyle) {
    val named = YouName.of(pilot) != null
    Surface(
        shape = CircleShape,
        color = if (named) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHighest,
        modifier = Modifier.size(size),
    ) {
        Box(contentAlignment = Alignment.Center) {
            val initials = StripData.initialsOf(pilot)
            if (pilot != null && initials.isNotEmpty()) {
                Text(initials, style = style, color = if (named) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)
            } else {
                Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(size / 2))
            }
        }
    }
}

/** The avatar, Apple Maps' and the web's 72 points. */
private val Avatar = 72.dp
