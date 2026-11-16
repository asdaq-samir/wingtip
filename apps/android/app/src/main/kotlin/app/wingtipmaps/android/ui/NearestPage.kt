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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.emergency.PhoneFields
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** As many fields as Nearest lists. */
private const val NEAREST = 10

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
 * back to the list. With the planner out of reach, the fields are the
 * cycle packs' on the phone (PhoneFields), said to be without weather.
 */
@Composable
fun NearestPage(ownShip: OwnShip, plan: Plan, exit: CardExit, onOpen: (String) -> Unit) {
    val fix by ownShip.fix.collectAsStateWithLifecycle()
    var fields by remember { mutableStateOf<List<NearestAirport>?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    var onPhone by remember { mutableStateOf(false) }
    val context = LocalContext.current
    LaunchedEffect(fix == null) {
        val at = fix ?: return@LaunchedEffect
        try {
            fields = Planner.nearest(at.lat, at.lon, limit = NEAREST)
            problem = null
            onPhone = false
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // The planner out of reach: the packs' fields on the phone,
            // said so (PhoneFields); with none kept here, the failure.
            val near = withContext(Dispatchers.Default) { PhoneFields.near(CyclePacks.of(context), at.lat, at.lon, NEAREST) }
            if (near.isNullOrEmpty()) {
                problem = Problems.say("The nearest fields could not be found", e)
            } else {
                fields = PhoneFields.nearestRows(near)
                problem = null
                onPhone = true
            }
        }
    }
    CardPage(title = stringResource(R.string.nearest), exit = exit) { padding ->
        Column(Modifier.padding(padding).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            when {
                fix == null -> Text(stringResource(R.string.nearest_finding_position), style = MaterialTheme.typography.bodyMedium)
                problem != null -> ProblemLine(problem)
                fields == null -> Text(stringResource(R.string.nearest_fetching), style = MaterialTheme.typography.bodyMedium)
                onPhone -> Text(stringResource(R.string.from_this_phone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            // The airplane's glide ratio asked for where it is missing.
            AskFigures(rememberAirplaneNow(plan), "glide")
            LazyColumn { nearestRows(fields.orEmpty(), fix) { onOpen(it.ident) } }
        }
    }
}
