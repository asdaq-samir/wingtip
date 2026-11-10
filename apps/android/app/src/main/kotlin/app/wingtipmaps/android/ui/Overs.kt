package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.about.AboutScreen
import app.wingtipmaps.android.api.AssistantClient
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.briefing.PassengerScreen
import app.wingtipmaps.android.clearance.ClearanceSheet
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.logbook.LogbookScreen
import app.wingtipmaps.android.navigation.Over
import app.wingtipmaps.android.offline.DownloadsScreen
import app.wingtipmaps.android.ui.sheet.CardSheet
import app.wingtipmaps.android.ui.sheet.FlexibleSheet
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * A screen in a sheet over the map (Over), the same in both layouts: the
 * airplane, Settings and its pages
 * -- Settings, the Logbook, Downloads, the passenger briefing, About --
 * Ask, and the clearance card, each under Material's flexible top bar
 * with its title and a close at the end that goes back to where it was
 * opened (decision 0015).
 *
 * @param onToPlan the sheet closed onto the plan: after About's demo flight.
 */
@Composable
fun OverSheet(over: Over, plan: Plan, session: Session, ownShip: OwnShip, assistant: AssistantClient, onClose: () -> Unit, onToPlan: () -> Unit) {
    // The clearance card is its own sheet, with Listen in its bar.
    if (over == Over.Clearance) {
        val fix by ownShip.fix.collectAsStateWithLifecycle()
        ClearanceSheet(plan, fix, onClose)
        return
    }
    val title = when (over) {
        Over.Airplane -> stringResource(R.string.airplane)
        Over.Settings -> stringResource(R.string.settings)
        Over.Logbook -> stringResource(R.string.logbook)
        Over.Downloads -> stringResource(R.string.offline_downloads)
        Over.Passengers -> stringResource(R.string.passenger_briefing)
        Over.About -> stringResource(R.string.about)
        Over.Ask -> stringResource(R.string.ask)
        Over.Clearance -> stringResource(R.string.clearance)
    }
    // The Logbook draws its own large collapsing bar, with its totals.
    if (over == Over.Logbook) {
        CardSheet(onClose) { LogbookScreen(onClose = onClose) }
        return
    }
    // Every other page: Material's medium flexible bar, collapsing as the
    // page scrolls, with Close at its end.
    FlexibleSheet(title = title, onClose = onClose) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            when (over) {
                Over.Airplane -> AirplaneScreen(plan)
                Over.Settings -> SetupScreen(session)
                Over.Downloads -> DownloadsScreen()
                Over.Passengers -> PassengerScreen(plan)
                Over.About -> AboutScreen(onDemo = onToPlan)
                Over.Ask -> AskScreen(plan = plan, session = session, ownShip = ownShip, client = assistant)
                Over.Logbook, Over.Clearance -> {}
            }
        }
    }
}

/** A report the assistant read, as sent, in a fixed-width face so a
 *  METAR's groups line up as pilots read them. */
@Composable
fun SourceSheet(source: AssistantSource, onClose: () -> Unit) {
    WingtipSheet(title = source.label, onClose = onClose) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl)) {
            Text(source.text, style = MaterialTheme.typography.bodyMedium, fontFamily = FontFamily.Monospace)
        }
    }
}
