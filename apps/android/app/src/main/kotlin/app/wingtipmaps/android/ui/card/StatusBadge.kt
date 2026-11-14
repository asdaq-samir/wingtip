package app.wingtipmaps.android.ui.card

import androidx.annotation.StringRes
import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipColors

/**
 * The statuses a pilot scans for, each a fill from design/tokens.json
 * (color.badge.status-*) under white words at 4.5:1 or more, and its word,
 * as the web's StatusBadge has them (docs/design/rules.md, 9; the owner,
 * 2026-11-14: "Use badges where we can for example tfr active etc.").
 */
enum class Status(val fill: Color, @StringRes val word: Int) {
    /** In force now: a TFR, a NOTAM, a special-use area hot. */
    Active(WingtipColors.Badge.StatusActive, R.string.badge_active),

    /** In force later, not yet. */
    Later(WingtipColors.Badge.StatusLater, R.string.badge_later),

    /** Scheduled but not in use now: a special-use area cold. */
    Cold(WingtipColors.Badge.StatusCold, R.string.badge_cold),

    /** Closed by NASR or a NOTAM (decision 0043): never shown as open. */
    Closed(WingtipColors.Badge.StatusClosed, R.string.badge_closed),

    /** A navaid or a service not working. */
    OutOfService(WingtipColors.Badge.StatusOutOfService, R.string.badge_out_of_service),

    /** A field's use where it is not public (NASR's use and ownership). */
    Private(WingtipColors.Badge.StatusPrivate, R.string.badge_private),
    Military(WingtipColors.Badge.StatusMilitary, R.string.badge_military),
    Joint(WingtipColors.Badge.StatusJoint, R.string.badge_joint),

    /** A tracked airplane: flying, on the ground, squawking an emergency. */
    InAir(WingtipColors.Badge.Air, R.string.badge_in_air),
    Ground(WingtipColors.Badge.StatusGround, R.string.badge_ground),
    Emergency(WingtipColors.Badge.StatusEmergency, R.string.badge_emergency),
}

/**
 * The app's one status badge, Material 3's own Badge filled in the
 * status's colour with its word in white. The word is the badge's own
 * text, so TalkBack reads it; [words] says more where the status needs it
 * ("Active until 2200Z"). Words that explain stay text beside it.
 */
@Composable
fun StatusBadge(status: Status, modifier: Modifier = Modifier, words: String? = null) {
    Badge(containerColor = status.fill, contentColor = Color.White, modifier = modifier) {
        Text(
            words ?: stringResource(status.word),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
