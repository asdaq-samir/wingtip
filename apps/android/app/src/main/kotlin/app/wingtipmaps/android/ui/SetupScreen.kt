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
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenu
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.account.DeleteAccountButton
import app.wingtipmaps.android.account.ExportRow
import app.wingtipmaps.android.ai.OnPhoneAiRow
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.atc.AtcSettingRow
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.copilot.CopilotMode
import app.wingtipmaps.android.copilot.CopilotSetting
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.firstflight.FirstFlightMemory
import app.wingtipmaps.android.pilot.MinimumsRows
import app.wingtipmaps.android.strip.StripData

/**
 * Settings, the account button's page, opened by its tap alone (what the
 * Setup tab held, the owner's one search of 2026-11-09, and the account
 * menu's rows since 2026-11-10): how the app looks (the screen's layout, the
 * theme), the account -- signed in, the pilot's address and Sign Out;
 * signed out, an address and the emailed link, which opens the app and
 * signs it in (Session.open) -- what falls due, the pilot's minimums,
 * the Map Settings card and the copilots. The server the build talks to is
 * shown, for a tester with more than one. Each section under one
 * SectionTitle. The Logbook and Coach (signed in), Downloads, the
 * passenger briefing and About are rows that open their pages
 * (SettingsPages), each in one place.
 */
@Composable
fun SetupScreen(session: Session, onMapSettings: () -> Unit) {
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
        // The plan under the one search, or the strip (StripLayout), as
        // the web app's Layout tile has it, and the look, as its Theme
        // tile: a setting of a few is a segmented control (decision 0017),
        // but the four looks' names are too long to share a row at a large
        // font, so the look is the stock exposed dropdown menu.
        SectionTitle(stringResource(R.string.layout))
        val layout by rememberLayout()
        Segmented(
            listOf(LayoutPreference.PLAN to stringResource(R.string.layout_plan), LayoutPreference.STRIP to stringResource(R.string.layout_strip)),
            selected = layout,
        ) { LayoutPreference.set(context, it) }
        SectionTitle(stringResource(R.string.theme))
        val look by rememberLook()
        LookPicker(look ?: Look.WINGTIP) { LookPreference.set(context, it) }

        SectionTitle(stringResource(R.string.account))
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
        // What falls due, the pilot's and their airplanes': under the
        // account it belongs to.
        signedIn?.let { ComingUpSection(signedInAs = it.email) }
        // Everything the account holds, as a file the pilot keeps.
        if (signedIn != null) ExportRow()
        // The Logbook and its Coach are the account's.
        if (signedIn != null) PilotPageRows()
        // The pilot's own minimums, kept on this phone (no sign-in), as
        // the web keeps them with the pilot's own things.
        SectionTitle(stringResource(R.string.personal_minimums))
        MinimumsRows()

        // What the map draws and the traffic over it: the Map Settings
        // card, on this page's stack (MapSettingsRows), as "map" or
        // "layers" typed in the search opens it.
        SettingsGroup { ActionSettingRow(stringResource(R.string.map_settings), index = 0, count = 1, onClick = onMapSettings) }
        // The in-flight copilot: off, shown, or shown and said (a setting
        // of three is a segmented control, decision 0017).
        SectionTitle(stringResource(R.string.copilot))
        val copilot = remember(context) { CopilotSetting.of(context) }
        val copilotMode by copilot.mode.collectAsStateWithLifecycle()
        Segmented(
            listOf(CopilotMode.OFF to stringResource(R.string.copilot_off), CopilotMode.ON to stringResource(R.string.copilot_on), CopilotMode.SPOKEN to stringResource(R.string.copilot_spoken)),
            selected = copilotMode, onPick = copilot::set,
        )
        // The ATC copilot: the radio listened to while flying, calls to
        // us read into cards; off until the pilot turns it on, and not
        // offered where speech cannot be recognised on the phone.
        if (remember(context) { RadioListener.canListen(context) }) {
            SectionTitle(stringResource(R.string.atc))
            AtcSettingRow()
        }

        // Where the app's AI words are made: Gemini Nano on this phone, or
        // Wingtip's assistant (docs/android-ai.md).
        OnPhoneAiRow()

        // Downloads, the passenger briefing and About.
        AppPageRows()

        // The first flight's card offered again (FirstFlightCard, riding
        // the sheet while there is no route), the web's Guide row; and the
        // server the build talks to, for a tester with more than one.
        SettingsGroup(Modifier.padding(top = WingtipSpace.Md)) {
            ActionSettingRow(stringResource(R.string.first_flight_again), index = 0, count = 2) { FirstFlightMemory.of(context).reset() }
            ValueSettingRow(stringResource(R.string.server), Config.host, index = 1, count = 2)
        }
    }
}

/**
 * The look, one of four, as Material's exposed dropdown menu (the sheet
 * audit's P-2: the four in a button group broke "Wingti/p" and "Glass
 * Cock…" at font scales 1.3 and 2.0): a read-only field with the look's
 * name whole, its menu under it, as the airplane picker has it.
 */
@Composable
private fun LookPicker(look: Look, onPick: (Look) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = look.label,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            Look.entries.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(choice.label) },
                    onClick = {
                        onPick(choice)
                        expanded = false
                    },
                )
            }
        }
    }
}

/** A setting of a few choices: Material 3 Expressive's connected
 *  button group (ChoiceGroup). */
@Composable
private fun <T> Segmented(choices: List<Pair<T, String>>, selected: T?, onPick: (T) -> Unit) {
    ChoiceGroup(choices, selected, onPick = onPick)
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
        supportingContent = if (pilot.displayName.isNotEmpty()) {
            { Text(pilot.email, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            null
        },
        content = { Text(pilot.displayName.ifEmpty { pilot.email }, style = MaterialTheme.typography.titleMediumEmphasized) },
    )
}
