package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.api.generated.ProcedureSummary
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.plan.LandingRunway
import app.wingtipmaps.android.plan.PlanProcedures
import app.wingtipmaps.android.plan.PlateCircling
import app.wingtipmaps.android.plan.RouteFieldFacts

/**
 * A field's runways and the kinds of procedure not picked, under its row
 * on the plan's line once its card says it is open (decision 0043: never
 * offered to land by before), as the web's PartTray and the iPhone's
 * TimelineFieldParts: "Land RWY 24" and "Takeoff RWY 06", each a menu of
 * the field's runway ends with Into the Wind first (the one its report's
 * wind picks, which the planner flies where none is picked); then "+ ARR",
 * "+ APCH" and "+ DEP" for each kind the field publishes and the route has
 * none of, each a menu of its procedures. With an approach picked the
 * landing's chip is the approach's own runway (LandingRunway, the
 * engine's landing_runway). A stop lands and leaves, so it
 * has both, its landing's first. Material's assist chips, each opening
 * Material's dropdown menu. A picked kind is no chip: its fixes are rows
 * on the line (TimelineProcedureRows).
 */
@Composable
fun TimelineFieldParts(ident: String, lands: Boolean, leaves: Boolean, facts: RouteFieldFacts.Facts?, list: ProcedureList?, picks: PlanProcedures.State, onChanged: () -> Unit) {
    if (facts == null || !facts.open) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), itemVerticalAlignment = Alignment.CenterVertically) {
        if (lands) {
            // With an approach picked, the runway it lands on, the
            // engine's (LandingRunway); another only where the rule allows,
            // which its plate's circling minimums decide (PlateCircling,
            // asked as the approach is picked, the web's plate query).
            val approachId = PlanProcedures.at(picks, ident, listOf("approach")).firstOrNull()?.id
            LaunchedEffect(ident, approachId) { approachId?.let { PlateCircling.shared.ask(ident, it) } }
            val circling by PlateCircling.shared.known.collectAsStateWithLifecycle()
            val landing = LandingRunway.at(picks, ident, list, circling)
            RunwayChip(ident, facts, landing?.runway ?: picks.landings[ident.uppercase()], takeoff = false, onChanged, onlyEnd = landing?.takeIf { !it.othersAllowed }?.runway)
            KindChips(ident, PlanProcedures.ARRIVING, list, picks, onChanged)
        }
        if (leaves) {
            RunwayChip(ident, facts, picks.takeoffs[ident.uppercase()], takeoff = true, onChanged)
            KindChips(ident, PlanProcedures.LEAVING, list, picks, onChanged)
        }
    }
}

/** The runway menu, its label the runway picked or the wind's. */
@Composable
private fun RunwayChip(ident: String, facts: RouteFieldFacts.Facts, picked: String?, takeoff: Boolean, onChanged: () -> Unit, onlyEnd: String? = null) {
    if (facts.ends.isEmpty()) return
    var open by rememberSaveable(ident, takeoff) { mutableStateOf(false) }
    val shown = picked ?: facts.windEnd ?: Format.NONE
    val said = stringResource(if (takeoff) R.string.runway_takeoff_said else R.string.runway_land_said, ident)
    val set = { end: String? ->
        open = false
        PlanProcedures.setRunway(ident, end, takeoff)
        onChanged()
    }
    Box {
        AssistChip(
            onClick = { open = true },
            label = { Text(stringResource(if (takeoff) R.string.runway_takeoff else R.string.runway_land, shown)) },
            modifier = Modifier.semantics { contentDescription = "$said, $shown" },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            // An approach's own runway alone, straight in: no wind's pick.
            if (onlyEnd == null) {
                DropdownMenuItem(
                    text = { Text(facts.windEnd?.let { stringResource(R.string.runway_into_wind, it) } ?: stringResource(R.string.runway_into_wind_plain)) },
                    leadingIcon = { if (picked == null) Icon(Icons.Filled.Check, contentDescription = null) },
                    onClick = { set(null) },
                )
                HorizontalDivider()
            }
            facts.ends.filter { onlyEnd == null || it == onlyEnd }.forEach { end ->
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.runway_end, end)) },
                    leadingIcon = { if (picked == end) Icon(Icons.Filled.Check, contentDescription = null) },
                    onClick = { set(end) },
                )
            }
        }
    }
}

/** "+ APCH" and the rest: each kind the field has and none is picked of. */
@Composable
private fun KindChips(ident: String, kinds: List<String>, list: ProcedureList?, picks: PlanProcedures.State, onChanged: () -> Unit) {
    list ?: return
    kinds.filter { kind -> list.procedures.any { it.kind == kind } && PlanProcedures.at(picks, ident, listOf(kind)).isEmpty() }.forEach { kind ->
        key(kind) { KindChip(ident, kind, list, onChanged) }
    }
}

