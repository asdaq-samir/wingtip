package app.wingtipmaps.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.brief.DepartureWindowStrip
import app.wingtipmaps.android.brief.IcingRows
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.RefreshBox
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.FindingIcon
import app.wingtipmaps.android.strip.GlanceAction
import app.wingtipmaps.android.strip.Verdict
import app.wingtipmaps.android.strip.findingSaid
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.sheet.FlexibleSheet

/**
 * The Brief, as a page over the map in Android's idiom (FlexibleSheet: a
 * large flexible top bar titled Brief with the route under it, collapsing
 * as the page scrolls), laid out as Pixel Weather lays out its own: the
 * verdict first in its words and colour, the actions it asks for under it
 * (at most three, decision 0012), then each finding -- the weather, the
 * airspace, the altitude, the fuel, the runways, the loading, the risk --
 * with its glyph and its line, as the web's Brief opens. The planner's and
 * the engine's words throughout (BriefModel). Ready to fly heads it, given
 * by the layout as `ready`, since its fixes need the plan itself. A No-Go
 * warns and never stops the plan (decision 0008): it is a verdict in its
 * colour, not a blocking screen.
 */
@Composable
fun BriefSheet(model: BriefModel, plan: Plan.State, signedIn: Boolean, onClose: () -> Unit, ready: @Composable () -> Unit = {}) {
    val state by model.state.collectAsStateWithLifecycle()
    val route = (listOf(plan.dep) + plan.stops + plan.dest).filter { it.isNotBlank() }.joinToString(" → ").ifEmpty { null }
    FlexibleSheet(title = stringResource(R.string.brief), onClose = onClose, subtitle = route, large = true) { padding ->
        // A pull asks the planner again, the weather in it being live; the
        // brief is cleared as it is asked, so its skeleton shows the fetch.
        RefreshBox(refreshing = false, onRefresh = { model.refresh(plan) }, modifier = Modifier.padding(padding)) {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
            ) {
                // Ready to fly first: what to fix on the phone while there
                // is still a signal (ReadyToFlyRow).
                ready()
                if (state.loading) LoadingRow()
                ProblemLine(state.problem)
                VerdictBlock(state.verdict, state.actions)
                // The brief kept for the air, shown with no signal: how old.
                KeptAgeLine(KeptForAir.GO_NO_GO, state.keptAtMs)
                // "When should I go?": the hours across, under the verdict.
                DepartureWindowStrip(plan, signedIn)
                state.risk?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                // The verdict and findings in plain words, on the pilot's tap,
                // beside them (docs/android-ai.md).
                if (state.verdict != null) {
                    AiWordsRow(AiTask.BRIEF, key = state.route.orEmpty() + state.fetchedAtMs, sources = { AiSources.brief(state.verdict?.words, state.risk, state.items) })
                }
                if (state.items.isNotEmpty()) SectionTitle(stringResource(R.string.brief_findings))
                state.items.forEach { item ->
                    // The finding said first, as its glyph shows it.
                    val said = "${findingSaid(BriefModel.finding(item.finding))}: ${item.label}. ${item.detail}"
                    ListItem(
                        supportingContent = { Text(item.detail) },
                        leadingContent = { FindingIcon(BriefModel.finding(item.finding)) },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        modifier = Modifier.clearAndSetSemantics { contentDescription = said },
                        content = { Text(item.label) },
                    )
                }
                // In the weather's adverse conditions: the forecast icing a leg.
                IcingRows(plan)
            }
        }
    }
}

/**
 * The verdict, the one line the Brief is about: Material's emphasized
 * headline type (the engine's verdict is a sentence, too long for display
 * type at a large font scale) on a container washed in the verdict's own ink, then the
 * actions it asks for, at most three. It fades in on the motion scheme's
 * effects spring, which never overshoots: a verdict must not bounce. A
 * verdict turning to No-Go is felt once (the tokens' warning, Android's
 * REJECT); Go is not felt at all.
 */
@Composable
private fun VerdictBlock(verdict: Verdict?, actions: List<GlanceAction>) {
    val haptics = rememberHaptics()
    LaunchedEffect(verdict?.finding) { if (verdict?.finding == Finding.STOP) haptics.tap(WingtipHaptic.WARNING) }
    AnimatedVisibility(visible = verdict != null, enter = fadeIn(MaterialTheme.motionScheme.defaultEffectsSpec()), exit = ExitTransition.None) {
        val shown = verdict ?: return@AnimatedVisibility
        val ink = LocalInk.current.words(shown.finding, MaterialTheme.colorScheme.onSurfaceVariant)
        Card(colors = CardDefaults.cardColors(containerColor = ink.copy(alpha = VERDICT_WASH))) {
            // Said as it comes in, once the planner answers.
            Row(
                Modifier.fillMaxWidth().padding(WingtipSpace.Lg).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
            ) {
                FindingIcon(shown.finding, Modifier.size(WingtipSize.Chip))
                Text(shown.words, style = MaterialTheme.typography.headlineSmallEmphasized, color = ink)
            }
            actions.forEach { a ->
                ListItem(
                    leadingContent = { FindingIcon(a.finding) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    content = { Text(a.line, style = MaterialTheme.typography.bodyLarge) },
                )
            }
        }
    }
}

/** How strongly the verdict's ink washes its container: enough to read as
 *  its colour, little enough to keep the words at full contrast. */
private const val VERDICT_WASH = 0.12f
