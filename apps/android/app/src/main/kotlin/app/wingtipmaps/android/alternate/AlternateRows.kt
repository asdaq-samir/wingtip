package app.wingtipmaps.android.alternate

import android.content.Intent
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.altitude.PlanAltitudes
import app.wingtipmaps.android.api.generated.AlternateCheck
import app.wingtipmaps.android.api.generated.Alternates
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle

/**
 * The Brief's Alternate under IFR (AlternateModel), as the web's
 * AlternateSection lays it out: whether the destination needs one, with
 * its TAF as sent; the one filed, how it stands at its minimums for the
 * ETA there, its TAF, its own alternate minimums page and Take It Off;
 * then the alternates that will do, each filed with a tap, and the plan
 * planned again so the leg on to it and its fuel are in the totals.
 * Nothing under VFR.
 */
@Composable
fun AlternateRows(plan: Plan, model: AlternateModel = hiltViewModel()) {
    val planState by plan.state.collectAsStateWithLifecycle()
    val filed by PlanAlternate.filed.collectAsStateWithLifecycle()
    val altitudes by PlanAltitudes.state.collectAsStateWithLifecycle()
    // The way on is flown at the airplane's own cruise, as the web's
    // (nav.aircraft.cruise_tas_kt): none with no airplane, and none taken.
    val where = AlternateModel.where(planState, altitudes.line?.aircraft?.cruiseTasKt, filed)
    LaunchedEffect(where, planState.planning) { if (!planState.planning) model.check(where) }
    val state by model.state.collectAsStateWithLifecycle()
    if (where == null) return
    val file = { ident: String? ->
        PlanAlternate.file(planState.dest, ident)
        plan.plan()
    }
    SectionTitle(stringResource(R.string.alternate))
    val answer = state.answer
    when {
        state.waiting -> Note(stringResource(R.string.alternate_waiting))
        state.loading -> LoadingRow()
        state.problem != null -> ProblemLine(state.problem)
        answer != null -> Answer(answer, where.filed, file)
    }
}

@Composable
private fun Answer(answer: Alternates, filed: String?, file: (String?) -> Unit) {
    val dest = answer.destination
    Group(stringResource(R.string.alternate_destination))
    Line(
        title = stringResource(if (dest.required) R.string.alternate_required else R.string.alternate_not_required),
        about = if (dest.required) dest.reasons.orEmpty().joinToString(" ") else stringResource(R.string.alternate_not_required_why),
        value = Format.ceilingAndVisibility(dest.ceilingFt, dest.visibilitySm),
    )
    // Its TAF as sent, a row of its own.
    dest.taf?.let { Raw(it) } ?: Note(stringResource(R.string.alternate_no_taf))
    answer.alternate?.let { alt ->
        Group(stringResource(R.string.alternate_filed))
        val how = stringResource(if (alt.precision) R.string.alternate_ils else R.string.alternate_nonprecision)
        Line(
            title = alt.ident,
            about = alt.reasons.orEmpty().joinToString(" ").ifEmpty { stringResource(R.string.alternate_filed_why, alt.distanceNm?.let { "%.1f".format(java.util.Locale.US, it) } ?: "—", how) },
            value = AlternateModel.standing(alt),
            under = alt.good == false,
        )
        alt.taf?.let { Raw(it) }
        val context = LocalContext.current
        alt.alternateMinimumsUrl?.let { url ->
            Line(stringResource(R.string.alternate_minimums), action = true) { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) }
        }
        Line(stringResource(R.string.alternate_take_off), action = true) { file(null) }
    }
    // Fields with a TAF within 100 nm, at or above their alternate minimums
    // at the ETA there: 600 ft and 2 sm with an ILS, 800 ft and 2 sm without
    // (14 CFR 91.169(c)), the planner's ranking by the engine's.
    Group(stringResource(R.string.alternate_will_do))
    val suggestions = answer.suggestions.orEmpty().filter { it.ident != filed }
    if (answer.suggestions.isNullOrEmpty()) Line(stringResource(R.string.alternate_none_found), about = stringResource(R.string.alternate_none_found_why))
    suggestions.forEach { s -> Suggestion(s) { file(s.ident) } }
}

@Composable
private fun Suggestion(s: AlternateCheck, onFile: () -> Unit) {
    val how = stringResource(if (s.precision) R.string.alternate_ils_short else R.string.alternate_nonprecision_short)
    Line(
        title = s.ident,
        about = listOfNotNull(s.distanceNm?.let(Format::distance), how, Format.ceilingAndVisibility(s.ceilingFt, s.visibilitySm)).joinToString(" · "),
        value = stringResource(if (s.good == true) R.string.alternate_file else R.string.alternate_check_file),
        action = true,
        onClick = onFile,
    )
}

/** A group's name over its rows, as the web's ListGroup titles them. */
@Composable
private fun Group(name: String) = Text(name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun Note(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

/** A TAF as sent, in a fixed-width face. */
@Composable
private fun Raw(text: String) = Text(text, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)

/** One row, Material's list item: its value at the end, in the tint where
 *  a tap acts, in the error colour where the alternate will not do. */
@Composable
private fun Line(title: String, about: String? = null, value: String? = null, under: Boolean = false, action: Boolean = false, onClick: (() -> Unit)? = null) {
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    val trailing: (@Composable () -> Unit)? = value?.let {
        {
            Text(
                it,
                color = when {
                    under -> MaterialTheme.colorScheme.error
                    action -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                },
                fontWeight = if (under) FontWeight.SemiBold else null,
            )
        }
    }
    val supporting: (@Composable () -> Unit)? = about?.let { { Text(it) } }
    val headline = @Composable { Text(title, color = if (action && value == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) }
    if (onClick != null) ListItem(onClick = onClick, colors = colors, supportingContent = supporting, trailingContent = trailing, content = headline)
    else ListItem(colors = colors, supportingContent = supporting, trailingContent = trailing, content = headline)
}