@Composable
private fun KindChip(ident: String, kind: String, list: ProcedureList, onChanged: () -> Unit) {
    var open by rememberSaveable(ident, kind) { mutableStateOf(false) }
    val said = stringResource(R.string.proc_add_said, kindAsk(kind), ident)
    Box {
        AssistChip(
            onClick = { open = true },
            label = { Text(stringResource(R.string.proc_add, kindShort(kind))) },
            modifier = Modifier.semantics { contentDescription = said },
        )
        ProcedureMenu(open, { open = false }, ident, kind, list, onChanged)
    }
}

/**
 * A field's procedures of one kind as a menu, the FAA's for the field:
 * None first, then each by its chart's name, and a procedure with
 * transitions opening them in the menu's place ("As published", then each
 * "BAE transition", Back to the list), as the iPhone's submenus. The same
 * menu wherever a kind is picked: the "+" chips and a picked one's head row.
 */
@Composable
fun ProcedureMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    ident: String,
    kind: String,
    list: ProcedureList?,
    onChanged: () -> Unit,
    onRemove: (() -> Unit)? = null,
    onLesson: ((dryRun: Boolean) -> Unit)? = null,
    onPlate: (() -> Unit)? = null,
) {
    var transitionsOf by remember(expanded) { mutableStateOf<ProcedureSummary?>(null) }
    val take = { procedure: ProcedureSummary?, transition: String? ->
        onDismiss()
        // None on a picked one's row takes it off with an Undo (onRemove).
        if (procedure == null && onRemove != null) {
            onRemove()
        } else {
            PlanProcedures.pick(ident, kind, procedure?.let { PlanProcedures.Pick(ident.uppercase(), it.id, kind, it.name, transition) })
            // An approach picked lands on its own runway, the field's landing
            // kept in step with it, so the planner flies the same (the web's pick).
            if (kind == "approach") LandingRunway.at(PlanProcedures.state.value, ident, list)?.runway?.let { PlanProcedures.setRunway(ident, it, takeoff = false) }
            onChanged()
        }
    }
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        val shown = transitionsOf
        if (shown == null) {
            DropdownMenuItem(text = { Text(stringResource(R.string.proc_none)) }, onClick = { take(null, null) })
            list?.procedures.orEmpty().filter { it.kind == kind }.forEach { procedure ->
                DropdownMenuItem(
                    text = { Text(procedure.name) },
                    onClick = { if (procedure.transitions.isEmpty()) take(procedure, null) else transitionsOf = procedure },
                )
            }
            // A picked approach's lesson and plate, as the iPhone's
            // ApproachMenuItems: Approach Brief, Dry Run, Plate.
            if (kind == "approach" && onLesson != null) {
                HorizontalDivider()
                DropdownMenuItem(text = { Text(stringResource(R.string.proc_approach_brief)) }, onClick = { onDismiss(); onLesson(false) })
                DropdownMenuItem(text = { Text(stringResource(R.string.wording_dry_run)) }, onClick = { onDismiss(); onLesson(true) })
                onPlate?.let { plate -> DropdownMenuItem(text = { Text(stringResource(R.string.proc_plate)) }, onClick = { onDismiss(); plate() }) }
            }
        } else {
            DropdownMenuItem(text = { Text(stringResource(R.string.proc_back)) }, onClick = { transitionsOf = null })
            HorizontalDivider()
            DropdownMenuItem(text = { Text(stringResource(R.string.proc_as_published)) }, onClick = { take(shown, null) })
            shown.transitions.forEach { t ->
                DropdownMenuItem(text = { Text(stringResource(R.string.proc_transition, t)) }, onClick = { take(shown, t) })
            }
        }
    }
}

/** A kind's word over a picked one's name ("Approach"). */
@Composable
fun kindWord(kind: String): String = stringResource(
    when (kind) {
        "approach" -> R.string.proc_kind_approach
        "arrival" -> R.string.proc_kind_arrival
        else -> R.string.proc_kind_departure
    },
)

/** Its short form on the chip that adds one ("APCH"). */
@Composable
private fun kindShort(kind: String): String = stringResource(
    when (kind) {
        "approach" -> R.string.proc_short_approach
        "arrival" -> R.string.proc_short_arrival
        else -> R.string.proc_short_departure
    },
)

/** How TalkBack asks for one ("an approach"). */
@Composable
private fun kindAsk(kind: String): String = stringResource(
    when (kind) {
        "approach" -> R.string.proc_ask_approach
        "arrival" -> R.string.proc_ask_arrival
        else -> R.string.proc_ask_departure
    },
)
