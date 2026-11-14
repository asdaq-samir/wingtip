package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.pilot.MinimumsStore
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/** The test tags You's UI tests find its parts by. */
object YouTags {
    const val NAME = "you-name"
    const val ADDRESS = "you-address"
    const val SETTINGS = "settings-row"
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
 * Airplanes, Logbook, Minimums, Training and Emergency. Signed out it
 * says so once (the owner, 2026-11-13): its large line is Sign In, opening
 * Pilot Details' sign-in, with no "You" over it, and the account's rows
 * are greyed with nothing more said on each.
 */
@Composable
fun YouCard(session: Session, exit: CardExit, open: (SheetPage) -> Unit) {
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val loaded by session.loaded.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val minimums by remember(context) { MinimumsStore.of(context) }.minimums.collectAsStateWithLifecycle()
    val signedIn = pilot != null
    // Signed out, the head's Sign In is the card's one name.
    CardPage(
        title = if (!signedIn && loaded) "" else stringResource(R.string.you),
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
            // rules.md §8.1's rows: Airplanes, Flights, Logbook, Minimums,
            // Training and Emergency, under the pilot's own details.
            val rows = 7
            SettingsGroup {
                YouRow(Icons.Filled.Person, stringResource(R.string.pilot_details), pilot?.homeBase, 0, rows) { open(SheetPage.PilotDetails) }
                YouRow(Icons.Filled.Flight, stringResource(R.string.airplanes), tail, 1, rows) { open(SheetPage.YourAirplanes) }
                YouRow(Icons.Filled.Route, stringResource(R.string.flights), null, 2, rows, enabled = signedIn) { open(SheetPage.Flights) }
                YouRow(Icons.AutoMirrored.Filled.MenuBook, stringResource(R.string.logbook), null, 3, rows, enabled = signedIn) {
                    open(SheetPage.Logbook)
                }
                val kept = if (minimums.ceilingFt != null || minimums.visibilitySm != null) Format.ceilingAndVisibility(minimums.ceilingFt, minimums.visibilitySm) else null
                YouRow(Icons.Filled.VerifiedUser, stringResource(R.string.minimums), kept, 4, rows) { open(SheetPage.Minimums) }
                YouRow(Icons.Filled.School, stringResource(R.string.training), null, 5, rows, enabled = signedIn) {
                    open(SheetPage.Coach)
                }
                YouRow(Icons.Filled.Emergency, stringResource(R.string.emergency), null, 6, rows) { EmergencyOpen.open(EmergencyOpen.From.LINK) }
            }
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

/** A row's round badge, Android settings' 32-dp icon disc, and its glyph. */
private val Badge = 32.dp
private val BadgeGlyph = 18.dp
