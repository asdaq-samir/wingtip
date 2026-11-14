package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.OnPhoneAiRow
import app.wingtipmaps.android.airplane.GlideRingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.receiver.ReceiverSettingRows

/**
 * Where Settings opens: at its top, or at its Map group when the Map
 * card's gear asks for it (the web's lib/openSettings group), read once
 * as the page opens and let go.
 */
object SettingsAt {
    var map by mutableStateOf(false)
}

/**
 * The app's Settings, one page (the owner's three homes, 2026-11-13: You,
 * Settings and the Map card), opened from the gear on You and on the Map
 * card, a link or "settings" typed: how the app behaves, in groups as
 * Android's own Settings groups its rows -- Display (the layout; Theme
 * and Appearance are the Map card's Look since 2026-11-14, the web's
 * Sunlight having no Android twin), Map (Airport Weather, Glide Ring, Clear Your Path), In
 * Flight (the alerts said aloud, ATC to its page, the passenger
 * briefing, a receiver on the cockpit's Wi-Fi), Data (Downloads, the
 * on-phone AI) and Help & About to its page. What is the pilot's own --
 * the account, the minimums, the logbook -- is You's; what is on the map
 * is the Map card's.
 *
 * @param open a page of Settings or of the app pushed over it, so Back
 *   comes back here.
 */
@Composable
fun SettingsScreen(open: (SheetPage) -> Unit) {
    val mapGroup = remember { BringIntoViewRequester() }
    val atMap = remember { SettingsAt.map.also { SettingsAt.map = false } }
    LaunchedEffect(atMap) { if (atMap) mapGroup.bringIntoView() }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) {
        SectionTitle(stringResource(R.string.settings_display))
        SettingsGroup { LayoutRow() }

        Column(Modifier.bringIntoViewRequester(mapGroup), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            SectionTitle(stringResource(R.string.settings_map))
            MapRows()
        }

        SectionTitle(stringResource(R.string.settings_in_flight))
        val spoken = hiltViewModel<FlightModel>().spoken
        val spokenOn by spoken.on.collectAsStateWithLifecycle()
        SettingsGroup {
            SwitchSettingRow(stringResource(R.string.speak_alerts), spokenOn, index = 0, count = 3, onChange = spoken::setOn)
            ActionSettingRow(stringResource(R.string.atc), index = 1, count = 3) { open(SheetPage.Atc) }
            ActionSettingRow(stringResource(R.string.passenger_briefing), index = 2, count = 3) { open(SheetPage.Passengers) }
        }
        // A Stratux, Sentry or the like on the cockpit's Wi-Fi: its traffic
        // and FIS-B weather with no internet.
        ReceiverSettingRows()

        SectionTitle(stringResource(R.string.settings_data))
        // The charts kept for flying with no signal (the web's Keep for the
        // Air is the route's own here, on FPL) and where the AI's words are made.
        SettingsGroup { ActionSettingRow(stringResource(R.string.offline_downloads), index = 0, count = 1) { open(SheetPage.Downloads) } }
        OnPhoneAiRow()

        SettingsGroup(Modifier.padding(top = WingtipSpace.Md)) {
            ActionSettingRow(stringResource(R.string.help_and_about), index = 0, count = 1) { open(SheetPage.Help) }
        }
    }
}

/** Display: the screen's layout, the plan under the one search or the
 *  strip (StripLayout), a row with its pick at the end and the stock menu
 *  (a setting of a few is a menu or a segmented control, decision 0017). */
@Composable
private fun LayoutRow() {
    val context = LocalContext.current
    val layout by rememberLayout()
    val layouts = linkedMapOf(LayoutPreference.PLAN to stringResource(R.string.layout_plan), LayoutPreference.STRIP to stringResource(R.string.layout_strip))
    MenuSettingRow(
        stringResource(R.string.layout), layouts[layout] ?: layouts.getValue(LayoutPreference.PLAN),
        layouts.map { (key, label) -> label to { LayoutPreference.set(context, key) } }, index = 0, count = 1,
    )
}

/** The Map card's Theme, the welcome's too: one of the four looks; its
 *  name too long to share a row at a large font, a menu at its end (the
 *  sheet audit's P-2). */
@Composable
internal fun ThemeRow(index: Int, count: Int) {
    val context = LocalContext.current
    val look = rememberLook().value ?: Look.WINGTIP
    MenuSettingRow(stringResource(R.string.theme), look.label, Look.entries.map { it.label to { LookPreference.set(context, it) } }, index = index, count = count)
}

/** The Map card's Appearance, the welcome's too: System, Light, Dark, Dark + Bright. */
@Composable
internal fun AppearanceRow(index: Int, count: Int) {
    val context = LocalContext.current
    val appearance = rememberAppearance().value ?: Appearance.SYSTEM
    val names = appearanceNames()
    MenuSettingRow(
        stringResource(R.string.appearance), names.getValue(appearance),
        Appearance.entries.map { names.getValue(it) to { AppearancePreference.set(context, it) } }, index = index, count = count,
    )
}

/** Appearance's four in the web's words and order. */
@Composable
private fun appearanceNames(): Map<Appearance, String> = linkedMapOf(
    Appearance.SYSTEM to stringResource(R.string.appearance_system),
    Appearance.LIGHT to stringResource(R.string.appearance_light),
    Appearance.DARK to stringResource(R.string.appearance_dark),
    Appearance.DARK_BRIGHT to stringResource(R.string.appearance_dark_bright),
)

/** Map: how the map behaves -- each field's weather, the glide ring and
 *  the path flown, put away here; what is on it is the Map card's. */
@Composable
private fun MapRows(flight: FlightModel = hiltViewModel()) {
    // The plan the root holds (the activity's one Plan), for the glide
    // ring's airplane.
    val plan: Plan = hiltViewModel()
    val trail by flight.trail.collectAsStateWithLifecycle()
    SettingsGroup {
        AirportWeatherRow(index = 0, count = 2)
        ActionSettingRow(stringResource(R.string.clear_your_path), index = 1, count = 2, enabled = trail.size > 1) { flight.clearTrail() }
    }
    // Off unless kept on; on by itself in an emergency (GlideRing).
    GlideRingRow(plan)
}
