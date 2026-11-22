package app.wingtipmaps.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Extra
import app.wingtipmaps.android.Extras
import app.wingtipmaps.android.R

/** Settings' Extras: the parked features, a stock switch each with a line
 *  saying what it is, all off until turned on (the feature review, taken
 *  by the owner 2026-11-21; Extras; the web's ExtrasGroup): kept in the
 *  app but out of a pilot's way and out of the store listing. */
@Composable
fun ExtrasGroup() {
    val context = LocalContext.current
    val extras = remember(context) { Extras.of(context) }
    val on by extras.on.collectAsStateWithLifecycle()
    SectionTitle(stringResource(R.string.settings_extras))
    SettingsGroup {
        Extra.entries.forEachIndexed { i, extra ->
            SwitchSettingRow(stringResource(extra.title), stringResource(extra.line), extra in on, index = i, count = Extra.entries.size) { extras.set(extra, it) }
        }
    }
}
