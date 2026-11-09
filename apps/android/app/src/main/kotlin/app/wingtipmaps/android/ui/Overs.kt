package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.api.AssistantClient
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.strip.StripModel
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * A screen over the strip, which has no tabs: an airport's card, the
 * airplane, Setup or Ask, each the tabs layout's own screen in a sheet
 * with its title and its close (decision 0015).
 */
@Composable
fun StripOver(over: StripModel.Over, plan: Plan, session: Session, ownShip: OwnShip, assistant: AssistantClient, onClose: () -> Unit) {
    val title = when (over) {
        is StripModel.Over.Airport -> over.ident
        StripModel.Over.Airplane -> stringResource(R.string.tab_airplane)
        StripModel.Over.Setup -> stringResource(R.string.tab_setup)
        StripModel.Over.Ask -> stringResource(R.string.ask)
    }
    WingtipSheet(title = title, onClose = onClose, full = true) {
        when (over) {
            is StripModel.Over.Airport -> AirportScreen(over.ident, plan = plan, onDone = onClose)
            StripModel.Over.Airplane -> AirplaneScreen(plan)
            StripModel.Over.Setup -> SetupScreen(session)
            StripModel.Over.Ask -> AskScreen(plan = plan, session = session, ownShip = ownShip, client = assistant)
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
