package app.wingtipmaps.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.ProcedureDrawing
import app.wingtipmaps.android.api.generated.ProcedureFix
import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.design.generated.CardAction
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.plan.PlanProcedures
import app.wingtipmaps.android.plan.RouteProcedures
import kotlinx.coroutines.flow.drop

/** How many rows a pick takes on the line: its head and a row a fix. */
fun procedureRows(drawing: ProcedureDrawing?): Int = 1 + RouteProcedures.fixes(drawing).size

/**
 * A procedure picked at a field, its fixes points on the route's magenta
 * line in the order they are flown (the owner's option D, 2026-11-21; the
 * web's TimelineProcedureRows and the iPhone's): an arrival's and an
 * approach's rows before the field's row, a departure's after it. Its
 * head row says the kind and the field in the procedure's indigo, small
 * capitals ("APPROACH · KOSH"), over its name; a tap opens the kind's
 * menu to pick another or none ("just tapping it should show the
 * approaches menu"). Then a row a fix: an indigo ring on the line, its
 * name, the parts it plays under it, its altitude at the end -- the
 * pilot's crossing, else the chart's -- and its menu (⋮): Direct To (Fly
 * as Charted once direct) and Cross at…. Sent direct to one, its ring is
 * filled in the tint and those before it are said skipped. `first` is the
 * head's place in the route's segmented list of `count` rows.
 */
@Composable
fun TimelineProcedureRows(pick: PlanProcedures.Pick, drawing: ProcedureDrawing?, list: ProcedureList?, picks: PlanProcedures.State, first: Int, count: Int, onChanged: () -> Unit, onRemove: () -> Unit, onPlate: () -> Unit) {
    val gap = ListItemDefaults.SegmentedGap
    val fixes = RouteProcedures.fixes(drawing)
    val direct = picks.direct[pick.key]
    val directAt = fixes.indexOfFirst { it.ident == direct }
    val indigo = WingtipColors.Chart.Procedure
    var choosing by rememberSaveable(pick.key) { mutableStateOf(false) }
    // The approach's lesson open, on its Brief (false) or its Dry Run.
    var lesson by rememberSaveable(pick.key) { mutableStateOf<Boolean?>(null) }
    val headThread = rememberThread()
    val said = stringResource(R.string.proc_head_said, kindWord(pick.kind), pick.ident, pick.name)
    SegmentedListItem(
        onClick = { choosing = true },
        shapes = ListItemDefaults.segmentedShapes(index = first, count = count),
        leadingContent = { TimelineMark(headThread) },
        overlineContent = { Text("${kindWord(pick.kind)} · ${pick.ident}".uppercase(), color = indigo, style = MaterialTheme.typography.labelMedium) },
        trailingContent = {
            Box {
                Icon(Icons.Filled.UnfoldMore, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                ProcedureMenu(choosing, { choosing = false }, pick.ident, pick.kind, list, onChanged, onRemove, onLesson = { lesson = it }, onPlate = onPlate)
            }
        },
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = said }.timelineThread(headThread, first = false, last = false, dot = null, gap = gap),
        content = { Text(pick.transition?.let { "${pick.name} · $it" } ?: pick.name) },
    )
    lesson?.let { dryRun -> ApproachLessonSheet(pick, dryRun, onClose = { lesson = null }) }
    fixes.forEachIndexed { i, fix ->
        FixRow(pick, fix, drawing, picks, isDirect = i == directAt, skipped = directAt > i, index = first + 1 + i, count = count, onChanged = onChanged)
    }
}

