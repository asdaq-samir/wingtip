package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.R
import app.wingtipmaps.android.atc.AtcSettingRow
import app.wingtipmaps.android.atc.CommsAssist
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.copilot.CopilotMode
import app.wingtipmaps.android.copilot.CopilotSetting
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.firstflight.FirstFlightMemory

/** A page of Settings: a column that scrolls, the app's side room. */
@Composable
private fun SettingsPageColumn(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) { content() }
}

/**
 * Settings' ATC, one page of the radio's (the owner, 2026-11-13): Comms
 * Assist, the map's radio button, off by default; the ATC alerts, the
 * radio listened to while flying, where the phone can recognise speech
 * itself; and the in-flight copilot, off, shown, or shown and said (a
 * setting of three is a segmented control, decision 0017).
 */
@Composable
fun AtcPage() {
    val context = LocalContext.current
    SettingsPageColumn {
        val comms = remember(context) { CommsAssist.of(context) }
        val commsOn by comms.on.collectAsStateWithLifecycle()
        SettingsGroup { SwitchSettingRow(stringResource(R.string.comms_assist), commsOn, index = 0, count = 1, onChange = comms::set) }
        if (remember(context) { RadioListener.canListen(context) }) {
            SectionTitle(stringResource(R.string.atc_alerts))
            AtcSettingRow()
        }
        SectionTitle(stringResource(R.string.copilot))
        val copilot = remember(context) { CopilotSetting.of(context) }
        val copilotMode by copilot.mode.collectAsStateWithLifecycle()
        ChoiceGroup(
            listOf(CopilotMode.OFF to stringResource(R.string.copilot_off), CopilotMode.ON to stringResource(R.string.copilot_on), CopilotMode.SPOKEN to stringResource(R.string.copilot_spoken)),
            copilotMode, onPick = copilot::set,
        )
    }
}

/**
 * Settings' Help & About (the owner, 2026-11-13, where they were rows at
 * Settings' foot): the first flight's welcome offered again (the web's
 * Guide), About with its sources and credits, and the server the build
 * talks to, for a tester with more than one.
 */
@Composable
fun HelpPage(open: (SheetPage) -> Unit) {
    val context = LocalContext.current
    SettingsPageColumn {
        SettingsGroup {
            ActionSettingRow(stringResource(R.string.first_flight_again), index = 0, count = 3) { FirstFlightMemory.of(context).reset() }
            ActionSettingRow(stringResource(R.string.about), index = 1, count = 3) { open(SheetPage.About) }
            ValueSettingRow(stringResource(R.string.server), Config.host, index = 2, count = 3)
        }
    }
}
