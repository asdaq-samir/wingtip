package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.brief.DepartureWindowStrip
import app.wingtipmaps.android.brief.IcingRows
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.strip.FindingIcon
import app.wingtipmaps.android.strip.findingSaid
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * The Brief, as a sheet over the map: the verdict first in its words and
 * colour, then each finding -- the weather, the airspace, the altitude,
 * the fuel, the runways, the loading, the risk -- with its glyph and its
 * line, as the web's Brief opens (decision 0012). The planner's and the
 * engine's words throughout (BriefModel).
 */
@Composable
fun BriefSheet(model: BriefModel, plan: Plan.State, signedIn: Boolean, onClose: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    WingtipSheet(title = stringResource(R.string.brief), onClose = onClose, full = true) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            ProblemLine(state.problem)
            state.verdict?.let { verdict ->
                // Said as it comes in, once the planner answers.
                Row(
                    Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
                ) {
                    FindingIcon(verdict.finding, Modifier.size(WingtipSize.Chip))
                    Text(
                        verdict.words, style = MaterialTheme.typography.headlineSmall,
                        color = LocalInk.current.words(verdict.finding, MaterialTheme.colorScheme.onSurfaceVariant),
                    )
                }
            }
            // "When should I go?": the hours across, under the verdict.
            DepartureWindowStrip(plan, signedIn)
            state.risk?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (state.items.isNotEmpty()) SectionTitle(stringResource(R.string.brief_findings))
            state.items.forEach { item ->
                // The finding said first, as its glyph shows it.
                val said = "${findingSaid(BriefModel.finding(item.finding))}: ${item.label}. ${item.detail}"
                ListItem(
                    headlineContent = { Text(item.label) },
                    supportingContent = { Text(item.detail) },
                    leadingContent = { FindingIcon(BriefModel.finding(item.finding)) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clearAndSetSemantics { contentDescription = said },
                )
            }
            // In the weather's adverse conditions: the forecast icing a leg.
            IcingRows(plan)
        }
    }
}
