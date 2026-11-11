package app.wingtipmaps.android.atc

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.ui.AskFirstDialog

/**
 * Setup's ATC, with the alerts (the web's Map menu Alerts, ATC; the
 * iPhone's Setup Alerts): Off or While Flying, a choice of two as a
 * segmented control (decision 0017). Turned on, the microphone is asked
 * for then, the moment the pilot asks for what needs it, after one
 * sentence saying why (AskFirstDialog); Not Now leaves the copilot on,
 * and the map's ATC line offers Allow again in flight.
 */
@Composable
fun AtcSettingRow() {
    val context = LocalContext.current
    val setting = remember(context) { AtcSetting.of(context) }
    val mode by setting.mode.collectAsStateWithLifecycle()
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    var why by rememberSaveable { mutableStateOf(false) }
    val labels = mapOf(AtcMode.OFF to stringResource(R.string.atc_off), AtcMode.FLYING to stringResource(R.string.atc_while_flying))
    ChoiceGroup(AtcMode.entries.map { it to labels.getValue(it) }, selected = mode) { m ->
        setting.set(m)
        if (m == AtcMode.FLYING && !micAllowed(context)) why = true
    }
    if (why) {
        AskFirstDialog(
            title = stringResource(R.string.microphone),
            line = stringResource(R.string.microphone_line),
            onAllow = {
                why = false
                ask.launch(Manifest.permission.RECORD_AUDIO)
            },
            onNotNow = { why = false },
        )
    }
}