@Composable
private fun FixRow(pick: PlanProcedures.Pick, fix: ProcedureFix, drawing: ProcedureDrawing?, picks: PlanProcedures.State, isDirect: Boolean, skipped: Boolean, index: Int, count: Int, onChanged: () -> Unit) {
    val thread = rememberThread()
    var menu by rememberSaveable(pick.key, fix.ident) { mutableStateOf(false) }
    var crossing by rememberSaveable(pick.key, fix.ident) { mutableStateOf(false) }
    // A procedure turn at the fix said as the chart shows it (AIM 5-4-9).
    val turn = drawing?.holds.orEmpty().any { it.fix == fix.ident && it.kind == "procedure turn" }
    val state = listOfNotNull(stringResource(R.string.fix_direct_state).takeIf { isDirect }, stringResource(R.string.fix_skipped).takeIf { skipped })
    val roles = fix.roles.filter { it != "hold" } + listOfNotNull(stringResource(R.string.fix_turn).takeIf { turn })
    val sub = (roles + state).joinToString(" · ")
    val own = picks.crossings[fix.ident.uppercase()]
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val tint = MaterialTheme.colorScheme.primary
    SegmentedListItem(
        onClick = { menu = true },
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        leadingContent = { TimelineMark(thread) { FixRing(isDirect, skipped) } },
        supportingContent = if (sub.isEmpty()) null else ({ Text(sub, color = if (isDirect) tint else muted) }),
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val altitude = own?.let { Format.altitude(it.toDouble()) } ?: RouteProcedures.charted(fix)
                altitude?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = if (own != null) tint else muted) }
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(WingtipIcons.more, contentDescription = stringResource(R.string.fix_said_menu, fix.ident), tint = tint)
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        Text(fix.ident, style = MaterialTheme.typography.labelLarge, color = muted, modifier = Modifier.padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm))
                        DropdownMenuItem(
                            text = { Text(if (isDirect) stringResource(R.string.fix_fly_charted, pick.name) else stringResource(R.string.wording_direct_to)) },
                            leadingIcon = { Icon(CardAction.DIRECT_TO.icon, contentDescription = null, tint = tint) },
                            onClick = {
                                menu = false
                                PlanProcedures.setDirect(pick, if (isDirect) null else fix.ident)
                                onChanged()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.fix_cross_at)) },
                            onClick = {
                                menu = false
                                crossing = true
                            },
                        )
                    }
                }
            }
        },
        modifier = Modifier.fillMaxWidth().timelineThread(thread, first = false, last = false, dot = null, gap = ListItemDefaults.SegmentedGap),
        content = { Text(fix.ident, color = if (isDirect) tint else MaterialTheme.colorScheme.onSurface) },
    )
    if (crossing) CrossAtDialog(fix.ident, own, onDone = { crossing = false }, onChanged = onChanged)
}

/** A procedure's fix's mark: an indigo ring, filled in the tint where the
 *  airplane is sent direct to it, grey once skipped. */
@Composable
private fun FixRing(direct: Boolean, skipped: Boolean) {
    val ring = when {
        direct -> MaterialTheme.colorScheme.primary
        skipped -> MaterialTheme.colorScheme.outline
        else -> WingtipColors.Chart.Procedure
    }
    Box(
        Modifier.size(WingtipSpace.Lg)
            .background(if (direct) ring else MaterialTheme.colorScheme.surface, CircleShape)
            .border(BorderStroke(WingtipSpace.Xxs, ring), CircleShape),
    )
}

/**
 * Cross at…: the altitude ATC gave to cross a procedure's fix at, feet
 * above sea level, read by the engine as a pilot types one
 * (altitude_typed: four or five figures, or a flight level's three;
 * nothing guessed), its reason said where it reads none; As Charted takes
 * the pilot's own off. Sent as the planner's `crossings`, which plans the
 * descent to it (drawn_procedures).
 */
@Composable
private fun CrossAtDialog(fix: String, own: Int?, onDone: () -> Unit, onChanged: () -> Unit) {
    val field = rememberSaveable(fix, saver = TextFieldState.Saver) { TextFieldState(own?.toString().orEmpty()) }
    var why by rememberSaveable(fix) { mutableStateOf<String?>(null) }
    // A figure typed again clears what was wrong with the last.
    LaunchedEffect(field) { snapshotFlow { field.text.toString() }.drop(1).collect { why = null } }
    val set = { ft: Int? ->
        PlanProcedures.setCrossing(fix, ft)
        onDone()
        onChanged()
    }
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(stringResource(R.string.fix_cross_title, fix)) },
        text = {
            val reason = why
            Column {
                Text(stringResource(R.string.fix_cross_hint))
                OutlinedTextField(
                    state = field,
                    label = { Text(stringResource(R.string.fix_cross_feet)) },
                    lineLimits = TextFieldLineLimits.SingleLine,
                    isError = why != null,
                    supportingText = if (reason == null) null else ({ Text(reason) }),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                RouteProcedures.crossingTyped(field.text.toString()).fold({ set(it) }, { why = it.message ?: Format.NONE })
            }) { Text(stringResource(R.string.depart_set)) }
        },
        dismissButton = {
            Row {
                if (own != null) TextButton(onClick = { set(null) }) { Text(stringResource(R.string.fix_as_charted), color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDone) { Text(stringResource(R.string.cancel)) }
            }
        },
    )
}
