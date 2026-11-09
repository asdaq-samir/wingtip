package app.wingtipmaps.android.atc

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R

/**
 * Setup's ATC, with the alerts (the web's Map menu Alerts, ATC; the
 * iPhone's Setup Alerts): Off or While Flying, a choice of two as a
 * segmented control (decision 0017). Turned on, the microphone is asked
 * for then, the moment the pilot asks for what needs it.
 */
@Composable
fun AtcSettingRow() {
    val context = LocalContext.current
    val setting = remember(context) { AtcSetting.of(context) }
    val mode by setting.mode.collectAsStateWithLifecycle()
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val labels = mapOf(AtcMode.OFF to stringResource(R.string.atc_off), AtcMode.FLYING to stringResource(R.string.atc_while_flying))
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        AtcMode.entries.forEachIndexed { i, m ->
            SegmentedButton(
                selected = mode == m,
                onClick = {
                    setting.set(m)
                    if (m == AtcMode.FLYING && !micAllowed(context)) ask.launch(Manifest.permission.RECORD_AUDIO)
                },
                shape = SegmentedButtonDefaults.itemShape(index = i, count = AtcMode.entries.size),
            ) { Text(labels.getValue(m), maxLines = 1) }
        }
    }
}
