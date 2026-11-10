package app.wingtipmaps.android.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen

/**
 * The pilot's own pages, under the account they belong to: the Logbook
 * and its Coach, signed in. Each row opens its screen by its name
 * (ScreenRequests), as a link would; they were the account menu's rows
 * until the account button opened Settings itself (the owner, 2026-11-10).
 */
@Composable
fun PilotPageRows() {
    SettingsGroup {
        PageRow(R.string.logbook, Screen.LOGBOOK, index = 0, count = 2)
        PageRow(R.string.coach, Screen.COACH, index = 1, count = 2)
    }
}

/**
 * The app's other pages, kept to the foot of Settings as Android's
 * settings keep theirs: the charts kept for flying with no signal, the
 * passenger briefing and About.
 */
@Composable
fun AppPageRows() {
    SettingsGroup(Modifier.padding(top = WingtipSpace.Md)) {
        PageRow(R.string.offline_downloads, Screen.DOWNLOADS, index = 0, count = 3)
        PageRow(R.string.passenger_briefing, Screen.PASSENGERS, index = 1, count = 3)
        PageRow(R.string.about, Screen.ABOUT, index = 2, count = 3)
    }
}

@Composable
private fun PageRow(@StringRes title: Int, screen: Screen, index: Int, count: Int) {
    ActionSettingRow(stringResource(title), index = index, count = count) { ScreenRequests.ask(screen) }
}
