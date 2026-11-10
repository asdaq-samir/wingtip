package app.wingtipmaps.android.emergency

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.AnnounceOnce
import app.wingtipmaps.android.ui.BriefModel
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.largeType
import app.wingtipmaps.android.ui.sheet.FlexibleSheet

/**
 * The emergency assistant, one sheet over the map (the web's
 * EmergencySheet): the best fields within a glide, the airplane's own
 * checklist opened at the emergency, and the transponder, the radio, the
 * MAYDAY and the phones. Opened from flying mode's Emergency, the pilot's
 * own words and the emergency checklists, never a map button (decision
 * 0010).
 *
 * Android's idiom: a page at the whole height under a medium flexible top
 * bar titled Emergency with Close (FlexibleSheet), on Material's standard
 * motion scheme rather than the app's expressive one, so nothing on it
 * bounces or delays what the pilot reads.
 */
@Composable
fun EmergencySheet(
    state: EmergencyModel.State,
    model: EmergencyModel,
    onShowPosition: () -> Unit,
    onClose: () -> Unit,
    askGlide: @Composable () -> Unit = {},
    airplanePicker: @Composable () -> Unit = {},
) {
    MaterialTheme(motionScheme = MotionScheme.standard()) {
        FlexibleSheet(title = stringResource(R.string.emergency), onClose = onClose) { padding ->
            Column(
                Modifier.fillMaxWidth().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
            ) {
                FieldsList(state, model::pick, onShowPosition, askGlide)
                // No airplane: general guidance and the picker, never an
                // airplane's checklist (NoAirplaneGuidance).
                if (state.guidance.isNotEmpty()) NoAirplaneGuidance(state, airplanePicker) else EmergencyChecklist(state, model::pickSection, model::tick)
                ActionsList(state, model::souls, model::fuel)
            }
        }
    }
}

/**
 * The best fields from where the airplane is, in the engine's order
 * (reach, then the runway against the handbook, then the distance), a tap
 * picking the one the MAYDAY names. Each row: the heading to fly and how
 * far, and the engine's reasons under it, the reach first in its tone.
 * Nothing is hidden for a limitation; it is said.
 */
@Composable
private fun FieldsList(state: EmergencyModel.State, onPick: (String) -> Unit, onShowPosition: () -> Unit, askGlide: @Composable () -> Unit) {
    val ranked = state.ranked
    if (state.fix == null) {
        SectionTitle(stringResource(R.string.best_fields))
        ListItem(
            onClick = onShowPosition,
            supportingContent = { Text(stringResource(R.string.show_my_position_line)) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(stringResource(R.string.show_my_position), color = MaterialTheme.colorScheme.primary) },
        )
        return
    }
    val glide = ranked?.glide
    SectionTitle(if (glide != null) stringResource(R.string.best_fields_glide, glide.stillAirNm.toInt()) else stringResource(R.string.best_fields))
    if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
    ProblemLine(state.problem)
    // An airplane without its glide ratio: asked for here, nearest first
    // meanwhile; with none, the guidance below has the picker.
    if (ranked?.needsAirplane == true && state.guidance.isEmpty()) askGlide()
    val fields = ranked?.fields.orEmpty()
    // The best field said at once, and again only when another becomes
    // the best: the rows' miles change with every fix, so they are not a
    // live region.
    val best = fields.firstOrNull()
    AnnounceOnce(best?.ident, best?.let { stringResource(R.string.said_best_field, it.ident, fieldWords(it)) })
    fields.forEachIndexed { i, f -> FieldRow(f, picked = state.picked?.ident == f.ident, best = i == 0) { onPick(f.ident) } }
}

/** A field's way and distance said: the heading magnetic, or true where
 *  the engine has no variation for it (AIM 4-2-10), and the miles. */
private fun fieldWords(f: EngineContract.BestField): String = listOfNotNull(
    f.headingMagDeg?.let { "heading " + Spoken.headingMagnetic(it) } ?: f.headingTrueDeg?.let { "heading " + Spoken.headingTrue(it) },
    Spoken.distance(f.distanceNm),
).joinToString(", ")

@Composable
private fun FieldRow(f: EngineContract.BestField, picked: Boolean, best: Boolean, onPick: () -> Unit) {
    val heading = f.headingMagDeg ?: f.headingTrueDeg
    val ink = LocalInk.current
    // Read as one: the field, its way and miles in words, then the
    // engine's reasons, rather than "270 degree dot 8.3 n m".
    val said = (listOf(f.ident, f.name, fieldWords(f)) + f.reasons.map { it.text }).joinToString(", ")
    ListItem(
        selected = picked,
        onClick = onPick,
        leadingContent = { RadioButton(selected = picked, onClick = null) },
        supportingContent = {
            Column {
                f.reasons.forEachIndexed { i, r ->
                    val lead = i == 0 && f.reach != "unknown"
                    val finding = BriefModel.finding(r.tone)
                    // Nothing smaller than a body line here: it is read
                    // under stress, at arm's length.
                    Text(
                        r.text, style = MaterialTheme.typography.bodyLarge,
                        color = if (lead || r.tone != "ok") ink.words(finding, MaterialTheme.colorScheme.onSurfaceVariant) else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (lead) FontWeight.SemiBold else null,
                    )
                }
            }
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                Icon(Icons.Filled.Navigation, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.rotate(f.courseDeg.toFloat()))
                Text(
                    listOfNotNull(heading?.let { Format.heading(it) + if (f.headingMagDeg == null) " T" else "" }, Format.distance(f.distanceNm)).joinToString(" · "),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.semantics { contentDescription = said },
        content = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                // The engine's pick, the first row, is the one figure this
                // page is about: Material's emphasized headline.
                Text(f.ident, style = if (best) MaterialTheme.typography.headlineMediumEmphasized else MaterialTheme.typography.titleMedium, fontWeight = if (best) null else FontWeight.SemiBold)
                Text(f.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, maxLines = if (largeType()) 3 else 1)
            }
        },
    )
}
