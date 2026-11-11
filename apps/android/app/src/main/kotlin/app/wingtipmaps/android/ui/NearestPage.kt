package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.CancellationException

/**
 * Nearest, one tap from the bar (#218), a page over the search with ← and
 * ✕ (CardPage), the same from the bar, the search's "nearest" and a link:
 * the fields nearest the airplane,
 * the miles and the way to each, and which are within a still-air glide
 * at pattern height (the engine's glide_reaches, AC 90-66C's 1,000 ft
 * over the field) at the picked airplane's own glide ratio -- with none
 * (no airplane, or none in its profile) no field is said to be within a
 * glide. The rows are the one search's Nearest rows too (nearestRows).
 * A tap opens the field's card on the page's own stack, so Back comes
 * back to the list.
 */
@Composable
fun NearestPage(ownShip: OwnShip, plan: Plan, exit: CardExit, onOpen: (String) -> Unit) {
    val fix by ownShip.fix.collectAsStateWithLifecycle()
    var fields by remember { mutableStateOf<List<NearestAirport>?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(fix == null) {
        val at = fix ?: return@LaunchedEffect
        try {
            fields = Planner.nearest(at.lat, at.lon, limit = 10)
            problem = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            problem = "The nearest fields could not be found. ${e.message ?: ""}".trim()
        }
    }
    CardPage(title = stringResource(R.string.nearest), exit = exit) { padding ->
        Column(Modifier.padding(padding).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            when {
                fix == null -> Text("Finding your position…", style = MaterialTheme.typography.bodyMedium)
                problem != null -> ProblemLine(problem)
                fields == null -> Text("Fetching the nearest fields…", style = MaterialTheme.typography.bodyMedium)
            }
            // The airplane's glide ratio asked for where it is missing.
            AskFigures(rememberAirplaneNow(plan), "glide")
            LazyColumn { nearestRows(fields.orEmpty(), fix) { onOpen(it.ident) } }
        }
    }
}
