package app.wingtipmaps.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.HomeAirport

/**
 * Setup's Home Airport (what the welcome asked before 2026-11-12): a row
 * of Material's segmented list with the field, a tap opening the one
 * search to pick another (card rule 5: the airport picker is the main
 * search, never a field of its own), and Clear Home Airport under it
 * while there is one. Signed in it is the account's home base, so the
 * web and the iPhone have it too (HomeAirport); where the account could
 * not take it, why is said under the rows.
 *
 * @param pickAirport the one search opened for an airport, the field
 *   picked handed back.
 */
@Composable
fun HomeAirportRows(session: Session, pickAirport: (onPicked: (String) -> Unit) -> Unit) {
    val context = LocalContext.current
    val phone by remember(context) { FlightChoices.of(context) }.home.collectAsStateWithLifecycle()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val problem by session.homeProblem.collectAsStateWithLifecycle()
    val home = HomeAirport.mirrored(pilot?.homeBase, phone)
    val count = if (home != null) 2 else 1
    SettingsGroup {
        ActionSettingRow(
            stringResource(R.string.home_airport), index = 0, count = count,
            supporting = home ?: stringResource(R.string.home_airport_none),
        ) { pickAirport(session::setHomeAirport) }
        if (home != null) ActionSettingRow(stringResource(R.string.home_airport_clear), index = 1, count = 2) { session.setHomeAirport(null) }
    }
    ProblemLine(problem)
}
