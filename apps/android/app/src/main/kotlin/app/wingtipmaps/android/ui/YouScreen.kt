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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.pilot.MinimumsStore
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.strip.StripData
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/** The test tags You's UI tests find its parts by. */
object YouTags {
    const val NAME = "you-name"
    const val ADDRESS = "you-address"
    const val SETTINGS = "settings-row"
}

/** The name You heads itself with: never an address, as an email sign-in's
 *  display name is the address itself (the web's YouHead); none given, null. */
object YouName {
    fun of(pilot: Pilot?): String? {
        val given = pilot?.fullName?.takeIf { it.isNotBlank() } ?: pilot?.displayName
        return given?.trim()?.takeIf { it.isNotEmpty() && '@' !in it && it != pilot?.email }
    }
}

/**
 * You, the avatar's card (the owner, 2026-11-13, three homes; Apple Maps'
 * account card, built Google's way): on the sheet's stack as every card
 * is, Settings a gear in the card's bar before its ✕ -- Material's place
 * for a card's own actions -- and a large round avatar with the pilot's
 * initials, the name large and bold, the address small and grey under it
 * (no name: Add Your Name, opening Pilot Details, whose ← comes back
 * here). Then one segmented list of what is the pilot's, each row a round
 * badge, its name, where it stands and a chevron: Pilot Details,
 * Airplanes, Logbook, Minimums, Training and Emergency; the account's
 * rows greyed signed out, saying why.
 */
@Composable
fun YouCard(session: Session, exit: CardExit, open: (SheetPage) -> Unit) {
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val loaded by session.loaded.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val minimums by remember(context) { MinimumsStore.of(context) }.minimums.collectAsStateWithLifecycle()
    val signedIn = pilot != null
    CardPage(
        title = stringResource(R.string.you),
        exit = exit,
        actions = {
            IconButton(onClick = { open(SheetPage.Settings) }, modifier = Modifier.testTag(YouTags.SETTINGS)) {
                Icon(WingtipIcons.setup, contentDescription = stringResource(R.string.settings))
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Lg),
        ) {
            YouHead(pilot, loaded, onDetails = { open(SheetPage.PilotDetails) })
            val signedOut = stringResource(R.string.sign_in_to_use)
            val rows = 6
            SettingsGroup {
                YouRow(Icons.Filled.Person, stringResource(R.string.pilot_details), pilot?.homeBase, 0, rows) { open(SheetPage.PilotDetails) }
                YouRow(Icons.Filled.Flight, stringResource(R.string.airplanes), tail, 1, rows) { open(SheetPage.YourAirplanes) }
                YouRow(Icons.AutoMirrored.Filled.MenuBook, stringResource(R.string.logbook), if (signedIn) null else signedOut, 2, rows, enabled = signedIn) {
                    open(SheetPage.Logbook)
                }
                val kept = if (minimums.ceilingFt != null || minimums.visibilitySm != null) Format.ceilingAndVisibility(minimums.ceilingFt, minimums.visibilitySm) else null
                YouRow(Icons.Filled.VerifiedUser, stringResource(R.string.minimums), kept, 3, rows) { open(SheetPage.Minimums) }
                YouRow(Icons.Filled.School, stringResource(R.string.training), if (signedIn) null else signedOut, 4, rows, enabled = signedIn) {
                    open(SheetPage.Coach)
                }
                YouRow(Icons.Filled.Emergency, stringResource(R.string.emergency), null, 5, rows) { EmergencyOpen.open(EmergencyOpen.From.LINK) }
            }
        }
    }
}

/** The card's head: the avatar, the name (or Add Your Name), the address. */
@Composable
private fun YouHead(pilot: Pilot?, loaded: Boolean, onDetails: () -> Unit) {
    val name = YouName.of(pilot)
    Column(Modifier.fillMaxWidth().padding(top = WingtipSpace.Md), horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            shape = CircleShape,
            color = if (name != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHighest,
            modifier = Modifier.size(Avatar),
        ) {
            Box(contentAlignment = Alignment.Center) {
                val initials = StripData.initialsOf(pilot)
                if (pilot != null && initials.isNotEmpty()) {
                    Text(
                        initials, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                        color = if (name != null) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(AvatarGlyph))
                }
            }
        }
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

/** One of You's rows: a round badge, the name, where it stands, a chevron. */
@Composable
private fun YouRow(icon: ImageVector, title: String, value: String?, index: Int, count: Int, enabled: Boolean = true, onClick: () -> Unit) {
    ActionSettingRow(
        title, index = index, count = count, enabled = enabled,
        leading = {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(Badge)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(BadgeGlyph))
                }
            }
        },
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                value?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        onClick = onClick,
    )
}

/** The avatar, Apple Maps' and the web's 72 points, and its glyph. */
private val Avatar = 72.dp
private val AvatarGlyph = 36.dp

/** A row's round badge, Android settings' 32-dp icon disc, and its glyph. */
private val Badge = 32.dp
private val BadgeGlyph = 18.dp
