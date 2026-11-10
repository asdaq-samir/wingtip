package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.about.AboutScreen
import app.wingtipmaps.android.account.DeleteAccountButton
import app.wingtipmaps.android.account.ExportRow
import app.wingtipmaps.android.ai.OnPhoneAiRow
import app.wingtipmaps.android.airplane.GlideRingRow
import app.wingtipmaps.android.atc.AtcSettingRow
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.briefing.PassengerScreen
import app.wingtipmaps.android.copilot.CopilotMode
import app.wingtipmaps.android.copilot.CopilotSetting
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.SpokenAlerts
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.logbook.LogbookScreen
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.WeatherLoopRows
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.offline.DownloadsScreen
import app.wingtipmaps.android.pilot.MinimumsRows
import app.wingtipmaps.android.receiver.ReceiverSettingRows
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import app.wingtipmaps.android.welcome.WelcomeMemory

/**
 * Settings, the account menu's page (what the Setup tab held, the owner's
 * one search of 2026-11-09): how the app looks (the screen's layout, the
 * theme), the account -- signed in, the pilot's address and Sign Out;
 * signed out, an address and the emailed link, which opens the app and
 * signs it in (Session.open) -- what falls due, the pilot's minimums,
 * what the map draws and the copilots. The server the build talks to is
 * shown, for a tester with more than one. Each section under one
 * SectionTitle. The Logbook, Coach, Downloads, the passenger briefing and
 * About are the account menu's own rows (AccountMenu), each in one place.
 */
@Composable
fun SetupScreen(session: Session) {
    // The plan the root holds (the activity's one Plan), for the glide
    // ring's airplane.
    val plan: Plan = viewModel()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val loaded by session.loaded.collectAsStateWithLifecycle()
    val problem by session.problem.collectAsStateWithLifecycle()
    val linkSent by session.linkSent.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    val context = LocalContext.current

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) {
        // The plan under the one search, or the strip (StripLayout), as
        // the web app's Layout tile has it, and the look, as its Theme
        // tile: a setting of a few is a segmented control (decision 0017).
        SectionTitle(stringResource(R.string.layout))
        val layout by rememberLayout()
        Segmented(
            listOf(LayoutPreference.PLAN to stringResource(R.string.layout_plan), LayoutPreference.STRIP to stringResource(R.string.layout_strip)),
            selected = layout,
        ) { LayoutPreference.set(context, it) }
        SectionTitle(stringResource(R.string.theme))
        val look by rememberLook()
        Segmented(Look.entries.map { it to it.label }, selected = look ?: Look.WINGTIP) { LookPreference.set(context, it) }

        SectionTitle(stringResource(R.string.account))
        val signedIn = pilot
        when {
            !loaded -> Loading(Modifier.size(WingtipSpace.Xl))
            signedIn != null -> {
                Text(signedIn.email, style = MaterialTheme.typography.bodyLarge)
                OutlinedButton(onClick = { session.signOut(context) }) { Text(stringResource(R.string.sign_out)) }
                DeleteAccountButton(session)
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
        ProblemLine(problem)
        // What falls due, the pilot's and their airplanes': under the
        // account it belongs to.
        signedIn?.let { ComingUpSection(signedInAs = it.email) }
        // Everything the account holds, as a file the pilot keeps.
        if (signedIn != null) ExportRow()
        // The pilot's own minimums, kept on this phone (no sign-in), as
        // the web keeps them with the pilot's own things.
        SectionTitle(stringResource(R.string.personal_minimums))
        MinimumsRows()

        SectionTitle(stringResource(R.string.map))
        // The radar and satellite loop and its speed (map/WeatherLoop).
        WeatherLoopRows()
        MapLayerRows()
        val traffic = remember(context) { Traffic.of(context) }
        val trafficOn by traffic.on.collectAsStateWithLifecycle()
        SwitchRow(stringResource(R.string.traffic), trafficOn) { traffic.setOn(it) }
        // Off unless kept on; on by itself in an emergency (GlideRing).
        GlideRingRow(plan)
        // A Stratux, Sentry or the like on the cockpit's Wi-Fi: its traffic
        // and FIS-B weather with no internet.
        ReceiverSettingRows()
        val spoken = remember(context) { SpokenAlerts.of(context) }
        val spokenOn by spoken.on.collectAsStateWithLifecycle()
        SwitchRow(stringResource(R.string.speak_alerts), spokenOn, spoken::setOn)
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

        // The welcome once more, from its first page (WelcomeHost, over
        // whatever is open): its one home.
        ListItem(
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { WelcomeMemory.of(context).reset() },
            content = { Text(stringResource(R.string.welcome_again)) },
        )
        Row(Modifier.fillMaxWidth().padding(top = WingtipSpace.Lg), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.server), style = MaterialTheme.typography.bodyMedium)
            Text(Config.host, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
 * What the map draws over the chart (MapLayersStore, kept across
 * launches), the web's map settings' "On the Map" rows in its words and
 * order: Airspace, VORs and Fixes, Terminal Area Charts, Private Fields,
 * Military Fields.
 */
@Composable
private fun MapLayerRows() {
    val context = LocalContext.current
    val store = remember(context) { MapLayersStore.of(context) }
    val layers by store.layers.collectAsStateWithLifecycle()
    SwitchRow(stringResource(R.string.layer_airspace), layers.airspace) { store.set(MapLayersStore.Switch.AIRSPACE, it) }
    SwitchRow(stringResource(R.string.layer_navaids), layers.navaids) { store.set(MapLayersStore.Switch.NAVAIDS, it) }
    SwitchRow(stringResource(R.string.layer_tac), layers.tac) { store.set(MapLayersStore.Switch.TAC, it) }
    SwitchRow(stringResource(R.string.layer_private), layers.privateFields) { store.set(MapLayersStore.Switch.PRIVATE_FIELDS, it) }
    SwitchRow(stringResource(R.string.layer_military), layers.military) { store.set(MapLayersStore.Switch.MILITARY, it) }
}

/**
 * A setting on or off: Material's list item with a switch, the whole row
 * the toggle so its touch target is the row's 56 dp, more than the 48 dp
 * Material asks, and read out as one switch by its name.
 */
@Composable
private fun SwitchRow(title: String, on: Boolean, onChange: (Boolean) -> Unit) {
    ListItem(
        trailingContent = { Switch(checked = on, onCheckedChange = null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().toggleable(value = on, role = Role.Switch, onValueChange = onChange),
        content = { Text(title) },
    )
}
