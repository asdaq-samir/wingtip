package app.wingtipmaps.android.offline

import androidx.compose.foundation.layout.padding
import app.wingtipmaps.android.ui.ProblemLine
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ready.ReadyFacts
import java.util.Locale

/**
 * Keep for the Air on the flight plan, under the nav log once the route
 * has a course, as the iOS app's FPLView has it: one tap keeps the route's
 * answers, plan, cycle packs and charts (KeepForAirModel), "Keeping for
 * the Air…" while it does, then what the answers take on the phone. A row
 * in the tint, a stock list item; tapped again, kept afresh.
 */
@Composable
fun KeepForAirRow(plan: Plan, keeper: KeepForAirModel = hiltViewModel(), downloads: DownloadsModel = hiltViewModel()) {
    val state by keeper.state.collectAsStateWithLifecycle()
    val route by plan.state.collectAsStateWithLifecycle()
    val mine = state.route == ReadyFacts.flightKey(route)
    val keeping = mine && state.keeping
    val keptMb = state.keptMb.takeIf { mine }
    val words = when {
        keeping -> stringResource(R.string.keeping_for_air)
        keptMb != null -> stringResource(R.string.kept_for_air, String.format(Locale.US, "%.1f", keptMb))
        else -> stringResource(R.string.keep_for_air)
    }
    ListItem(
        onClick = { keeper.keep(plan, downloads) },
        enabled = !keeping,
        leadingContent = {
            if (keeping) Loading(Modifier.size(WingtipSpace.Xl))
            else Icon(if (keptMb != null) Icons.Filled.CloudDone else Icons.Filled.CloudDownload, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(words, color = MaterialTheme.colorScheme.primary) },
    )
    ProblemLine(state.problem.takeIf { mine }, Modifier.padding(horizontal = WingtipSpace.Lg))
}
