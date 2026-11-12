package app.wingtipmaps.android.brief

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.route.RoutePoints
import app.wingtipmaps.android.strip.FindingIcon
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.SectionTitle

/**
 * The Brief's Forecast Icing group (IcingModel): a row a leg, its
 * finding's glyph, the leg's ends, the severity at the altitude flown and
 * the levels icing is forecast between, with the AWC's credit under it.
 * Nothing until the nav log is whole with each leg's time.
 */
@Composable
fun IcingRows(plan: Plan.State, model: IcingModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val points = remember(plan.course) { RoutePoints.of(plan.course) }
    // Under IFR only, as the web's useIcingForecast: a VFR flight keeps
    // its distance from cloud (14 CFR 91.155), where the icing is met.
    val ifr = plan.rules == "ifr"
    LaunchedEffect(points, plan.legs, plan.planning, ifr) { if (!plan.planning) model.brief(if (ifr) points else emptyList(), plan.legs) }
    when {
        state.unchecked -> Text(stringResource(R.string.icing_unchecked), color = LocalInk.current.cautionInk, style = MaterialTheme.typography.bodyMedium)
        state.loading -> {
            SectionTitle(stringResource(R.string.icing_forecast))
            LoadingRow()
        }
        state.rows.isNotEmpty() -> {
            SectionTitle(stringResource(R.string.icing_forecast))
            state.rows.forEach { row ->
                ListItem(
                    leadingContent = { FindingIcon(row.finding) },
                    supportingContent = {
                        Column {
                            Text(row.value)
                            row.layer?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    content = { Text(row.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                )
            }
            state.credit?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
